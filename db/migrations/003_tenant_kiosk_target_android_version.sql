-- Copyright (C) 2026 embsign AB
-- SPDX-License-Identifier: AGPL-3.0-only

ALTER TABLE tenants ADD COLUMN kiosk_target_android_version TEXT NOT NULL DEFAULT '';
