// Copyright (C) 2026 embsign AB
// SPDX-License-Identifier: AGPL-3.0-only

import { router } from "../../../backend/src/worker/router.js";
import { D1DatabaseSession, Env } from "../../../backend/src/worker/types.js";

const getCorsHeaders = (request: Request) => {
  const origin = request.headers.get("origin");
  if (!origin) {
    return null;
  }
  const requestHeaders = request.headers.get("access-control-request-headers");
  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  headers.set("Access-Control-Allow-Headers", requestHeaders || "Content-Type");
  headers.set("Access-Control-Max-Age", "86400");
  headers.set("Vary", "Origin");
  return headers;
};

const withCors = (request: Request, response: Response) => {
  const corsHeaders = getCorsHeaders(request);
  if (!corsHeaders) {
    return response;
  }
  const headers = new Headers(response.headers);
  corsHeaders.forEach((value, key) => headers.set(key, value));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

const withD1Bookmark = (response: Response, db: D1DatabaseSession | null) => {
  if (!db?.getBookmark) {
    return response;
  }
  const bookmark = db.getBookmark();
  if (!bookmark) {
    return response;
  }
  const headers = new Headers(response.headers);
  headers.set("x-d1-bookmark", bookmark);
  headers.set("x-d1-bookmark-version", "1");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

const getSessionDb = (request: Request, env: Env): D1DatabaseSession | null => {
  const withSession = env.DB?.withSession;
  if (typeof withSession !== "function") {
    return null;
  }
  const bookmark = request.headers.get("x-d1-bookmark") || "first-unconstrained";
  try {
    return withSession(bookmark);
  } catch {
    return withSession("first-unconstrained");
  }
};

export const onRequest = async (context: { request: Request; env: Env }) => {
  const { request, env } = context;
  const sessionDb = getSessionDb(request, env);

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(request) || undefined,
    });
  }

  try {
    const routerEnv = sessionDb ? ({ ...env, DB: sessionDb } as Env) : env;
    const response =
      (await router(request, routerEnv)) ||
      new Response(JSON.stringify({ detail: "internal_error" }), {
        status: 500,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    return withCors(request, withD1Bookmark(response, sessionDb));
  } catch {
    const response = new Response(JSON.stringify({ detail: "internal_error" }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
    return withCors(request, withD1Bookmark(response, sessionDb));
  }
};
