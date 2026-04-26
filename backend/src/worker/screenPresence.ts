// Copyright (C) 2026 embsign AB
// SPDX-License-Identifier: AGPL-3.0-only

import type { Env } from "./types.js";

/** Cloudflare Workers Cache API (inte i standard DOM-typer när `types` bara är `node`). */
const getWorkersDefaultCache = (): Cache | undefined => {
  const c = globalThis.caches as CacheStorage & { default?: Cache };
  return c.default;
};

const lastSeenKey = (screenId: string) => `v1:ls:${screenId}`;
const LAST_SEEN_WRITE_INTERVAL_MS = 4 * 60 * 60 * 1000;
const LAST_SEEN_CACHE_MAX_SECONDS = Math.ceil(LAST_SEEN_WRITE_INTERVAL_MS / 1000);

const inMemoryLastSeenWriteAtMs = new Map<string, number>();

const normalizeScreenId = (screenId: string) => String(screenId ?? "").trim();

/** Colo-lokal throttle via Workers `caches.default` (= CDN edge-cache för den zonen). */
const buildLastSeenColoThrottleRequest = (origin: string, screenId: string) =>
  new Request(
    `${origin.replace(/\/$/, "")}/__bokningsportal/internal/kiosk-last-seen/${encodeURIComponent(screenId)}`,
    { method: "GET", headers: { Accept: "text/plain" } }
  );

const readLastSeenColoThrottle = async (
  cacheOrigin: string | undefined,
  screenId: string
): Promise<{ atIso: string; atMs: number } | null> => {
  if (!cacheOrigin) {
    return null;
  }
  try {
    const cache = getWorkersDefaultCache();
    if (!cache) {
      return null;
    }
    const req = buildLastSeenColoThrottleRequest(cacheOrigin, screenId);
    const hit = await cache.match(req);
    if (!hit) {
      return null;
    }
    const atIso = (await hit.text()).trim();
    if (!atIso) {
      return null;
    }
    const atMs = Date.parse(atIso);
    if (!Number.isFinite(atMs)) {
      return null;
    }
    return { atIso, atMs };
  } catch {
    return null;
  }
};

const writeLastSeenColoThrottle = async (
  cacheOrigin: string | undefined,
  screenId: string,
  atIso: string
): Promise<void> => {
  if (!cacheOrigin) {
    return;
  }
  try {
    const cache = getWorkersDefaultCache();
    if (!cache) {
      return;
    }
    const req = buildLastSeenColoThrottleRequest(cacheOrigin, screenId);
    const res = new Response(atIso, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": `max-age=${LAST_SEEN_CACHE_MAX_SECONDS}`,
      },
    });
    await cache.put(req, res);
  } catch (err) {
    console.error("last_seen colo throttle cache put error", err);
  }
};

/**
 * @param cacheOrigin — `new URL(request.url).origin` från HTTP-handlern. Med Cache API (`caches.default`, edge-cache)
 *   slipper vi KV `get` på den varma vägen; utan origin eller utan `caches.default` (t.ex. vissa lokala körningar) används KV get/put.
 */
export const recordScreenLastSeen = async (
  env: Env,
  screenId: string,
  atIso: string,
  cacheOrigin?: string
): Promise<void> => {
  const kv = env.KIOSK_EDGE_KV;
  if (!kv) {
    return;
  }
  const sid = normalizeScreenId(screenId);
  if (!sid) {
    return;
  }
  try {
    const currentTs = Date.parse(atIso);
    if (!Number.isFinite(currentTs)) {
      return;
    }

    const lastInMemoryTs = inMemoryLastSeenWriteAtMs.get(sid);
    if (
      typeof lastInMemoryTs === "number" &&
      currentTs - lastInMemoryTs < LAST_SEEN_WRITE_INTERVAL_MS
    ) {
      return;
    }

    const edgeCache = getWorkersDefaultCache();
    const canUseEdgeThrottle = Boolean(cacheOrigin && edgeCache);

    const colo = canUseEdgeThrottle ? await readLastSeenColoThrottle(cacheOrigin, sid) : null;
    if (colo && currentTs - colo.atMs < LAST_SEEN_WRITE_INTERVAL_MS) {
      inMemoryLastSeenWriteAtMs.set(sid, colo.atMs);
      return;
    }

    const key = lastSeenKey(sid);

    if (canUseEdgeThrottle) {
      await kv.put(key, atIso);
      inMemoryLastSeenWriteAtMs.set(sid, currentTs);
      await writeLastSeenColoThrottle(cacheOrigin, sid, atIso);
      return;
    }

    const existing = await kv.get(key, "text");
    if (existing) {
      const trimmed = existing.trim();
      if (trimmed) {
        const existingTs = Date.parse(trimmed);
        if (Number.isFinite(existingTs)) {
          const elapsedMs = currentTs - existingTs;
          if (elapsedMs < LAST_SEEN_WRITE_INTERVAL_MS) {
            inMemoryLastSeenWriteAtMs.set(sid, existingTs);
            await writeLastSeenColoThrottle(cacheOrigin, sid, trimmed);
            return;
          }
        } else {
          inMemoryLastSeenWriteAtMs.set(sid, currentTs);
          return;
        }
      }
    }
    await kv.put(key, atIso);
    inMemoryLastSeenWriteAtMs.set(sid, currentTs);
    await writeLastSeenColoThrottle(cacheOrigin, sid, atIso);
  } catch (err) {
    console.error("KIOSK_EDGE_KV last_seen put error", err);
  }
};

export const batchGetScreenLastSeen = async (
  env: Env,
  screenIds: string[]
): Promise<Record<string, string | null>> => {
  const empty = Object.fromEntries(screenIds.map((id) => [id, null])) as Record<string, string | null>;
  const kv = env.KIOSK_EDGE_KV;
  if (!screenIds.length || !kv) {
    return empty;
  }
  try {
    const values = await Promise.all(screenIds.map((id) => kv.get(lastSeenKey(normalizeScreenId(id)), "text")));
    const map: Record<string, string | null> = { ...empty };
    screenIds.forEach((id, i) => {
      const v = values[i];
      map[id] = v != null && v !== "" ? v : null;
    });
    return map;
  } catch (err) {
    console.error("KIOSK_EDGE_KV last_seen batch get error", err);
    return empty;
  }
};
