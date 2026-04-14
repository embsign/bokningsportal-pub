// Copyright (C) 2026 embsign AB
// SPDX-License-Identifier: AGPL-3.0-only

import { createElement } from "../hooks/dom.js";

export const buildConfirmModalState = (overrides = {}) => ({
  open: false,
  title: "",
  message: "",
  confirmLabel: "Bekräfta",
  cancelLabel: "Avbryt",
  onConfirm: null,
  ...overrides,
});

export const renderConfirmModal = ({ state, onCancel, onConfirm }) => {
  if (!state?.open) {
    return null;
  }

  return createElement("div", {
    className: "modal-overlay",
    children: [
      createElement("div", {
        className: "modal card confirm-modal",
        attrs: {
          role: "dialog",
          "aria-modal": "true",
          "aria-label": state.title || "Bekräfta",
        },
        children: [
          createElement("div", {
            className: "modal-title",
            text: state.title || "Bekräfta",
          }),
          createElement("p", {
            className: "modal-body-text",
            text: state.message || "",
          }),
          createElement("div", {
            className: "modal-footer modal-footer-align-end",
            children: [
              createElement("button", {
                className: "secondary-button",
                text: state.cancelLabel || "Avbryt",
                onClick: onCancel,
              }),
              createElement("button", {
                className: "primary-button",
                text: state.confirmLabel || "Bekräfta",
                onClick: onConfirm,
              }),
            ],
          }),
        ],
      }),
    ],
  });
};
