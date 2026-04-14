// Copyright (C) 2026 embsign AB
// SPDX-License-Identifier: AGPL-3.0-only

let accessToken = null;
let d1Bookmark = null;

/** GET-svar med ETag: minskar mobil data när servern svarar 304. */
const etagCache = new Map();

export const setAccessToken = (token) => {
  accessToken = token || null;
  d1Bookmark = null;
  etagCache.clear();
};

export const getAccessToken = () => accessToken;

/** Rensa villkorlig cache (t.ex. vid utloggning eller om du vill tvinga omhämtning). */
export const clearApiEtagCache = () => {
  etagCache.clear();
};

const clonePayload = (value) => {
  if (value === null || typeof value !== "object") {
    return value;
  }
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
};

const parseError = async (response) => {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const data = await response.json();
    return data?.detail || "internal_error";
  }
  return "internal_error";
};

export const getApiBase = () => "/api";

export const apiRequest = async (path, options = {}) => {
  const base = getApiBase();
  const method = String(options.method || "GET").toUpperCase();
  const headers = new Headers(options.headers || {});
  if (accessToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  if (d1Bookmark && !headers.has("x-d1-bookmark")) {
    headers.set("x-d1-bookmark", d1Bookmark);
  }
  if (options.body && !headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const cacheKey = `${method}:${path}`;
  const useEtag =
    method === "GET" &&
    !options.skipEtag &&
    !headers.has("If-None-Match") &&
    etagCache.has(cacheKey);

  if (useEtag) {
    const { etag } = etagCache.get(cacheKey);
    if (etag) {
      headers.set("If-None-Match", etag);
    }
  }

  const fetchOptions = {
    ...options,
    method,
    headers,
  };
  if (method === "GET" && fetchOptions.cache === undefined) {
    fetchOptions.cache = "no-store";
  }
  const response = await fetch(`${base}${path}`, fetchOptions);
  const bookmarkFromResponse = response.headers.get("x-d1-bookmark");
  if (bookmarkFromResponse) {
    d1Bookmark = bookmarkFromResponse;
  }

  if (response.status === 304) {
    const hit = etagCache.get(cacheKey);
    if (hit) {
      return clonePayload(hit.payload);
    }
    const err = new Error("stale_cache");
    err.status = 304;
    throw err;
  }

  const mutates = method !== "GET" && method !== "HEAD";
  if (mutates && response.ok) {
    etagCache.clear();
  }

  if (!response.ok) {
    const detail = await parseError(response);
    const error = new Error(detail);
    error.status = response.status;
    error.detail = detail;
    throw error;
  }

  const contentType = response.headers.get("content-type") || "";
  const etag = response.headers.get("etag");

  if (method === "GET" && !etag) {
    etagCache.delete(cacheKey);
  }

  if (contentType.includes("application/json")) {
    const data = await response.json();
    if (method === "GET" && etag) {
      etagCache.set(cacheKey, { etag, payload: clonePayload(data) });
    }
    return data;
  }

  const text = await response.text();
  if (method === "GET" && etag) {
    etagCache.set(cacheKey, { etag, payload: text });
  }
  return text;
};
