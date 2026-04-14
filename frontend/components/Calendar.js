// Copyright (C) 2026 embsign AB
// SPDX-License-Identifier: AGPL-3.0-only

import { createElement } from "../hooks/dom.js";

const weekDays = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];

export const Calendar = ({
  monthLabel,
  days,
  selectedDateId,
  onPrev,
  onNext,
  canPrev,
  canNext,
  onSelect,
  isLoading = false,
  isAdminView = false,
}) => {
  const header = createElement("div", {
    className: "calendar-header",
    children: [
      createElement("button", {
        className: "secondary-button",
        text: "‹ Föregående",
        onClick: onPrev,
        attrs: { disabled: !canPrev || isLoading },
      }),
      createElement("div", { className: "calendar-title", text: monthLabel }),
      createElement("button", {
        className: "secondary-button",
        text: "Nästa ›",
        onClick: onNext,
        attrs: { disabled: !canNext || isLoading },
      }),
    ],
  });

  const weekdayRow = weekDays.map((day, index) =>
    createElement("div", {
      className: `calendar-weekday ${index === 6 ? "weekday-sunday" : ""}`.trim(),
      text: day,
    })
  );

  const dayCards = days.map((day) => {
    if (day.status === "outside") {
      return createElement("div", { className: "day-card outside", attrs: { "aria-hidden": "true" } });
    }
    if (isLoading) {
      return createElement("div", {
        className: "day-card skeleton calendar-day-skeleton",
        attrs: { "aria-hidden": "true" },
      });
    }
    const isSelected = selectedDateId === day.id;
    const className = [
      "day-card",
      isAdminView ? "admin-view" : "",
      day.status,
      isSelected ? "selected" : "",
    ]
      .filter(Boolean)
      .join(" ");

    const weekday = day.date.toLocaleDateString("sv-SE", { weekday: "short" });
    return createElement("div", {
      className,
      onClick: day.status === "disabled" ? null : () => onSelect(day),
      children: [
        createElement("span", { className: "day-weekday", text: weekday }),
        createElement("strong", { text: day.label }),
        isAdminView
          ? createElement("span", {
              className: "day-price day-meta",
              text:
                day.bookedByApartmentId && (day.status === "booked" || day.status === "mine")
                  ? `Bokad av: ${day.bookedByApartmentId}`
                  : day.status === "blocked"
                    ? "Blockerad"
                    : " ",
            })
          : null,
        day.priceText ? createElement("span", { className: "day-price", text: day.priceText }) : null,
      ],
    });
  });

  return createElement("div", {
    className: "calendar card",
    children: [
      header,
      createElement("div", { className: "calendar-weekdays", children: weekdayRow }),
      createElement("div", { className: "calendar-grid", children: dayCards }),
    ],
  });
};

