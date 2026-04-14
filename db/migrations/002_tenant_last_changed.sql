-- Copyright (C) 2026 embsign AB
-- SPDX-License-Identifier: AGPL-3.0-only

-- Tenant version stamp for ETag / cache invalidation (updated on any tenant-scoped data change).

-- D1/SQLite: ADD COLUMN may not use a non-constant DEFAULT (e.g. CURRENT_TIMESTAMP in parentheses fails with SQLITE_ERROR 7500).
ALTER TABLE tenants ADD COLUMN last_changed_at TEXT NOT NULL DEFAULT '';

UPDATE tenants SET last_changed_at = COALESCE(NULLIF(created_at, ''), datetime('now')) WHERE last_changed_at = '';

-- Rows inserted without last_changed_at (e.g. seed) get DEFAULT ''; set a real stamp from created_at.
CREATE TRIGGER IF NOT EXISTS tr_tenants_ai_last_changed
AFTER INSERT ON tenants
WHEN NEW.last_changed_at = ''
BEGIN
  UPDATE tenants SET last_changed_at = COALESCE(NULLIF(NEW.created_at, ''), datetime('now')) WHERE id = NEW.id;
END;

-- Bump when tenant metadata changes (not pure last_changed_at-only writes from child triggers).
CREATE TRIGGER IF NOT EXISTS tenants_meta_after_update
AFTER UPDATE ON tenants
FOR EACH ROW
WHEN
  NEW.name != OLD.name
  OR NEW.is_active != OLD.is_active
  OR COALESCE(NEW.organization_number, '') != COALESCE(OLD.organization_number, '')
  OR COALESCE(NEW.admin_email, '') != COALESCE(OLD.admin_email, '')
  OR NEW.is_setup_complete != OLD.is_setup_complete
  OR COALESCE(NEW.account_owner_token, '') != COALESCE(OLD.account_owner_token, '')
  OR COALESCE(NEW.last_accessed_at, '') != COALESCE(OLD.last_accessed_at, '')
BEGIN
  UPDATE tenants SET last_changed_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

-- --- Child tables: touch tenant row ---

CREATE TRIGGER IF NOT EXISTS tr_users_ai AFTER INSERT ON users BEGIN
  UPDATE tenants SET last_changed_at = CURRENT_TIMESTAMP WHERE id = NEW.tenant_id;
END;
CREATE TRIGGER IF NOT EXISTS tr_users_au AFTER UPDATE ON users BEGIN
  UPDATE tenants SET last_changed_at = CURRENT_TIMESTAMP WHERE id = NEW.tenant_id;
  UPDATE tenants SET last_changed_at = CURRENT_TIMESTAMP WHERE id = OLD.tenant_id AND OLD.tenant_id != NEW.tenant_id;
END;
CREATE TRIGGER IF NOT EXISTS tr_users_ad AFTER DELETE ON users BEGIN
  UPDATE tenants SET last_changed_at = CURRENT_TIMESTAMP WHERE id = OLD.tenant_id;
END;

CREATE TRIGGER IF NOT EXISTS tr_access_groups_ai AFTER INSERT ON access_groups BEGIN
  UPDATE tenants SET last_changed_at = CURRENT_TIMESTAMP WHERE id = NEW.tenant_id;
END;
CREATE TRIGGER IF NOT EXISTS tr_access_groups_au AFTER UPDATE ON access_groups BEGIN
  UPDATE tenants SET last_changed_at = CURRENT_TIMESTAMP WHERE id = NEW.tenant_id;
  UPDATE tenants SET last_changed_at = CURRENT_TIMESTAMP WHERE id = OLD.tenant_id AND OLD.tenant_id != NEW.tenant_id;
END;
CREATE TRIGGER IF NOT EXISTS tr_access_groups_ad AFTER DELETE ON access_groups BEGIN
  UPDATE tenants SET last_changed_at = CURRENT_TIMESTAMP WHERE id = OLD.tenant_id;
END;

CREATE TRIGGER IF NOT EXISTS tr_user_access_groups_ai AFTER INSERT ON user_access_groups BEGIN
  UPDATE tenants SET last_changed_at = CURRENT_TIMESTAMP WHERE id = (SELECT tenant_id FROM users WHERE id = NEW.user_id);
END;
CREATE TRIGGER IF NOT EXISTS tr_user_access_groups_au AFTER UPDATE ON user_access_groups BEGIN
  UPDATE tenants SET last_changed_at = CURRENT_TIMESTAMP WHERE id = (SELECT tenant_id FROM users WHERE id = NEW.user_id);
  UPDATE tenants SET last_changed_at = CURRENT_TIMESTAMP WHERE id = (SELECT tenant_id FROM users WHERE id = OLD.user_id);
END;
CREATE TRIGGER IF NOT EXISTS tr_user_access_groups_ad AFTER DELETE ON user_access_groups BEGIN
  UPDATE tenants SET last_changed_at = CURRENT_TIMESTAMP WHERE id = (SELECT tenant_id FROM users WHERE id = OLD.user_id);
END;

CREATE TRIGGER IF NOT EXISTS tr_rfid_tags_ai AFTER INSERT ON rfid_tags BEGIN
  UPDATE tenants SET last_changed_at = CURRENT_TIMESTAMP WHERE id = NEW.tenant_id;
END;
CREATE TRIGGER IF NOT EXISTS tr_rfid_tags_au AFTER UPDATE ON rfid_tags BEGIN
  UPDATE tenants SET last_changed_at = CURRENT_TIMESTAMP WHERE id = NEW.tenant_id;
  UPDATE tenants SET last_changed_at = CURRENT_TIMESTAMP WHERE id = OLD.tenant_id AND OLD.tenant_id != NEW.tenant_id;
END;
CREATE TRIGGER IF NOT EXISTS tr_rfid_tags_ad AFTER DELETE ON rfid_tags BEGIN
  UPDATE tenants SET last_changed_at = CURRENT_TIMESTAMP WHERE id = OLD.tenant_id;
END;

CREATE TRIGGER IF NOT EXISTS tr_access_tokens_ai AFTER INSERT ON access_tokens BEGIN
  UPDATE tenants SET last_changed_at = CURRENT_TIMESTAMP WHERE id = NEW.tenant_id;
END;
-- Ignore last_used_at-only bumps (every authenticated request); token/tenant/user changes still touch.
CREATE TRIGGER IF NOT EXISTS tr_access_tokens_au AFTER UPDATE ON access_tokens
FOR EACH ROW
WHEN
  NEW.token != OLD.token
  OR NEW.tenant_id != OLD.tenant_id
  OR NEW.user_id != OLD.user_id
  OR COALESCE(NEW.source, '') != COALESCE(OLD.source, '')
  OR COALESCE(NEW.created_at, '') != COALESCE(OLD.created_at, '')
BEGIN
  UPDATE tenants SET last_changed_at = CURRENT_TIMESTAMP WHERE id = NEW.tenant_id;
  UPDATE tenants SET last_changed_at = CURRENT_TIMESTAMP WHERE id = OLD.tenant_id AND OLD.tenant_id != NEW.tenant_id;
END;
CREATE TRIGGER IF NOT EXISTS tr_access_tokens_ad AFTER DELETE ON access_tokens BEGIN
  UPDATE tenants SET last_changed_at = CURRENT_TIMESTAMP WHERE id = OLD.tenant_id;
END;

CREATE TRIGGER IF NOT EXISTS tr_booking_groups_ai AFTER INSERT ON booking_groups BEGIN
  UPDATE tenants SET last_changed_at = CURRENT_TIMESTAMP WHERE id = NEW.tenant_id;
END;
CREATE TRIGGER IF NOT EXISTS tr_booking_groups_au AFTER UPDATE ON booking_groups BEGIN
  UPDATE tenants SET last_changed_at = CURRENT_TIMESTAMP WHERE id = NEW.tenant_id;
  UPDATE tenants SET last_changed_at = CURRENT_TIMESTAMP WHERE id = OLD.tenant_id AND OLD.tenant_id != NEW.tenant_id;
END;
CREATE TRIGGER IF NOT EXISTS tr_booking_groups_ad AFTER DELETE ON booking_groups BEGIN
  UPDATE tenants SET last_changed_at = CURRENT_TIMESTAMP WHERE id = OLD.tenant_id;
END;

CREATE TRIGGER IF NOT EXISTS tr_booking_objects_ai AFTER INSERT ON booking_objects BEGIN
  UPDATE tenants SET last_changed_at = CURRENT_TIMESTAMP WHERE id = NEW.tenant_id;
END;
CREATE TRIGGER IF NOT EXISTS tr_booking_objects_au AFTER UPDATE ON booking_objects BEGIN
  UPDATE tenants SET last_changed_at = CURRENT_TIMESTAMP WHERE id = NEW.tenant_id;
  UPDATE tenants SET last_changed_at = CURRENT_TIMESTAMP WHERE id = OLD.tenant_id AND OLD.tenant_id != NEW.tenant_id;
END;
CREATE TRIGGER IF NOT EXISTS tr_booking_objects_ad AFTER DELETE ON booking_objects BEGIN
  UPDATE tenants SET last_changed_at = CURRENT_TIMESTAMP WHERE id = OLD.tenant_id;
END;

CREATE TRIGGER IF NOT EXISTS tr_booking_object_permissions_ai AFTER INSERT ON booking_object_permissions BEGIN
  UPDATE tenants SET last_changed_at = CURRENT_TIMESTAMP
  WHERE id = (SELECT tenant_id FROM booking_objects WHERE id = NEW.booking_object_id);
END;
CREATE TRIGGER IF NOT EXISTS tr_booking_object_permissions_au AFTER UPDATE ON booking_object_permissions BEGIN
  UPDATE tenants SET last_changed_at = CURRENT_TIMESTAMP
  WHERE id = (SELECT tenant_id FROM booking_objects WHERE id = NEW.booking_object_id);
  UPDATE tenants SET last_changed_at = CURRENT_TIMESTAMP
  WHERE id = (SELECT tenant_id FROM booking_objects WHERE id = OLD.booking_object_id);
END;
CREATE TRIGGER IF NOT EXISTS tr_booking_object_permissions_ad AFTER DELETE ON booking_object_permissions BEGIN
  UPDATE tenants SET last_changed_at = CURRENT_TIMESTAMP
  WHERE id = (SELECT tenant_id FROM booking_objects WHERE id = OLD.booking_object_id);
END;

CREATE TRIGGER IF NOT EXISTS tr_bookings_ai AFTER INSERT ON bookings BEGIN
  UPDATE tenants SET last_changed_at = CURRENT_TIMESTAMP WHERE id = NEW.tenant_id;
END;
CREATE TRIGGER IF NOT EXISTS tr_bookings_au AFTER UPDATE ON bookings BEGIN
  UPDATE tenants SET last_changed_at = CURRENT_TIMESTAMP WHERE id = NEW.tenant_id;
  UPDATE tenants SET last_changed_at = CURRENT_TIMESTAMP WHERE id = OLD.tenant_id AND OLD.tenant_id != NEW.tenant_id;
END;
CREATE TRIGGER IF NOT EXISTS tr_bookings_ad AFTER DELETE ON bookings BEGIN
  UPDATE tenants SET last_changed_at = CURRENT_TIMESTAMP WHERE id = OLD.tenant_id;
END;

CREATE TRIGGER IF NOT EXISTS tr_booking_blocks_ai AFTER INSERT ON booking_blocks BEGIN
  UPDATE tenants SET last_changed_at = CURRENT_TIMESTAMP WHERE id = NEW.tenant_id;
END;
CREATE TRIGGER IF NOT EXISTS tr_booking_blocks_au AFTER UPDATE ON booking_blocks BEGIN
  UPDATE tenants SET last_changed_at = CURRENT_TIMESTAMP WHERE id = NEW.tenant_id;
  UPDATE tenants SET last_changed_at = CURRENT_TIMESTAMP WHERE id = OLD.tenant_id AND OLD.tenant_id != NEW.tenant_id;
END;
CREATE TRIGGER IF NOT EXISTS tr_booking_blocks_ad AFTER DELETE ON booking_blocks BEGIN
  UPDATE tenants SET last_changed_at = CURRENT_TIMESTAMP WHERE id = OLD.tenant_id;
END;

CREATE TRIGGER IF NOT EXISTS tr_user_import_rules_ai AFTER INSERT ON user_import_rules BEGIN
  UPDATE tenants SET last_changed_at = CURRENT_TIMESTAMP WHERE id = NEW.tenant_id;
END;
CREATE TRIGGER IF NOT EXISTS tr_user_import_rules_au AFTER UPDATE ON user_import_rules BEGIN
  UPDATE tenants SET last_changed_at = CURRENT_TIMESTAMP WHERE id = NEW.tenant_id;
END;
CREATE TRIGGER IF NOT EXISTS tr_user_import_rules_ad AFTER DELETE ON user_import_rules BEGIN
  UPDATE tenants SET last_changed_at = CURRENT_TIMESTAMP WHERE id = OLD.tenant_id;
END;

CREATE TRIGGER IF NOT EXISTS tr_booking_screens_ai AFTER INSERT ON booking_screens BEGIN
  UPDATE tenants SET last_changed_at = CURRENT_TIMESTAMP WHERE id = NEW.tenant_id;
END;
-- Ignore heartbeat-only updates (last_seen / last_verified); pairing and config changes still touch.
CREATE TRIGGER IF NOT EXISTS tr_booking_screens_au AFTER UPDATE ON booking_screens
FOR EACH ROW
WHEN
  NEW.name != OLD.name
  OR NEW.tenant_id != OLD.tenant_id
  OR COALESCE(NEW.pairing_code, '') != COALESCE(OLD.pairing_code, '')
  OR COALESCE(NEW.screen_token, '') != COALESCE(OLD.screen_token, '')
  OR NEW.is_active != OLD.is_active
  OR COALESCE(NEW.paired_at, '') != COALESCE(OLD.paired_at, '')
BEGIN
  UPDATE tenants SET last_changed_at = CURRENT_TIMESTAMP WHERE id = NEW.tenant_id;
  UPDATE tenants SET last_changed_at = CURRENT_TIMESTAMP WHERE id = OLD.tenant_id AND OLD.tenant_id != NEW.tenant_id;
END;
CREATE TRIGGER IF NOT EXISTS tr_booking_screens_ad AFTER DELETE ON booking_screens BEGIN
  UPDATE tenants SET last_changed_at = CURRENT_TIMESTAMP WHERE id = OLD.tenant_id;
END;

CREATE TRIGGER IF NOT EXISTS tr_kiosk_pairing_ai AFTER INSERT ON kiosk_pairing_codes BEGIN
  UPDATE tenants SET last_changed_at = CURRENT_TIMESTAMP
  WHERE NEW.paired_screen_id IS NOT NULL
    AND id = (SELECT tenant_id FROM booking_screens WHERE id = NEW.paired_screen_id);
END;
CREATE TRIGGER IF NOT EXISTS tr_kiosk_pairing_au AFTER UPDATE ON kiosk_pairing_codes BEGIN
  UPDATE tenants SET last_changed_at = CURRENT_TIMESTAMP
  WHERE NEW.paired_screen_id IS NOT NULL
    AND id = (SELECT tenant_id FROM booking_screens WHERE id = NEW.paired_screen_id);
  UPDATE tenants SET last_changed_at = CURRENT_TIMESTAMP
  WHERE OLD.paired_screen_id IS NOT NULL
    AND id = (SELECT tenant_id FROM booking_screens WHERE id = OLD.paired_screen_id);
END;
CREATE TRIGGER IF NOT EXISTS tr_kiosk_pairing_ad AFTER DELETE ON kiosk_pairing_codes BEGIN
  UPDATE tenants SET last_changed_at = CURRENT_TIMESTAMP
  WHERE OLD.paired_screen_id IS NOT NULL
    AND id = (SELECT tenant_id FROM booking_screens WHERE id = OLD.paired_screen_id);
END;
