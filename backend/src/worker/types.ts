// Copyright (C) 2026 embsign AB
// SPDX-License-Identifier: AGPL-3.0-only

export type D1Database = {
  prepare: (sql: string) => {
    bind: (...args: unknown[]) => {
      first: () => Promise<any>;
      all: () => Promise<{ results: any[] }>;
      run: () => Promise<any>;
    };
  };
  exec: (sql: string) => Promise<any>;
  withSession?: (bookmark?: string) => D1DatabaseSession;
};

export type D1DatabaseSession = D1Database & {
  getBookmark?: () => string | null;
};

/** Workers KV (kiosk last_seen + poll-auth-cache; RFID abuse — olika bindings, samma typ). */
export type KVNamespace = {
  get(key: string, type?: "text"): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
};

export type R2ObjectBody = {
  body: ReadableStream;
  httpEtag?: string;
  size?: number;
  uploaded?: Date;
};

export type R2Bucket = {
  get(key: string): Promise<R2ObjectBody | null>;
};

export interface Env {
  DB: D1Database;
  KIOSK_EDGE_KV?: KVNamespace;
  /** TTL i sekunder för poll-auth-cache i KV (standard 30, max 300, min 5). */
  KIOSK_POLL_AUTH_CACHE_TTL_SECONDS?: string;
  FORCE_NOW_UTC?: string;
  DEBUG_AVAILABILITY_DELAY_MS?: string;
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
  FRONTEND_BASE_URL?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET?: string;
  /** Senaste rekommenderade Android-kioskversion (visas för skärmar). */
  KIOSK_LATEST_ANDROID_VERSION?: string;
  /** URL till APK eller releasesida. */
  KIOSK_ANDROID_DOWNLOAD_URL?: string;
  /** Frivillig kort text till skärm (t.ex. om uppdatering). */
  KIOSK_UPDATE_MESSAGE_SV?: string;
  /** Rate limit / global attack-läge för RFID-auth; eget KV-namespace. */
  RFID_ABUSE_KV?: KVNamespace;
  /** Privat R2-bucket för signerade Android APK-releaser. */
  ANDROID_APK_R2?: R2Bucket;
}
