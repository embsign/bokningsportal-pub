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

export interface Env {
  DB: D1Database;
  FORCE_NOW_UTC?: string;
  DEBUG_AVAILABILITY_DELAY_MS?: string;
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
  FRONTEND_BASE_URL?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET?: string;
}
