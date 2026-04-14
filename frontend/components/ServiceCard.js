// Copyright (C) 2026 embsign AB
// SPDX-License-Identifier: AGPL-3.0-only

import { createElement } from "../hooks/dom.js";

export const ServiceCard = ({ service, isSelected, onSelect }) => {
  const price =
    service.priceText && service.priceText.trim().length > 0
      ? createElement("div", { className: "service-meta", text: service.priceText })
      : null;

  return createElement("div", {
    className: `service-card ${isSelected ? "active" : ""}`.trim(),
    onClick: onSelect,
    children: [
      createElement("div", { className: "service-title", text: service.name }),
      createElement("div", { className: "service-pill", text: service.duration }),
      createElement("div", { className: "service-meta", text: `Nästa lediga tid: ${service.nextAvailable}` }),
      price,
    ],
  });
};
