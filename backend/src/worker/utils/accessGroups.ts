// Copyright (C) 2026 embsign AB
// SPDX-License-Identifier: AGPL-3.0-only

import { D1Database } from "../types.js";

export const listAccessGroups = async (db: D1Database, tenantId: string) => {
  const rows = await db
    .prepare("SELECT id, name FROM access_groups WHERE tenant_id = ? ORDER BY name ASC")
    .bind(tenantId)
    .all();
  return rows.results.map((row: any) => ({ id: row.id, name: row.name }));
};

export const createAccessGroup = async (db: D1Database, tenantId: string, name: string) => {
  const existing = await db
    .prepare("SELECT id, name FROM access_groups WHERE tenant_id = ? AND name = ?")
    .bind(tenantId, name)
    .first();
  if (existing) {
    return { id: existing.id, name: existing.name };
  }
  const id = `group-${crypto.randomUUID()}`;
  await db.prepare("INSERT INTO access_groups (id, tenant_id, name) VALUES (?, ?, ?)")
    .bind(id, tenantId, name)
    .run();
  return { id, name };
};
