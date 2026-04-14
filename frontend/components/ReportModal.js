// Copyright (C) 2026 embsign AB
// SPDX-License-Identifier: AGPL-3.0-only

import { createElement } from "../hooks/dom.js";

const stepHeader = (current, total) =>
  createElement("div", {
    className: "modal-step",
    text: `Steg ${current} av ${total}`,
  });

const footer = ({ onBack, onNext, onDownload, canNext, showDownload }) =>
  createElement("div", {
    className: "modal-footer",
    children: [
      createElement("button", {
        className: "secondary-button",
        text: "Tillbaka",
        onClick: onBack,
      }),
      showDownload
        ? createElement("button", {
            className: "primary-button",
            text: "Ladda ner CSV",
            onClick: onDownload,
          })
        : createElement("button", {
            className: "primary-button",
            text: "Nästa",
            attrs: { disabled: canNext ? null : "disabled" },
            onClick: onNext,
          }),
    ],
  });

export const ReportModal = ({ open, step, form, bookingObjects, onClose, onNext, onPrev, onDownload, onChange }) => {
  if (!open) {
    return null;
  }

  const canNext =
    step === 1 ? Boolean(form.month) : step === 2 ? Boolean(form.bookingObjectId) : true;

  const step1 = createElement("div", {
    className: "import-step",
    children: [
      stepHeader(1, 3),
      createElement("div", { className: "modal-title", text: "Välj månad" }),
      createElement("label", {
        className: "form-field form-row-inline",
        children: [
          createElement("div", { className: "form-label form-label-inline", text: "Månad" }),
          createElement("input", {
            className: "input",
            attrs: { type: "month", value: form.month || "" },
            onInput: (event) => onChange("month", event.target.value),
          }),
        ],
      }),
    ],
  });

  const step2 = createElement("div", {
    className: "import-step",
    children: [
      stepHeader(2, 3),
      createElement("div", { className: "modal-title", text: "Välj bokningsobjekt" }),
      createElement("label", {
        className: "form-field form-row-inline",
        children: [
          createElement("div", { className: "form-label form-label-inline", text: "Bokningsobjekt" }),
          createElement("select", {
            className: "input",
            onChange: (event) => onChange("bookingObjectId", event.target.value),
            children: [
              createElement("option", { text: "Välj", attrs: { value: "" } }),
              ...bookingObjects.map((item) =>
                createElement("option", {
                  text: item.name,
                  attrs: {
                    value: item.id,
                    selected: form.bookingObjectId === item.id ? "selected" : null,
                  },
                })
              ),
            ],
          }),
        ],
      }),
    ],
  });

  const step3 = createElement("div", {
    className: "import-step",
    children: [
      stepHeader(3, 3),
      createElement("div", { className: "modal-title", text: "Ladda hem rapport" }),
      createElement("div", {
        className: "state-panel",
        text: `Rapport för ${form.month || "vald månad"} • ${
          bookingObjects.find((item) => item.id === form.bookingObjectId)?.name || "valt objekt"
        }`,
      }),
      createElement("div", {
        className: "screen-subtitle",
        text: "Klicka för att ladda ner CSV-filen.",
      }),
    ],
  });

  const steps = [step1, step2, step3];
  const content = steps[step - 1] || step1;

  return createElement("div", {
    className: "modal-overlay",
    children: [
      createElement("div", {
        className: "modal card report-modal",
        children: [
          content,
          footer({
            onBack: step === 1 ? onClose : onPrev,
            onNext,
            onDownload,
            canNext,
            showDownload: step === 3,
          }),
        ],
      }),
    ],
  });
};
