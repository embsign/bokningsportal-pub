-- Copyright (C) 2026 embsign AB
-- SPDX-License-Identifier: AGPL-3.0-only

INSERT OR IGNORE INTO tenants (id, name, account_owner_token, admin_email, is_setup_complete)
VALUES ("demo-brf", "Demo BRF", "account-owner-demo-token", "admin@demo.se", 1);

INSERT OR IGNORE INTO users (id, tenant_id, apartment_id, house, is_active, is_admin)
VALUES
  ("user-admin", "demo-brf", "A-01", "A", 1, 1),
  ("user-anna", "demo-brf", "A-02", "A", 1, 0),
  ("user-erik", "demo-brf", "B-11", "B", 1, 0),
  ("user-lina", "demo-brf", "C-03", "C", 1, 0);

INSERT OR IGNORE INTO booking_groups (id, tenant_id, name, max_bookings)
VALUES ("group-standard", "demo-brf", "Standard", 2);

INSERT OR IGNORE INTO booking_objects (
  id, tenant_id, name, description, booking_type, slot_duration_minutes,
  time_slot_start_time, time_slot_end_time,
  window_min_days, window_max_days, price_weekday_cents, price_weekend_cents,
  is_active, group_id
) VALUES
  ("obj-laundry", "demo-brf", "Tvättstuga", "Tvätt & tork", "time-slot", 120, "08:00", "20:00", 0, 30, 5000, 7500, 1, "group-standard"),
  ("obj-guest", "demo-brf", "Gästlägenhet", "Heldagsbokning", "full-day", NULL, "08:00", "20:00", 3, 90, 35000, 35000, 1, "group-standard"),
  ("obj-sauna", "demo-brf", "Bastu", "Kvällspass", "time-slot", 90, "08:00", "22:00", 0, 14, 0, 0, 1, "group-standard");

INSERT OR IGNORE INTO access_tokens (token, tenant_id, user_id, created_at, source)
VALUES
  ("admin-demo-token", "demo-brf", "user-admin", CURRENT_TIMESTAMP, "admin"),
  ("user-demo-token-anna", "demo-brf", "user-anna", CURRENT_TIMESTAMP, "user"),
  ("user-demo-token-erik", "demo-brf", "user-erik", CURRENT_TIMESTAMP, "user"),
  ("user-demo-token-lina", "demo-brf", "user-lina", CURRENT_TIMESTAMP, "user");

INSERT OR IGNORE INTO rfid_tags (uid, tenant_id, user_id, is_active)
VALUES
  ("RFID-1001", "demo-brf", "user-admin", 1),
  ("RFID-1002", "demo-brf", "user-anna", 1),
  ("RFID-1003", "demo-brf", "user-erik", 1),
  ("RFID-1004", "demo-brf", "user-lina", 1);
