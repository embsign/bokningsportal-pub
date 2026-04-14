// Copyright (C) 2026 embsign AB
// SPDX-License-Identifier: AGPL-3.0-only

import { apiRequest } from "./client.js";

const formatDuration = (service) => {
  if (service.booking_type === "full-day") {
    return "1 dygn";
  }
  if (service.slot_duration_minutes) {
    const hours = service.slot_duration_minutes / 60;
    return hours % 1 === 0 ? `${hours} timmar` : `${hours.toString().replace(".", ",")} timmar`;
  }
  return "";
};

const formatPriceText = (service) => {
  const weekdayCents = Number(service.price_weekday_cents);
  const weekendCents = Number(service.price_weekend_cents);
  const hasAnyPrice = weekdayCents > 0 || weekendCents > 0;
  if (!hasAnyPrice) {
    return "";
  }

  const weekday = Math.round(weekdayCents / 100);
  const weekend = Math.round(weekendCents / 100);
  if (weekday === weekend) {
    return `Debiteras: ${weekday} kr`;
  }

  const low = Math.min(weekday, weekend);
  const high = Math.max(weekday, weekend);
  return `Debiteras: ${low}-${high} kr`;
};

export const getServices = async () => {
  const { services } = await apiRequest("/services");
  return services.map((service) => ({
    id: service.id,
    name: service.name,
    description: service.description || "",
    duration: formatDuration(service),
    nextAvailable: service.next_available,
    priceText: formatPriceText(service),
    bookingType: service.booking_type,
    slotDuration: service.slot_duration_minutes || "",
    fullDayStartTime: service.full_day_start_time,
    fullDayEndTime: service.full_day_end_time,
    timeSlotStartTime: service.time_slot_start_time,
    timeSlotEndTime: service.time_slot_end_time,
    windowMin: Number(service.window_min_days),
    windowMax: Number(service.window_max_days),
    maxBookings: Number(service.max_bookings_limit ?? service.max_bookings),
    maxBookingsLimit: Number(service.max_bookings_limit ?? service.max_bookings),
    maxBookingsReached: service.max_bookings_reached === true,
    bookingGroupId: service.group_id || "",
    priceWeekday: Number(service.price_weekday_cents),
    priceWeekend: Number(service.price_weekend_cents),
  }));
};
