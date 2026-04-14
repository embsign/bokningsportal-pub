// Copyright (C) 2026 embsign AB
// SPDX-License-Identifier: AGPL-3.0-only

import { createElement } from "../hooks/dom.js";

const formatDateTime = (value) => {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleString("sv-SE");
};

const createOrderModal = ({ open, onCancel, onConfirm }) => {
  if (!open) {
    return null;
  }
  return createElement("div", {
    className: "modal-overlay",
    children: [
      createElement("div", {
        className: "modal card booking-screen-modal",
        children: [
          createElement("div", { className: "modal-title", text: "Beställ bokningsskärmar" }),
          createElement("p", {
            text: "En beställningsförfrågan kommer skickas. Pris: 6,000:-/st inklusive moms.",
          }),
          createElement("div", {
            className: "modal-footer modal-footer-align-end",
            children: [
              createElement("button", {
                className: "secondary-button",
                text: "Avbryt",
                onClick: onCancel,
              }),
              createElement("button", {
                className: "primary-button",
                text: "Bekräfta beställning",
                onClick: onConfirm,
              }),
            ],
          }),
        ],
      }),
    ],
  });
};

const createPairCodeBoxes = (pairingCode, onCodeInput) =>
  createElement("div", {
    className: "pairing-code-grid",
    children: Array.from({ length: 6 }).map((_, index) =>
      createElement("input", {
        className: "pairing-code-cell input",
        attrs: {
          value: pairingCode[index] || "",
          maxlength: "1",
          "data-index": String(index),
          "data-focus-key": `pairingCode-${index}`,
          inputmode: "text",
          autocomplete: "off",
        },
        onInput: (event) => {
          const value = String(event.target.value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
          const current = pairingCode.split("");
          current[index] = value.slice(-1) || "";
          onCodeInput(current.join(""));
          if (value && index < 5) {
            // Re-render replaces inputs; focus next box after DOM update.
            setTimeout(() => {
              const next = document.querySelector(`[data-focus-key="pairingCode-${index + 1}"]`);
              next?.focus?.();
            }, 0);
          }
        },
      })
    ),
  });

const createPairModal = ({ open, pairingCode, pairName, onCodeInput, onNameInput, onCancel, onConfirm }) => {
  if (!open) {
    return null;
  }
  return createElement("div", {
    className: "modal-overlay",
    children: [
      createElement("div", {
        className: "modal card booking-screen-modal",
        children: [
          createElement("div", { className: "modal-title", text: "Koppla bokningsskärm" }),
          createElement("p", {
            text: "Starta surfplattan och skriv in den sex tecken långa kod som visas i kopplingsläget.",
          }),
          createPairCodeBoxes(pairingCode, onCodeInput),
          createElement("label", {
            className: "form-field",
            children: [
              createElement("div", { className: "form-label", text: "Namn på bokningsskärm" }),
              createElement("input", {
                className: "input",
                attrs: { value: pairName, placeholder: "Ex. Entréplan", "data-focus-key": "pairScreenName" },
                onInput: (event) => onNameInput(event.target.value),
              }),
            ],
          }),
          createElement("div", {
            className: "modal-footer modal-footer-align-end",
            children: [
              createElement("button", {
                className: "secondary-button",
                text: "Avbryt",
                onClick: onCancel,
              }),
              createElement("button", {
                className: "primary-button",
                text: "Bekräfta koppling",
                onClick: onConfirm,
              }),
            ],
          }),
        ],
      }),
    ],
  });
};

const createEditModal = ({ open, editName, onNameInput, onCancel, onSave }) => {
  if (!open) {
    return null;
  }
  return createElement("div", {
    className: "modal-overlay",
    children: [
      createElement("div", {
        className: "modal card booking-screen-modal",
        children: [
          createElement("div", { className: "modal-title", text: "Redigera bokningsskärm" }),
          createElement("label", {
            className: "form-field",
            children: [
              createElement("div", { className: "form-label", text: "Namn" }),
              createElement("input", {
                className: "input",
                attrs: { value: editName, "data-focus-key": "editScreenName" },
                onInput: (event) => onNameInput(event.target.value),
              }),
            ],
          }),
          createElement("div", {
            className: "modal-footer modal-footer-align-end",
            children: [
              createElement("button", {
                className: "secondary-button",
                text: "Avbryt",
                onClick: onCancel,
              }),
              createElement("button", {
                className: "primary-button",
                text: "Spara",
                onClick: onSave,
              }),
            ],
          }),
        ],
      }),
    ],
  });
};

const createTable = ({ bookingScreens, onEdit, onDelete }) =>
  createElement("table", {
    className: "admin-table",
    children: [
      createElement("thead", {
        children: [
          createElement("tr", {
            children: [
              createElement("th", { text: "Namn" }),
              createElement("th", { text: "Kopplingskod" }),
              createElement("th", { text: "Senast verifierad" }),
              createElement("th", { text: "Skapad" }),
              createElement("th", { text: "" }),
            ],
          }),
        ],
      }),
      createElement("tbody", {
        children:
          bookingScreens.length > 0
            ? bookingScreens.map((screen) =>
                createElement("tr", {
                  children: [
                    createElement("td", { text: screen.name }),
                    createElement("td", { text: screen.pairingCode }),
                    createElement("td", { text: formatDateTime(screen.lastVerifiedAt || screen.lastSeenAt) }),
                    createElement("td", { text: formatDateTime(screen.createdAt) }),
                    createElement("td", {
                      className: "admin-table-actions",
                      children: [
                        createElement("div", {
                          className: "admin-action-group",
                          children: [
                            createElement("button", {
                              className: "secondary-button admin-btn-edit",
                              text: "Redigera",
                              onClick: () => onEdit(screen),
                            }),
                            createElement("button", {
                              className: "secondary-button admin-btn-delete",
                              text: "Ta bort",
                              onClick: () => onDelete(screen),
                            }),
                          ],
                        }),
                      ],
                    }),
                  ],
                })
              )
            : [
                createElement("tr", {
                  children: [
                    createElement("td", {
                      attrs: { colspan: "5" },
                      text: "Inga bokningsskärmar kopplade ännu.",
                    }),
                  ],
                }),
              ],
      }),
    ],
  });

export const BookingScreensSection = ({
  bookingScreens,
  orderModalOpen,
  pairModalOpen,
  editModalOpen,
  pairingCode,
  pairName,
  editName,
  onOpenOrder,
  onOpenPair,
  onCloseOrder,
  onConfirmOrder,
  onClosePair,
  onConfirmPair,
  onPairCodeInput,
  onPairNameInput,
  onEdit,
  onDelete,
  onCloseEdit,
  onConfirmEdit,
  onEditNameInput,
}) =>
  createElement("div", {
    className: "admin-section card",
    children: [
      createElement("div", {
        className: "admin-section-header",
        children: [
          createElement("div", {
            children: [
              createElement("div", { className: "admin-section-title", text: "Bokningsskärmar" }),
              createElement("div", {
                className: "admin-section-desc",
                text: "Hantera kopplade bokningsskärmar för föreningen.",
              }),
            ],
          }),
          createElement("div", {
            className: "admin-section-actions",
            children: [
              createElement("button", {
                className: "secondary-button admin-btn-edit",
                text: "Beställ",
                onClick: onOpenOrder,
              }),
              createElement("button", {
                className: "secondary-button admin-btn-add",
                text: "Koppla",
                onClick: onOpenPair,
              }),
            ],
          }),
        ],
      }),
      createTable({ bookingScreens, onEdit, onDelete }),
      createOrderModal({
        open: orderModalOpen,
        onCancel: onCloseOrder,
        onConfirm: onConfirmOrder,
      }),
      createPairModal({
        open: pairModalOpen,
        pairingCode,
        pairName,
        onCodeInput: onPairCodeInput,
        onNameInput: onPairNameInput,
        onCancel: onClosePair,
        onConfirm: onConfirmPair,
      }),
      createEditModal({
        open: editModalOpen,
        editName,
        onNameInput: onEditNameInput,
        onCancel: onCloseEdit,
        onSave: onConfirmEdit,
      }),
    ],
  });
