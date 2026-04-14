// Copyright (C) 2026 embsign AB
// SPDX-License-Identifier: AGPL-3.0-only

import { D1Database } from "../types.js";

export const userHasBookings = async (db: D1Database, userId: string) => {
  const row = await db
    .prepare("SELECT COUNT(1) as count FROM bookings WHERE user_id = ?")
    .bind(userId)
    .first();
  return (row?.count as number | undefined) ? Number(row.count) > 0 : false;
};

export const deleteUserBookings = async (db: D1Database, userId: string) => {
  await db.prepare("DELETE FROM bookings WHERE user_id = ?").bind(userId).run();
};
