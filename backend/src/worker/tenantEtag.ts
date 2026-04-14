// Copyright (C) 2026 embsign AB
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * ETag for tenant-scoped GET responses: derived from tenants.last_changed_at (via SHA-256 prefix).
 * Clients send If-None-Match → 304 when the tenant version is unchanged.
 */

export type TenantEtagSource = { id: string; last_changed_at: string };

export const buildTenantEntityTag = async (tenantId: string, lastChangedAt: string): Promise<string> => {
  const input = new TextEncoder().encode(`${tenantId}\n${lastChangedAt}`);
  const buf = await crypto.subtle.digest("SHA-256", input);
  const hex = Array.from(new Uint8Array(buf).slice(0, 16))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `"${hex}"`;
};

export const ifNoneMatchMatches = (request: Request, etag: string): boolean => {
  const raw = request.headers.get("if-none-match");
  if (!raw) return false;
  for (const part of raw.split(",")) {
    const v = part.trim();
    if (v === "*" || v === etag) return true;
    if (v === `W/${etag}`) return true;
  }
  return false;
};

const CACHE_CONTROL = "private, no-cache";

export const withTenantConditionalJson = async (
  request: Request,
  tenant: TenantEtagSource,
  data: unknown
): Promise<Response> => {
  const etag = await buildTenantEntityTag(tenant.id, tenant.last_changed_at);
  if (ifNoneMatchMatches(request, etag)) {
    return new Response(null, { status: 304, headers: { etag, "cache-control": CACHE_CONTROL } });
  }
  const headers = new Headers();
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", CACHE_CONTROL);
  headers.set("etag", etag);
  return new Response(JSON.stringify(data), { headers });
};

export const withTenantConditionalBody = async (
  request: Request,
  tenant: TenantEtagSource,
  contentType: string,
  buildBody: () => string | Promise<string>,
  extraHeaders?: Record<string, string>
): Promise<Response> => {
  const etag = await buildTenantEntityTag(tenant.id, tenant.last_changed_at);
  if (ifNoneMatchMatches(request, etag)) {
    const headers = new Headers();
    headers.set("etag", etag);
    headers.set("cache-control", CACHE_CONTROL);
    if (extraHeaders) {
      Object.entries(extraHeaders).forEach(([k, v]) => headers.set(k, v));
    }
    return new Response(null, { status: 304, headers });
  }
  const body = await buildBody();
  const headers = new Headers();
  headers.set("content-type", contentType);
  headers.set("etag", etag);
  headers.set("cache-control", CACHE_CONTROL);
  if (extraHeaders) {
    Object.entries(extraHeaders).forEach(([k, v]) => headers.set(k, v));
  }
  return new Response(body, { headers });
};
