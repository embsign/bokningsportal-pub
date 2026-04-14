// Copyright (C) 2026 embsign AB
// SPDX-License-Identifier: AGPL-3.0-only

import migration001 from "../../../../db/migrations/001_initial_schema.sql";
import migration002 from "../../../../db/migrations/002_tenant_last_changed.sql";
import seedSql from "../../../../db/seed.sql";
import { D1Database } from "../types.js";

let initialized = false;
let initializationPromise: Promise<void> | null = null;

export const initDb = async (db: D1Database) => {
  if (initialized) {
    return;
  }
  if (initializationPromise) {
    await initializationPromise;
    return;
  }

  initializationPromise = (async () => {
    const schemaExists = await db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tenants'")
      .bind()
      .first();

    if (!schemaExists) {
      await db.exec(migration001);
    }

    const setupSaltRow = await db
      .prepare("SELECT value FROM app_config WHERE key = ?")
      .bind("setup_link_salt")
      .first();
    if (!setupSaltRow) {
      const salt = crypto.randomUUID();
      await db
        .prepare("INSERT INTO app_config (key, value) VALUES (?, ?)")
        .bind("setup_link_salt", salt)
        .run();
    }

    const fullDayStartColumn = await db
      .prepare("SELECT name FROM pragma_table_info('booking_objects') WHERE name = ?")
      .bind("full_day_start_time")
      .first();
    if (!fullDayStartColumn) {
      await db.exec("ALTER TABLE booking_objects ADD COLUMN full_day_start_time TEXT NOT NULL DEFAULT '12:00';");
    }

    const fullDayEndColumn = await db
      .prepare("SELECT name FROM pragma_table_info('booking_objects') WHERE name = ?")
      .bind("full_day_end_time")
      .first();
    if (!fullDayEndColumn) {
      await db.exec("ALTER TABLE booking_objects ADD COLUMN full_day_end_time TEXT NOT NULL DEFAULT '12:00';");
    }

    const timeSlotStartColumn = await db
      .prepare("SELECT name FROM pragma_table_info('booking_objects') WHERE name = ?")
      .bind("time_slot_start_time")
      .first();
    if (!timeSlotStartColumn) {
      await db.exec("ALTER TABLE booking_objects ADD COLUMN time_slot_start_time TEXT NOT NULL DEFAULT '08:00';");
    }

    const timeSlotEndColumn = await db
      .prepare("SELECT name FROM pragma_table_info('booking_objects') WHERE name = ?")
      .bind("time_slot_end_time")
      .first();
    if (!timeSlotEndColumn) {
      await db.exec("ALTER TABLE booking_objects ADD COLUMN time_slot_end_time TEXT NOT NULL DEFAULT '20:00';");
    }

    const tenantLastChangedColumn = await db
      .prepare("SELECT name FROM pragma_table_info('tenants') WHERE name = ?")
      .bind("last_changed_at")
      .first();
    if (!tenantLastChangedColumn) {
      await db.exec(migration002);
    }

    const demoTenantExists = await db.prepare("SELECT id FROM tenants WHERE id = ?").bind("demo-brf").first();
    if (!demoTenantExists) {
      await db.exec(seedSql);
    }

    initialized = true;
  })();

  try {
    await initializationPromise;
  } finally {
    initializationPromise = null;
  }
};
