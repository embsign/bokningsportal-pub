// Copyright (C) 2026 embsign AB
// SPDX-License-Identifier: AGPL-3.0-only

import { apiRequest } from "./client.js";

const toKr = (value) => (value ? String(Math.round(value / 100)) : "0");
const normalizeClockTime = (value, fallback = "12:00") => (/^\d{2}:\d{2}$/.test(value || "") ? value : fallback);
const toCents = (value) => {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return 0;
  }
  return Math.round(parsed * 100);
};

const toRequiredPositiveInt = (value, fallback = 2) => {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }
  return fallback;
};

export const getBookingObjects = async () => {
  const { booking_objects } = await apiRequest("/admin/booking-objects");
  return booking_objects.map((obj) => ({
    id: obj.id,
    name: obj.name,
    type: obj.booking_type === "full-day" ? "Dygn" : "Tidspass",
    status: obj.is_active ? "Aktiv" : "Inaktiv",
    slotDuration: obj.slot_duration_minutes ? String(obj.slot_duration_minutes) : "",
    slotDisplay:
      obj.booking_type === "full-day"
        ? `${normalizeClockTime(obj.full_day_start_time)}-${normalizeClockTime(obj.full_day_end_time)}`
        : obj.slot_duration_minutes
          ? String(obj.slot_duration_minutes)
          : "",
    fullDayStartTime: normalizeClockTime(obj.full_day_start_time),
    fullDayEndTime: normalizeClockTime(obj.full_day_end_time),
    slotStartTime: normalizeClockTime(obj.time_slot_start_time || "08:00"),
    slotEndTime: normalizeClockTime(obj.time_slot_end_time || "20:00"),
    windowMin: String(obj.window_min_days),
    windowMax: String(obj.window_max_days),
    maxBookings: String(obj.max_bookings_override || 2),
    priceWeekday: toKr(obj.price_weekday_cents),
    priceWeekend: toKr(obj.price_weekend_cents),
    groupId: obj.group_id || "",
    allowHouses: obj.allowHouses || [],
    allowGroups: obj.allowGroups || [],
    allowApartments: obj.allowApartments || [],
    denyHouses: obj.denyHouses || [],
    denyGroups: obj.denyGroups || [],
    denyApartments: obj.denyApartments || [],
  }));
};

export const createBookingObject = (payload) =>
  apiRequest("/admin/booking-objects", {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      booking_type: payload.type === "Dygn" ? "full-day" : "time-slot",
      slot_duration_minutes: payload.type === "Dygn" ? null : payload.slotDuration ? Number(payload.slotDuration) : null,
      full_day_start_time: normalizeClockTime(payload.fullDayStartTime),
      full_day_end_time: normalizeClockTime(payload.fullDayEndTime),
      time_slot_start_time: normalizeClockTime(payload.slotStartTime || "08:00"),
      time_slot_end_time: normalizeClockTime(payload.slotEndTime || "20:00"),
      window_min_days: Number(payload.windowMin || 0),
      window_max_days: Number(payload.windowMax || 0),
      price_weekday_cents: toCents(payload.priceWeekday),
      price_weekend_cents: toCents(payload.priceWeekend),
      is_active: payload.status !== "Inaktiv",
      group_id: payload.groupId || null,
      max_bookings_override: toRequiredPositiveInt(payload.maxBookings),
    }),
  });

export const updateBookingObject = (id, payload) =>
  apiRequest(`/admin/booking-objects/${id}`, {
    method: "PUT",
    body: JSON.stringify({
      ...payload,
      booking_type: payload.type === "Dygn" ? "full-day" : "time-slot",
      slot_duration_minutes: payload.type === "Dygn" ? null : payload.slotDuration ? Number(payload.slotDuration) : null,
      full_day_start_time: normalizeClockTime(payload.fullDayStartTime),
      full_day_end_time: normalizeClockTime(payload.fullDayEndTime),
      time_slot_start_time: normalizeClockTime(payload.slotStartTime || "08:00"),
      time_slot_end_time: normalizeClockTime(payload.slotEndTime || "20:00"),
      window_min_days: Number(payload.windowMin || 0),
      window_max_days: Number(payload.windowMax || 0),
      price_weekday_cents: toCents(payload.priceWeekday),
      price_weekend_cents: toCents(payload.priceWeekend),
      is_active: payload.status !== "Inaktiv",
      group_id: payload.groupId || null,
      max_bookings_override: toRequiredPositiveInt(payload.maxBookings),
    }),
  });

export const deactivateBookingObject = (id, confirmCancel = false) =>
  apiRequest(`/admin/booking-objects/${id}/deactivate${confirmCancel ? "?confirm=true" : ""}`, {
    method: "POST",
  });

export const getBookingGroups = async () => {
  const { booking_groups } = await apiRequest("/admin/booking-groups");
  return booking_groups.map((group) => ({
    id: group.id,
    name: group.name,
    maxBookings: String(group.max_bookings),
  }));
};

export const createBookingGroup = (payload) =>
  apiRequest("/admin/booking-groups", { method: "POST", body: JSON.stringify(payload) });

export const getUserLoginQrExportData = (frontendBaseUrl = "") => {
  const q = new URLSearchParams();
  if (frontendBaseUrl) {
    q.set("frontend_base_url", frontendBaseUrl);
  }
  const qs = q.toString();
  return apiRequest(`/admin/users/login-qr-export${qs ? `?${qs}` : ""}`);
};

export const getAdminUserLoginQr = (userId, frontendBaseUrl = "") => {
  const q = new URLSearchParams();
  if (frontendBaseUrl) {
    q.set("frontend_base_url", frontendBaseUrl);
  }
  const qs = q.toString();
  return apiRequest(`/admin/users/${encodeURIComponent(userId)}/login-qr${qs ? `?${qs}` : ""}`);
};

export const rotateAdminUserLoginQr = (userId, frontendBaseUrl = "") =>
  apiRequest(`/admin/users/${encodeURIComponent(userId)}/login-qr/rotate`, {
    method: "POST",
    body: JSON.stringify(frontendBaseUrl ? { frontend_base_url: frontendBaseUrl } : {}),
  });

export const getUsers = async () => {
  const { users } = await apiRequest("/admin/users");
  return users.map((user) => ({
    id: user.id,
    apartmentId: user.apartment_id,
    house: user.house,
    groups: user.groups || [],
    rfidTags: user.rfid_tags || (user.rfid ? [user.rfid] : []),
    rfid: user.rfid || "",
    active: Boolean(user.is_active),
    admin: Boolean(user.is_admin),
  }));
};

export const updateUser = (id, payload) =>
  apiRequest(`/admin/users/${id}`, {
    method: "PUT",
    body: JSON.stringify({
      apartment_id: payload.apartmentId,
      house: payload.house,
      groups: payload.groups,
      rfid: payload.rfid,
      rfid_tags: payload.rfidTags || (payload.rfid ? [payload.rfid] : []),
      is_admin: payload.admin,
      is_active: payload.active,
    }),
  });

export const createUser = (payload) =>
  apiRequest("/admin/users", {
    method: "POST",
    body: JSON.stringify({
      apartment_id: payload.apartmentId,
      house: payload.house,
      groups: payload.groups,
      rfid: payload.rfid,
      rfid_tags: payload.rfidTags || (payload.rfid ? [payload.rfid] : []),
      is_admin: payload.admin,
      is_active: payload.active,
    }),
  });

export const deleteUser = (id, deleteBookings = false) =>
  apiRequest(`/admin/users/${id}${deleteBookings ? "?delete_bookings=true" : ""}`, {
    method: "DELETE",
  });

export const getAccessGroups = async () => {
  const { groups } = await apiRequest("/admin/access-groups");
  return groups || [];
};

export const createAccessGroup = (name) =>
  apiRequest("/admin/access-groups", {
    method: "POST",
    body: JSON.stringify({ name }),
  });

export const getImportRules = () => apiRequest("/admin/users/import/rules");

export const saveImportRules = (rules) =>
  apiRequest("/admin/users/import/rules", {
    method: "PUT",
    body: JSON.stringify(rules),
  });

export const previewImport = (csvText, rules) =>
  apiRequest("/admin/users/import/preview", {
    method: "POST",
    body: JSON.stringify({ csv_text: csvText, rules }),
  });

export const applyImport = (csvText, rules, actions, options = {}) =>
  apiRequest("/admin/users/import/apply", {
    method: "POST",
    body: JSON.stringify({
      csv_text: csvText,
      rules,
      actions,
      offset: options.offset || 0,
      limit: options.limit || 100,
    }),
  });

export const downloadReportCsv = async (month, bookingObjectId) =>
  apiRequest(`/admin/reports/csv?month=${encodeURIComponent(month)}&booking_object_id=${encodeURIComponent(bookingObjectId)}`);

export const getBookingScreens = async () => {
  const { booking_screens } = await apiRequest("/admin/booking-screens");
  return (booking_screens || []).map((screen) => ({
    id: screen.id,
    tenantId: screen.tenant_id,
    name: screen.name,
    pairingCode: screen.pairing_code,
    createdAt: screen.created_at,
    updatedAt: screen.updated_at,
    pairedAt: screen.paired_at,
    lastSeenAt: screen.last_seen_at,
    lastVerifiedAt: screen.last_verified_at,
    active: Boolean(screen.is_active),
  }));
};

export const orderBookingScreens = (payload = {}) =>
  apiRequest("/admin/booking-screens/order", {
    method: "POST",
    body: JSON.stringify({
      quantity: payload.quantity || 1,
      contact_name: payload.contactName || "",
      contact_email: payload.contactEmail || "",
    }),
  });

export const pairBookingScreen = (payload) =>
  apiRequest("/admin/booking-screens/pair", {
    method: "POST",
    body: JSON.stringify({
      pairing_code: payload.pairingCode,
      name: payload.name,
    }),
  });

export const updateBookingScreen = (id, payload) =>
  apiRequest(`/admin/booking-screens/${id}`, {
    method: "PUT",
    body: JSON.stringify({
      name: payload.name,
    }),
  });

export const deleteBookingScreen = (id) =>
  apiRequest(`/admin/booking-screens/${id}`, {
    method: "DELETE",
  });
