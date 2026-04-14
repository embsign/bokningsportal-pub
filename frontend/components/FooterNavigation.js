// Copyright (C) 2026 embsign AB
// SPDX-License-Identifier: AGPL-3.0-only

import { createElement } from "../hooks/dom.js";

export const FooterNavigation = ({
  onBack,
  onNext,
  backLabel = "Tillbaka",
  nextLabel = "Nästa",
  nextDisabled = false,
  showBack = true,
  showNext = true,
}) => {
  return createElement("div", {
    className: "footer-nav card",
    children: [
      createElement("div", {
        className: "footer-left",
        children: [
          showBack
            ? createElement("button", {
                className: "secondary-button",
                text: backLabel,
                onClick: onBack,
              })
            : createElement("div"),
        ],
      }),
      createElement("div", {
        className: "footer-right",
        children: [
          showNext
            ? createElement("button", {
                className: "primary-button",
                text: nextLabel,
                onClick: onNext,
                attrs: { disabled: nextDisabled },
              })
            : createElement("div"),
        ],
      }),
    ],
  });
};
