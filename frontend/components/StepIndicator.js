// Copyright (C) 2026 embsign AB
// SPDX-License-Identifier: AGPL-3.0-only

import { createElement } from "../hooks/dom.js";

export const StepIndicator = ({ steps, currentStep }) => {
  const items = steps.map((step, index) => {
    const stepNumber = index + 1;
    const status =
      stepNumber < currentStep ? "complete" : stepNumber === currentStep ? "active" : "";
    return createElement("div", {
      className: `step ${status}`.trim(),
      children: [
        createElement("span", { className: "step-index", text: stepNumber }),
        createElement("span", { text: step }),
      ],
    });
  });

  return createElement("div", { className: "step-indicator card", children: items });
};
