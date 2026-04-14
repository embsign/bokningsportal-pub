// Copyright (C) 2026 embsign AB
// SPDX-License-Identifier: AGPL-3.0-only

import { createElement } from "../hooks/dom.js";

export const CancelBookingModal = ({ booking, onClose, onConfirm }) => {
  if (!booking) {
    return null;
  }
  const isBlock = booking.cancelType === "block";

  return createElement("div", {
    className: "modal-overlay",
    children: [
      createElement("div", {
        className: "modal card",
        children: [
          createElement("div", { className: "modal-title", text: isBlock ? "Avblockera tid" : "Avboka bokning" }),
          createElement("div", {
            className: "screen-subtitle",
            text: isBlock ? "Vill du avblockera denna tid?" : "Vill du avboka denna tid?",
          }),
          createElement("div", {
            className: "booking-cancel-summary",
            children: [
              createElement("div", { className: "booking-card-title", text: booking.serviceName }),
              createElement("div", {
                className: "booking-card-date",
                children: [
                  createElement("span", { className: "booking-date-day", text: booking.dayLabel }),
                  createElement("strong", { text: booking.dateLabel }),
                ],
              }),
              createElement("div", {
                className: "booking-card-time",
                children: [createElement("strong", { text: booking.timeLabel })],
              }),
            ],
          }),
          createElement("div", {
            className: "modal-footer",
            children: [
              createElement("button", {
                className: "secondary-button",
                text: "Avbryt",
                onClick: onClose,
              }),
              createElement("button", {
                className: "primary-button",
                text: isBlock ? "Avblockera" : "Avboka",
                onClick: onConfirm,
              }),
            ],
          }),
        ],
      }),
    ],
  });
};
