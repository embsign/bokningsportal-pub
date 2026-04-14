// Copyright (C) 2026 embsign AB
// SPDX-License-Identifier: AGPL-3.0-only

import { D1Database } from "../types.js";

export const hasFutureBookings = async (db: D1Database, bookingObjectId: string, nowIso: string) => {
  const row = await db
    .prepare("SELECT COUNT(1) as count FROM bookings WHERE booking_object_id = ? AND end_time >= ?")
    .bind(bookingObjectId, nowIso)
    .first();
  return (row?.count as number | undefined) ? Number(row.count) > 0 : false;
};

export const cancelFutureBookings = async (db: D1Database, bookingObjectId: string, nowIso: string) => {
  await db
    .prepare("DELETE FROM bookings WHERE booking_object_id = ? AND end_time >= ?")
    .bind(bookingObjectId, nowIso)
    .run();
};
