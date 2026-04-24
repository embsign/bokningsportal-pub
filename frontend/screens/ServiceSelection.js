// Copyright (C) 2026 embsign AB
// SPDX-License-Identifier: AGPL-3.0-only

import { createElement } from "../hooks/dom.js";
import { ServiceGrid } from "../components/ServiceGrid.js";
import { CancelBookingModal } from "../components/CancelBookingModal.js";
import { BookingCalendarModal } from "../components/BookingCalendarModal.js";

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
  onCloseCancel,
  onConfirmCancel,
  bookingCalendarModalOpen,
  selectedOverviewBooking,
  onOpenBookingCalendar,
  onOverviewBookingClick,
  onCloseBookingCalendar,
  onCancelFromBookingCalendar,
  qrWarningOpen,
  qrGenerating,
  qrError,
  qrUrl,
  qrImageUrl,
  qrModalOpen,
  hasExistingQr,
  onShowExistingQr,
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
    className: "bookings-section overview-section",
    children: [
      createElement("div", { className: "section-title", text: "Mina bokningar" }),
      bookings?.length
        ? createElement("div", {
            className: "bookings-grid",
            children: bookings.map((booking) =>
              createElement("div", {
                className: `booking-card ${booking.status} ${booking.status === "mine" || booking.status === "blocked" ? "clickable" : ""}`.trim(),
                onClick:
                  booking.status === "mine" || booking.status === "blocked"
                    ? () => onOverviewBookingClick(booking)
                    : null,
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
        : createElement("div", { className: "overview-empty-state", text: "Inga aktiva bokningar." }),
    ],
  });

  const qrSection = createElement("div", {
    className: "qr-section overview-section",
    children: [
      createElement("div", { className: "section-title", text: "Logga in med mobil" }),
      isKioskMode || !isMobile
        ? createElement("div", {
            className: "qr-content",
            children: [
              createElement("div", {
                className: "qr-description",
                children: [
                  createElement("p", {
                    text:
                      "För att boka tider med mobilen behöver du en personlig länk för att logga in. Om du inte har en kan du klicka på knappen intill för att generera en QR kod. Denna QR kod ger dig en personlig bokningslänk - dela den bara med andra i ditt hushåll som skall kunna boka. Du kan visa din personliga inloggningslänk genom att klicka på knappen intill.",
                  }),
                  createElement("p", {
                    text:
                      "Om du är nyinflyttad är det lämpligt att generera en ny QR-kod så att tidigare boende inte kan boka i ditt namn.",
                  }),
                ],
              }),
              createElement("div", {
                className: "qr-actions",
                children: [
                  createElement("button", {
                    className: "secondary-button",
                    text: "Visa befintlig QR-kod",
                    attrs: {
                      disabled: !hasExistingQr || qrGenerating ? "disabled" : null,
                    },
                    onClick: onShowExistingQr,
                  }),
                  createElement("button", {
                    className: "primary-button",
                    text: qrGenerating ? "Genererar..." : "Generera ny QR-kod",
                    attrs: { disabled: qrGenerating ? "disabled" : null },
                    onClick: onOpenQrWarning,
                  }),
                ],
              }),
            ],
          })
        : null,
    ].filter(Boolean),
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

  const bookingCalendarModal = BookingCalendarModal({
    isOpen: bookingCalendarModalOpen,
    booking: selectedOverviewBooking,
    isKioskMode,
    onClose: onCloseBookingCalendar,
    onCancel: onCancelFromBookingCalendar,
  });

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
                text: "Läs av QR-koden med mobiltelefonens kamera och spara länken som bokmärke.",
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
    children: [
      header,
      createElement("div", {
        className: "overview-section",
        children: [createElement("div", { className: "section-title", text: "Bokningsobjekt" }), content],
      }),
      bookingsSection,
      qrSection,
      warningModal,
      cancelModal,
      bookingCalendarModal,
      qrModal,
    ].filter(Boolean),
  });
};
