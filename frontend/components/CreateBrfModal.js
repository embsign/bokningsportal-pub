// Copyright (C) 2026 embsign AB
// SPDX-License-Identifier: AGPL-3.0-only

import { createElement } from "../hooks/dom.js";

const stepHeader = (current, total) =>
  createElement("div", {
    className: "modal-step",
    text: `Steg ${current} av ${total}`,
  });

const footer = ({ onBack, onNext, nextLabel, backLabel, isSubmitting, hideNext }) =>
  createElement("div", {
    className: "modal-footer",
    children: [
      createElement("button", {
        className: "secondary-button",
        text: backLabel,
        attrs: { disabled: isSubmitting ? "disabled" : null },
        onClick: isSubmitting ? null : onBack,
      }),
      hideNext
        ? null
        : createElement("button", {
            className: "primary-button",
            text: isSubmitting ? "Skickar..." : nextLabel,
            attrs: { disabled: isSubmitting ? "disabled" : null },
            onClick: isSubmitting ? null : onNext,
          }),
    ],
  });

export const CreateBrfModal = ({ open, step, form, onClose, onNext, onPrev, onSubmit, onFinish, onChange }) => {
  if (!open) {
    return null;
  }

  const totalSteps = 3;
  const safeStep = Math.min(Math.max(step, 1), totalSteps);
  const nextLabel = safeStep === 2 ? "Registrera" : safeStep === totalSteps ? "Stäng" : "Nästa";
  const backLabel = safeStep === 1 ? "Avbryt" : "Tillbaka";
  const onNextAction = safeStep === 2 ? onSubmit : safeStep === totalSteps ? onFinish : onNext;

  const step1 = createElement("div", {
    className: "create-brf-step",
    children: [
      stepHeader(1, totalSteps),
      createElement("div", { className: "modal-title", text: "Registrering – steg 1" }),
      createElement("div", {
        className: "form-field",
        children: [
          createElement("div", { className: "form-label", text: "Föreningens namn" }),
          createElement("input", {
            className: "input",
            attrs: {
              value: form.name || "",
              placeholder: "BRF Exempel",
              "data-focus-key": "create-brf-name",
            },
            onInput: (event) => onChange("name", event.target.value),
          }),
          form.errors?.name
            ? createElement("div", { className: "form-error", text: form.errors.name })
            : null,
        ],
      }),
      createElement("div", {
        className: "state-panel turnstile-panel",
        children: [
          createElement("div", {
            className: "turnstile-copy",
            text: "Verifiera att du är människa innan du går vidare.",
          }),
          form.turnstileSiteKey
            ? createElement("div", {
                className: "turnstile-widget-host",
                attrs: { id: form.turnstileContainerId || "create-brf-turnstile" },
              })
            : createElement("div", {
                className: "form-error",
                text: "Turnstile är inte konfigurerad. Ange site key i frontend.",
              }),
          form.turnstileError
            ? createElement("div", { className: "form-error", text: form.turnstileError })
            : null,
          form.errors?.turnstile
            ? createElement("div", { className: "form-error", text: form.errors.turnstile })
            : null,
        ],
      }),
    ],
  });

  const step2 = createElement("div", {
    className: "create-brf-step",
    children: [
      stepHeader(2, totalSteps),
      createElement("div", { className: "modal-title", text: "Registrering – steg 2" }),
      createElement("div", {
        className: "form-field",
        children: [
          createElement("div", { className: "form-label", text: "E‑post till föreningen" }),
          createElement("input", {
            className: "input",
            attrs: {
              value: form.email || "",
              placeholder: "styrelsen@brf.se",
              type: "email",
              "data-focus-key": "create-brf-email",
            },
            onInput: (event) => onChange("email", event.target.value),
          }),
          form.errors?.email
            ? createElement("div", { className: "form-error", text: form.errors.email })
            : null,
        ],
      }),
      form.submitError
        ? createElement("div", { className: "form-error", text: form.submitError })
        : null,
      createElement("div", {
        className: "screen-subtitle",
        text: "När du klickar på Registrera skickas ett mejl med en länk för att slutföra setup.",
      }),
    ],
  });

  const step3 = createElement("div", {
    className: "create-brf-step",
    children: [
      stepHeader(3, totalSteps),
      createElement("div", { className: "modal-title", text: "Du har fått ett mail" }),
      createElement("div", {
        className: "screen-subtitle",
        text: "Du skall nu ha fått ett mail med en länk för att slutföra setup. Om du inte ser mailet i din inkorg - kontrollera din spam-mapp.",
      }),
    ],
  });
  const steps = [step1, step2, step3];
  const content = steps[safeStep - 1] || step1;

  const footerConfig =
    safeStep === 3
      ? { onBack: onFinish, backLabel: "Stäng", hideNext: true }
      : { onBack: safeStep === 1 ? onClose : onPrev, backLabel, hideNext: false };

  return createElement("div", {
    className: "modal-overlay",
    children: [
      createElement("div", {
        className: "modal card create-brf-modal",
        children: [
          content,
          footer({
            onBack: footerConfig.onBack,
            onNext: onNextAction,
            nextLabel,
            backLabel: footerConfig.backLabel,
            isSubmitting: Boolean(form.isSubmitting),
            hideNext: footerConfig.hideNext,
          }),
        ],
      }),
    ],
  });
};
