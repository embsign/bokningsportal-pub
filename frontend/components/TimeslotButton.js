// Copyright (C) 2026 embsign AB
// SPDX-License-Identifier: AGPL-3.0-only

import { createElement } from "../hooks/dom.js";

export const TimeslotButton = ({ slot, isSelected, onSelect, isAdminView = false }) => {
  const hasPrice = Boolean(slot.priceText && slot.priceText.trim().length > 0);
  const className = [
    "timeslot-button",
    isAdminView ? "admin-view" : "",
    slot.status,
    isSelected ? "selected" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const price = hasPrice ? createElement("span", { text: slot.priceText }) : null;
  const metaText =
    slot.bookedByApartmentId && (slot.status === "booked" || slot.status === "mine")
      ? `Bokad av: ${slot.bookedByApartmentId}`
      : slot.status === "blocked"
        ? "Blockerad"
        : " ";
  const meta = isAdminView
    ? createElement("span", {
        className: "timeslot-meta",
        text: metaText,
      })
    : null;

  return createElement("button", {
    className,
    attrs: hasPrice ? { "data-has-price": "true" } : {},
    onClick: slot.status !== "disabled" ? onSelect : null,
    children: [
      createElement("strong", { text: slot.label }),
      meta,
      price,
    ],
  });
};
