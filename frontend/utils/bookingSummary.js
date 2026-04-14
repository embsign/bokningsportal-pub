// Copyright (C) 2026 embsign AB
// SPDX-License-Identifier: AGPL-3.0-only

const getTimeLabel = ({ service, timeslot }) => {
  if (timeslot?.label) {
    return timeslot.label;
  }
  if (service.bookingType === "full-day") {
    return `${service.fullDayStartTime || "12:00"}-${service.fullDayEndTime || "12:00"}`;
  }
  return "Välj tid";
};

const getPriceLabel = (service) => {
  if (!service.priceText) {
    return "Ingen debitering";
  }
  return service.priceText.replace(/^Debiteras:\s*/, "");
};

export const createBookingSummary = ({ service, date, timeslot }) => {
  if (!service || !date) {
    return null;
  }

  const dateLabel = date.toLocaleDateString("sv-SE", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return {
    service: service.name,
    date: dateLabel,
    time: getTimeLabel({ service, timeslot }),
    duration: service.duration,
    price: getPriceLabel(service),
    resource: service.name,
  };
};
