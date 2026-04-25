// Copyright (C) 2026 embsign AB
// SPDX-License-Identifier: AGPL-3.0-only

import type { Env } from "./types.js";

const lastSeenKey = (screenId: string) => `v1:ls:${screenId}`;
const LAST_SEEN_WRITE_INTERVAL_MS = 4 * 60 * 60 * 1000;
const inMemoryLastSeenWriteAtMs = new Map<string, number>();

export const recordScreenLastSeen = async (env: Env, screenId: string, atIso: string): Promise<void> => {
  const kv = env.KIOSK_EDGE_KV;
  if (!kv) {
    return;
  }
  try {
    const currentTs = Date.parse(atIso);
    const lastInMemoryTs = inMemoryLastSeenWriteAtMs.get(screenId);
    if (
      Number.isFinite(currentTs) &&
      typeof lastInMemoryTs === "number" &&
      currentTs - lastInMemoryTs < LAST_SEEN_WRITE_INTERVAL_MS
    ) {
      return;
    }

    const key = lastSeenKey(screenId);
    const existing = await kv.get(key, "text");
    if (existing) {
      const existingTs = Date.parse(existing);
      if (Number.isFinite(currentTs) && Number.isFinite(existingTs)) {
        const elapsedMs = currentTs - existingTs;
        if (elapsedMs < LAST_SEEN_WRITE_INTERVAL_MS) {
          inMemoryLastSeenWriteAtMs.set(screenId, existingTs);
          return;
        }
      }
    }
    await kv.put(key, atIso);
    if (Number.isFinite(currentTs)) {
      inMemoryLastSeenWriteAtMs.set(screenId, currentTs);
    }
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
    const values = await Promise.all(screenIds.map((id) => kv.get(lastSeenKey(id), "text")));
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
