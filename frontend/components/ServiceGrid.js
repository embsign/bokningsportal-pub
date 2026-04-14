// Copyright (C) 2026 embsign AB
// SPDX-License-Identifier: AGPL-3.0-only

import { createElement } from "../hooks/dom.js";
import { ServiceCard } from "./ServiceCard.js";

export const ServiceGrid = ({ services, selectedId, onSelect }) => {
  const cards = services.map((service) =>
    ServiceCard({
      service,
      isSelected: selectedId === service.id,
      onSelect: () => onSelect(service),
    })
  );

  return createElement("div", { className: "service-grid", children: cards });
};
