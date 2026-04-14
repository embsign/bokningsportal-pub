-- Copyright (C) 2026 embsign AB
-- SPDX-License-Identifier: AGPL-3.0-only

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_accessed_at TEXT,
  account_owner_token TEXT,
  organization_number TEXT,
  admin_email TEXT,
  is_setup_complete INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  apartment_id TEXT NOT NULL,
  house TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, apartment_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS access_groups (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS user_access_groups (
  user_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  PRIMARY KEY (user_id, group_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (group_id) REFERENCES access_groups(id)
);

CREATE TABLE IF NOT EXISTS rfid_tags (
  uid TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (tenant_id, uid),
  CHECK (uid = UPPER(uid)),
  CHECK (uid NOT GLOB '*[^0-9A-F]*'),
  CHECK (LENGTH(uid) >= 4),
  CHECK (LENGTH(REPLACE(uid, '0', '')) >= 1),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS access_tokens (
  token TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  source TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS booking_groups (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  max_bookings INTEGER NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS booking_objects (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  booking_type TEXT NOT NULL,
  slot_duration_minutes INTEGER,
  full_day_start_time TEXT NOT NULL DEFAULT '12:00',
  full_day_end_time TEXT NOT NULL DEFAULT '12:00',
  time_slot_start_time TEXT NOT NULL DEFAULT '08:00',
  time_slot_end_time TEXT NOT NULL DEFAULT '20:00',
  window_min_days INTEGER NOT NULL DEFAULT 0,
  window_max_days INTEGER NOT NULL DEFAULT 30,
  price_weekday_cents INTEGER NOT NULL DEFAULT 0,
  price_weekend_cents INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  group_id TEXT,
  max_bookings_override INTEGER,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (group_id) REFERENCES booking_groups(id)
);

CREATE TABLE IF NOT EXISTS booking_object_permissions (
  booking_object_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  scope TEXT NOT NULL,
  value TEXT NOT NULL,
  FOREIGN KEY (booking_object_id) REFERENCES booking_objects(id)
);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  booking_object_id TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  price_cents INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cancelled_at TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (booking_object_id) REFERENCES booking_objects(id)
);

CREATE TABLE IF NOT EXISTS booking_blocks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  booking_object_id TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  reason TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (booking_object_id) REFERENCES booking_objects(id)
);

CREATE TABLE IF NOT EXISTS user_import_rules (
  tenant_id TEXT PRIMARY KEY,
  identity_field TEXT NOT NULL,
  groups_field TEXT,
  rfid_field TEXT,
  active_field TEXT,
  house_field TEXT,
  apartment_field TEXT,
  house_regex TEXT,
  apartment_regex TEXT,
  group_separator TEXT,
  admin_groups TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS booking_screens (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  pairing_code TEXT NOT NULL UNIQUE,
  screen_token TEXT NOT NULL UNIQUE,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paired_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT,
  last_verified_at TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS kiosk_pairing_codes (
  code TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',
  paired_screen_id TEXT,
  first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  paired_at TEXT,
  FOREIGN KEY (paired_screen_id) REFERENCES booking_screens(id)
);

CREATE INDEX IF NOT EXISTS idx_users_tenant_active ON users(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_bookings_object_time ON bookings(booking_object_id, start_time);
CREATE INDEX IF NOT EXISTS idx_bookings_user_time ON bookings(user_id, start_time);
CREATE INDEX IF NOT EXISTS idx_blocks_object_time ON booking_blocks(booking_object_id, start_time);
CREATE INDEX IF NOT EXISTS idx_rfid_tags_tenant_uid ON rfid_tags(tenant_id, uid);
CREATE INDEX IF NOT EXISTS idx_booking_object_permissions ON booking_object_permissions(booking_object_id, mode, scope);
CREATE UNIQUE INDEX IF NOT EXISTS idx_access_groups_unique ON access_groups(tenant_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_access_tokens_user_unique ON access_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_tenants_setup_complete ON tenants(is_setup_complete);
CREATE INDEX IF NOT EXISTS idx_booking_screens_tenant_active ON booking_screens(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_booking_screens_tenant_name ON booking_screens(tenant_id, name);
CREATE INDEX IF NOT EXISTS idx_kiosk_pairing_codes_status_expires ON kiosk_pairing_codes(status, expires_at);

INSERT OR IGNORE INTO app_config (key, value)
VALUES ('setup_link_salt', lower(hex(randomblob(16))));
