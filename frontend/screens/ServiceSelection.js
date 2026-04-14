// Copyright (C) 2026 embsign AB
// SPDX-License-Identifier: AGPL-3.0-only

import { createElement } from "../hooks/dom.js";
import { ServiceGrid } from "../components/ServiceGrid.js";
import { CancelBookingModal } from "../components/CancelBookingModal.js";

const renderSkeleton = () =>
  createElement("div", {
    className: "skeleton-grid",
    children: Array.from({ length: 4 }).map(() =>
      createElement("div", { className: "skeleton skeleton-card" })
    ),
  });

export const ServiceSelection = ({
  services,
  selectedService,
  onSelect,
  state,
  bookings,
  cancelModalOpen,
  cancelBooking,
  onOpenCancel,
  onCloseCancel,
  onConfirmCancel,
  qrWarningOpen,
  qrGenerating,
  qrError,
  qrUrl,
  qrImageUrl,
  qrModalOpen,
  onOpenQrWarning,
  onCloseQrWarning,
  onConfirmQr,
  onCloseQrModal,
  isMobile,
  isKioskMode,
}) => {
  const header = createElement("div", {
    className: "screen-header",
    children: [
      createElement("div"),
    ],
  });

  let content;
  if (state === "loading") {
    content = renderSkeleton();
  } else if (state === "error") {
    content = createElement("div", { className: "error-state", text: "Kunde inte ladda serviceutbud." });
  } else if (!services.length) {
    content = createElement("div", { className: "empty-state", text: "Inga tjänster tillgängliga just nu." });
  } else {
    content = ServiceGrid({
      services,
      selectedId: selectedService?.id,
      onSelect,
    });
  }

  const bookingsSection = createElement("div", {
    className: "bookings-section",
    children: [
      createElement("div", { className: "section-title", text: "Dina bokningar" }),
      bookings?.length
        ? createElement("div", {
            className: "bookings-grid",
            children: bookings.map((booking) =>
              createElement("div", {
                className: `booking-card ${booking.status} ${booking.status === "mine" ? "clickable" : ""}`.trim(),
                onClick: booking.status === "mine" ? () => onOpenCancel(booking) : null,
                children: [
                  createElement("div", { className: "booking-card-title", text: booking.serviceName }),
                  createElement("div", {
                    className: "booking-card-date",
                    children: [
                      createElement("span", { className: "booking-date-day", text: booking.dayLabel }),
                      createElement("strong", { text: booking.dateLabel }),
                    ],
                  }),
                  createElement("div", {
                    className: "booking-card-time",
                    children: [
                      createElement("strong", { text: booking.timeLabel }),
                    ],
                  }),
                ],
              })
            ),
          })
        : createElement("div", { className: "empty-state", text: "Inga aktiva bokningar." }),
      createElement("div", {
        className: "qr-section",
        children: [
          createElement("div", { className: "section-title", text: "Boka med mobilen" }),
          !isMobile
            ? createElement("div", {
                className: "qr-card card",
                children: [
                  createElement("div", {
                    className: "qr-description",
                    text:
                      "För att boka tider med mobilen behöver du en personlig länk för att logga in. Om du inte har en kan du klicka på knappen intill för att generera en QR kod. Denna QR kod ger dig en personlig bokningslänk - dela den bara med andra i ditt hushåll som skall kunna boka. Om du inte har kvar din personliga länk kan du generera en ny med knappen intill.",
                  }),
                  createElement("button", {
                    className: "primary-button",
                    text: qrGenerating ? "Genererar..." : "Generera QR kod",
                    attrs: { disabled: qrGenerating ? "disabled" : null },
                    onClick: onOpenQrWarning,
                  }),
                ],
              })
            : null,
        ].filter(Boolean),
      }),
    ],
  });

  const warningModal = qrWarningOpen
    ? createElement("div", {
        className: "modal-overlay",
        children: [
          createElement("div", {
            className: "modal card",
            children: [
              createElement("div", { className: "modal-title", text: "Generera ny QR-kod?" }),
              createElement("div", {
                className: "screen-subtitle",
                text: "Den nuvarande personliga länken kommer att försvinna och en ny genereras. Är du säker?",
              }),
              qrError
                ? createElement("div", {
                    className: "form-error",
                    text: qrError,
                  })
                : null,
              createElement("div", {
                className: "modal-footer",
                children: [
                  createElement("button", {
                    className: "secondary-button",
                    text: "Avbryt",
                    attrs: { disabled: qrGenerating ? "disabled" : null },
                    onClick: onCloseQrWarning,
                  }),
                  createElement("button", {
                    className: "primary-button",
                    text: qrGenerating ? "Genererar..." : "Generera",
                    attrs: { disabled: qrGenerating ? "disabled" : null },
                    onClick: onConfirmQr,
                  }),
                ],
              }),
            ],
          }),
        ],
      })
    : null;

  const cancelModal = cancelModalOpen
    ? CancelBookingModal({
        booking: cancelBooking,
        onClose: onCloseCancel,
        onConfirm: onConfirmCancel,
      })
    : null;

  const qrModal = qrModalOpen
    ? createElement("div", {
        className: "modal-overlay",
        children: [
          createElement("div", {
            className: "modal card",
            children: [
              createElement("div", { className: "modal-title", text: "Din QR-kod" }),
              qrImageUrl
                ? createElement("img", {
                    className: "qr-image",
                    attrs: {
                      src: qrImageUrl,
                      alt: "QR-kod till din personliga bokningslänk",
                    },
                  })
                : createElement("div", { className: "qr-box qr-box-large", text: "QR" }),
              qrUrl && !isKioskMode
                ? createElement("a", {
                    className: "booking-download-link",
                    text: qrUrl,
                    attrs: {
                      href: qrUrl,
                      target: "_blank",
                      rel: "noopener noreferrer",
                    },
                  })
                : null,
              createElement("div", {
                className: "screen-subtitle",
                text: "QR-koden visas bara en gång. Spara den, t.ex. som bokmärke i telefonen.",
              }),
              createElement("div", {
                className: "modal-footer",
                children: [
                  createElement("button", {
                    className: "primary-button",
                    text: "Stäng",
                    onClick: onCloseQrModal,
                  }),
                ],
              }),
            ],
          }),
        ],
      })
    : null;

  return createElement("section", {
    className: "screen",
    children: [header, content, bookingsSection, warningModal, cancelModal, qrModal].filter(Boolean),
  });
};
