// Copyright (C) 2026 embsign AB
// SPDX-License-Identifier: AGPL-3.0-only

import { createElement } from "../hooks/dom.js";
import { Calendar } from "../components/Calendar.js";
import { CancelBookingModal } from "../components/CancelBookingModal.js";

const legend = () =>
  createElement("div", {
    className: "status-legend",
    children: [
      legendItem("dot-available", "Ledig"),
      legendItem("dot-booked", "Upptagen"),
      legendItem("dot-mine", "Bokad"),
      legendItem("dot-blocked", "Blockerad"),
      legendItem("dot-disabled", "Passerad"),
    ],
  });

const legendItem = (dotClass, label) =>
  createElement("div", {
    className: "legend-item",
    children: [
      createElement("span", { className: `legend-dot ${dotClass}` }),
      createElement("span", { text: label }),
    ],
  });

export const DateSelection = ({
  monthLabel,
  days,
  expectedDays,
  selectedDateId,
  onSelect,
  onPrev,
  onNext,
  canPrev,
  canNext,
  state,
  cancelModalOpen,
  cancelBooking,
  onCloseCancel,
  onConfirmCancel,
  isAdminView = false,
}) => {
  const header = createElement("div", {
    className: "screen-header",
    children: [
      createElement("div"),
    ],
  });

  const hasRenderableDays = days.some((day) => day.status !== "outside");
  const hasRenderableExpectedDays = (expectedDays || []).some((day) => day.status !== "outside");

  let content;
  if (state === "loading" && !hasRenderableDays && hasRenderableExpectedDays) {
    content = Calendar({
      monthLabel,
      days: expectedDays,
      selectedDateId,
      onSelect: () => {},
      onPrev,
      onNext,
      canPrev,
      canNext,
      isLoading: true,
      isAdminView,
    });
  } else if (state === "loading" && !hasRenderableDays) {
    content = Calendar({
      monthLabel,
      days: [],
      selectedDateId,
      onSelect: () => {},
      onPrev,
      onNext,
      canPrev,
      canNext,
      isLoading: true,
      isAdminView,
    });
  } else if (state === "error" && !hasRenderableDays) {
    content = createElement("div", {
      children: [
        Calendar({
          monthLabel,
          days: expectedDays || [],
          selectedDateId,
          onSelect: () => {},
          onPrev,
          onNext,
          canPrev,
          canNext,
          isAdminView,
        }),
        createElement("div", { className: "error-state", text: "Kunde inte ladda datum." }),
      ],
    });
  } else if (!hasRenderableDays) {
    content = createElement("div", {
      children: [
        Calendar({
          monthLabel,
          days: expectedDays || [],
          selectedDateId,
          onSelect: () => {},
          onPrev,
          onNext,
          canPrev,
          canNext,
          isAdminView,
        }),
        createElement("div", { className: "empty-state", text: "Inga lediga datum hittades." }),
      ],
    });
  } else {
    content = Calendar({
      monthLabel,
      days,
      selectedDateId,
      onSelect,
      onPrev,
      onNext,
      canPrev,
      canNext,
      isAdminView,
    });
  }

  const cancelModal = cancelModalOpen
    ? CancelBookingModal({
        booking: cancelBooking,
        onClose: onCloseCancel,
        onConfirm: onConfirmCancel,
      })
    : null;

  return createElement("section", {
    className: "screen",
    children: [header, content, legend(), cancelModal].filter(Boolean),
  });
};
