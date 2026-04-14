// Copyright (C) 2026 embsign AB
// SPDX-License-Identifier: AGPL-3.0-only

import { createElement } from "../hooks/dom.js";
import { BookingSummary } from "../components/BookingSummary.js";

const calendarAction = ({ isKioskMode, calendarQrImageUrl, calendarDownloadUrl }) => {
  if (!calendarDownloadUrl) {
    return null;
  }

  if (isKioskMode && calendarQrImageUrl) {
    return createElement("div", {
      className: "booking-complete-content confirmation-calendar-action",
      children: [
        createElement("div", {
          className: "screen-subtitle",
          text: "Skanna QR-koden för att lägga till bokningen i din mobilkalender.",
        }),
        createElement("img", {
          className: "confirmation-qr-image",
          attrs: {
            src: calendarQrImageUrl,
            alt: "QR-kod för kalenderfil",
          },
        }),
      ],
    });
  }

  return createElement("div", {
    className: "booking-complete-content confirmation-calendar-action",
    children: [
      createElement("div", {
        className: "calendar-download-actions",
        children: [
          createElement("a", {
            className: "calendar-inline-link",
            text: "📆",
            attrs: {
              href: calendarDownloadUrl,
              title: "Ladda ner kalenderfil",
              "aria-label": "Ladda ner kalenderfil",
              target: "_blank",
              rel: "noopener noreferrer",
            },
          }),
        ],
      }),
    ],
  });
};

export const Confirmation = ({
  summary,
  state,
  errorDetail,
  maxBookingsReached,
  confirmed,
  isKioskMode,
  calendarQrImageUrl,
  calendarDownloadUrl,
  onBack,
  onConfirm,
  onAcknowledge,
  confirmDisabled,
  isAdminUser,
  adminUsers,
  bookingAction,
  bookingForUserId,
  onChangeBookingAction,
  onChangeBookingForUserId,
}) => {
  const primaryActionLabel = bookingAction === "block" ? "Blockera" : "Boka";
  let content;
  if (state === "loading") {
    content = createElement("div", { className: "skeleton skeleton-card" });
  } else if (maxBookingsReached && !confirmed) {
    content = createElement("div", {
      className: "error-state",
      text: "Du har nått max antal aktiva bokningar för det här objektet. Avboka en aktiv bokning först.",
    });
  } else if (state === "error") {
    const errorText =
      errorDetail === "max_bookings_reached"
        ? "Du har nått max antal aktiva bokningar för den här bokningsgruppen. Avboka en aktiv bokning först."
        : errorDetail === "outside_booking_window"
          ? "Vald tid ligger utanför tillåtet bokningsfönster."
          : errorDetail === "blocked"
            ? "Tiden är blockerad och kan inte bokas."
            : errorDetail === "target_user_not_found"
              ? "Vald användare hittades inte."
          : errorDetail === "forbidden"
            ? "Du saknar behörighet att boka den här tiden."
            : "Kunde inte skapa bokningen. Försök igen.";
    content = createElement("div", { className: "error-state", text: errorText });
  } else if (!summary) {
    content = createElement("div", { className: "empty-state", text: "Ingen bokning att bekräfta." });
  } else if (confirmed) {
    content = calendarAction({
      isKioskMode,
      calendarQrImageUrl,
      calendarDownloadUrl,
    });
  } else {
    content = BookingSummary({ summary });
  }

  const footer = confirmed
    ? createElement("div", {
        className: "modal-footer modal-footer-align-end",
        children: [
          createElement("button", {
            className: "primary-button",
            text: "OK",
            onClick: onAcknowledge,
          }),
        ],
      })
    : createElement("div", {
        className: "modal-footer",
        children: [
          createElement("button", {
            className: "secondary-button",
            text: "Tillbaka",
            onClick: onBack,
          }),
          !maxBookingsReached
            ? createElement("button", {
                className: "primary-button",
                text: primaryActionLabel,
                onClick: onConfirm,
                attrs: { disabled: confirmDisabled },
              })
            : null,
        ],
      });

  const adminControls =
    !confirmed && isAdminUser
      ? createElement("div", {
          className: "form-stack",
          children: [
            createElement("label", {
              className: "form-subfield",
              children: [
                createElement("span", { text: "Åtgärd" }),
                createElement("select", {
                  className: "input",
                  onChange: (event) => onChangeBookingAction(event.target.value),
                  children: [
                    createElement("option", {
                      text: "Boka till mig",
                      attrs: { value: "self", selected: bookingAction === "self" },
                    }),
                    createElement("option", {
                      text: "Boka åt annan",
                      attrs: { value: "other", selected: bookingAction === "other" },
                    }),
                    createElement("option", {
                      text: "Blockera tid",
                      attrs: { value: "block", selected: bookingAction === "block" },
                    }),
                  ],
                }),
              ],
            }),
            bookingAction === "other"
              ? createElement("label", {
                  className: "form-subfield",
                  children: [
                    createElement("span", { text: "Välj användare" }),
                    createElement("select", {
                      className: "input",
                      onChange: (event) => onChangeBookingForUserId(event.target.value),
                      children: [
                        createElement("option", {
                          text: "Välj användare...",
                          attrs: { value: "", selected: !bookingForUserId },
                        }),
                        ...(adminUsers || []).map((user) =>
                          createElement("option", {
                            text: `${user.apartment_id}${user.house ? ` (${user.house})` : ""}`,
                            attrs: {
                              value: user.id,
                              selected: bookingForUserId === user.id,
                            },
                          })
                        ),
                      ],
                    }),
                  ],
                })
              : null,
          ].filter(Boolean),
        })
      : null;

  const modal = createElement("div", {
    className: "modal card",
    children: [
      createElement("div", { className: "modal-title", text: confirmed ? "Bokning klar" : "Bekräfta bokning" }),
      confirmed
        ? createElement("div", {
            className: "screen-subtitle",
            text: "Tiden är nu bokad och markerad i schemat.",
          })
        : null,
      adminControls,
      content,
      footer,
    ].filter(Boolean),
  });

  return createElement("section", {
    className: "screen",
    children: [createElement("div", { className: "modal-overlay", children: [modal] })],
  });
};
