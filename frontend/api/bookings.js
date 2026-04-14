// Copyright (C) 2026 embsign AB
// SPDX-License-Identifier: AGPL-3.0-only

import { apiRequest } from "./client.js";

const formatDayLabel = (date) =>
  date
    .toLocaleDateString("sv-SE", { weekday: "short" })
    .replace(".", "")
    .replace(/^./, (char) => char.toUpperCase());

const formatDateLabel = (date) => `${date.getDate()}/${date.getMonth() + 1}`;

export const getCurrentBookings = async () => {
  const { bookings } = await apiRequest("/bookings/current");
  return bookings.map((booking) => {
    const date = new Date(booking.date);
    return {
      id: booking.id,
      bookingObjectId: booking.booking_object_id,
      groupId: booking.booking_group_id || "",
      startTime: booking.start_time || "",
      endTime: booking.end_time || "",
      serviceName: booking.service_name,
      dayLabel: formatDayLabel(date),
      dateLabel: formatDateLabel(date),
      timeLabel: booking.time_label,
      status: booking.status,
    };
  });
};

export const createBooking = (payload) =>
  apiRequest("/bookings", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const cancelBooking = (bookingId) =>
  apiRequest(`/bookings/${bookingId}`, { method: "DELETE" });
