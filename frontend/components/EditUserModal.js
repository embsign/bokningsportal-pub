// Copyright (C) 2026 embsign AB
// SPDX-License-Identifier: AGPL-3.0-only

import { createElement } from "../hooks/dom.js";

const field = ({ label, input, helpText, errorText }) =>
  createElement("label", {
    className: "form-field form-row-inline",
    children: [
      createElement("div", { className: "form-label form-label-inline", text: label }),
      createElement("div", {
        className: "form-input-inline",
        children: [
          input,
          helpText ? createElement("div", { className: "form-field-hint", text: helpText }) : null,
          errorText ? createElement("div", { className: "form-error", text: errorText }) : null,
        ].filter(Boolean),
      }),
    ],
  });

const removableItemsTable = ({ values = [], emptyText, onRemove }) =>
  values.length
    ? createElement("div", {
        className: "selected-list-table-wrap",
        children: [
          createElement("table", {
            className: "admin-table selected-list-table",
            children: [
              createElement("tbody", {
                children: values.map((value) =>
                  createElement("tr", {
                    children: [
                      createElement("td", { text: value }),
                      createElement("td", {
                        className: "admin-table-actions",
                        children: [
                          createElement("button", {
                            className: "secondary-button admin-btn-delete admin-btn-compact",
                            text: "Ta bort",
                            onClick: () => onRemove(value),
                          }),
                        ],
                      }),
                    ],
                  })
                ),
              }),
            ],
          }),
        ],
      })
    : createElement("div", { className: "selected-empty", text: emptyText || "Inget valt" });

export const EditUserModal = ({
  open,
  mode,
  form,
  groupOptions,
  selectorOpen,
  addRfidOpen,
  onOpenAddRfid,
  onCloseAddRfid,
  onSubmitAddRfid,
  rfidDraft,
  onRfidDraftChange,
  onOpenSelector,
  onCloseSelector,
  onChange,
  onClose,
  onSave,
  groupNameDraft,
  groupModalOpen,
  onOpenGroupModal,
  onCloseGroupModal,
  onGroupNameChange,
  onCreateGroup,
  onConfirmRemoveRfidTag,
  onConfirmRemoveGroup,
  validationErrors = {},
  adminLoginQr = false,
  loginQrUrl = "",
  loginQrLoading = false,
  loginQrError = "",
  loginQrRotating = false,
  loginQrImageSrc = "",
  onRotateLoginQr,
  onDownloadLoginQrPdf,
}) => {
  if (!open) {
    return null;
  }

  const renderSelectorModal = () => {
    if (!selectorOpen) {
      return null;
    }

    return createElement("div", {
      className: "modal-overlay",
      children: [
        createElement("div", {
          className: "modal card",
          children: [
            createElement("div", { className: "modal-title", text: "Välj behörighetsgrupper" }),
            createElement("div", {
              className: "selector-list",
              children: groupOptions.map((option) =>
                createElement("label", {
                  className: "selector-option",
                  children: [
                    createElement("input", {
                      attrs: {
                        type: "checkbox",
                        value: option,
                        checked: form.groups?.includes(option) ? "checked" : null,
                      },
                      onChange: () => {
                        const hasValue = form.groups?.includes(option);
                        const next = hasValue
                          ? form.groups.filter((item) => item !== option)
                          : [...(form.groups || []), option];
                        onChange("groups", next);
                      },
                    }),
                    createElement("span", { text: option }),
                  ],
                })
              ),
            }),
            createElement("div", {
              className: "modal-footer",
              children: [
                createElement("button", {
                  className: "primary-button",
                  text: "Klar",
                  onClick: onCloseSelector,
                }),
              ],
            }),
          ],
        }),
      ],
    });
  };

  const addRfidModal = addRfidOpen
    ? createElement("div", {
        className: "modal-overlay",
        children: [
          createElement("div", {
            className: "modal card",
            children: [
              createElement("div", { className: "modal-title", text: "Lägg till RFID-tag" }),
              createElement("div", {
                className: "form-field-hint",
                text: "Ange taggens UID i hex (ofta skrivs det ut som 8-14 tecken). Samma tagg kan inte delas mellan två konton i samma förening.",
              }),
              createElement("div", {
                className: "form-field",
                children: [
                  createElement("div", { className: "form-label", text: "RFID UID" }),
                  createElement("input", {
                    className: "input",
                    attrs: {
                      value: rfidDraft || "",
                      placeholder: "Ny RFID-tag",
                      "data-autofocus": "edit-user-rfid",
                    },
                    onInput: (event) => onRfidDraftChange?.(event.target.value),
                  }),
                ],
              }),
              createElement("div", {
                className: "modal-footer",
                children: [
                  createElement("button", {
                    className: "secondary-button",
                    text: "Avbryt",
                    onClick: onCloseAddRfid,
                  }),
                  createElement("button", {
                    className: "primary-button admin-btn-add",
                    text: "Lägg till",
                    onClick: onSubmitAddRfid,
                  }),
                ],
              }),
            ],
          }),
        ],
      })
    : null;

  const groupModal = groupModalOpen
    ? createElement("div", {
        className: "modal-overlay",
        children: [
          createElement("div", {
            className: "modal card",
            children: [
              createElement("div", { className: "modal-title", text: "Skapa behörighetsgrupp" }),
              createElement("div", {
                className: "form-field-hint",
                text: "Gruppnamnet måste vara unikt inom föreningen. Du kopplar sedan bokningsobjekt till grupper för att styra vem som får boka vad.",
              }),
              createElement("div", {
                className: "form-field",
                children: [
                  createElement("div", { className: "form-label", text: "Namn" }),
                  createElement("input", {
                    className: "input",
                    attrs: {
                      value: groupNameDraft || "",
                      placeholder: "Ny grupp",
                      "data-autofocus": "edit-user-group",
                    },
                    onInput: (event) => onGroupNameChange?.(event.target.value),
                  }),
                ],
              }),
              createElement("div", {
                className: "modal-footer",
                children: [
                  createElement("button", {
                    className: "secondary-button",
                    text: "Avbryt",
                    onClick: onCloseGroupModal,
                  }),
                  createElement("button", {
                    className: "primary-button admin-btn-add",
                    text: "Lägg till",
                    onClick: onCreateGroup,
                  }),
                ],
              }),
            ],
          }),
        ],
      })
    : null;

  const loginQrSection = !adminLoginQr
    ? null
    : createElement("div", {
        className: "edit-user-qr-section",
        children: [
          createElement("div", { className: "form-inline-section-title", text: "Bokningslänk (QR)" }),
          createElement("div", {
            className: "form-field-hint form-inline-section-hint",
            text: "Personlig inloggningslänk för bokningsportalen. Gamla utskrifter och bokmärken slutar fungera om du genererar en ny länk.",
          }),
          mode === "create"
            ? createElement("div", {
                className: "form-field-hint",
                text: "Spara lägenheten först. Öppna sedan redigering för att se QR-kod och ladda ned PDF.",
              })
            : createElement("div", {
                className: "form-field form-inline-section-content edit-user-qr-block",
                children: [
                  loginQrLoading
                    ? createElement("div", { className: "form-field-hint", text: "Hämtar bokningslänk…" })
                    : null,
                  loginQrError ? createElement("div", { className: "form-error", text: loginQrError }) : null,
                  !loginQrLoading && loginQrUrl
                    ? createElement("div", {
                        className: "edit-user-qr-preview",
                        children: [
                          createElement("img", {
                            attrs: {
                              src: loginQrImageSrc,
                              width: 200,
                              height: 200,
                              alt: "",
                            },
                          }),
                        ],
                      })
                    : null,
                  !loginQrLoading && !loginQrUrl && !loginQrError
                    ? createElement("div", { className: "form-field-hint", text: "Ingen länk kunde visas." })
                    : null,
                  loginQrUrl && !loginQrLoading
                    ? createElement("div", {
                        className: "edit-user-qr-actions",
                        children: [
                          createElement("button", {
                            className: "secondary-button",
                            text: loginQrRotating ? "Byter…" : "Ny länk / QR",
                            attrs: { disabled: loginQrRotating ? "disabled" : null },
                            onClick: () => onRotateLoginQr?.(),
                          }),
                          createElement("button", {
                            className: "secondary-button",
                            text: "Ladda ned PDF",
                            attrs: { disabled: loginQrRotating ? "disabled" : null },
                            onClick: () => onDownloadLoginQrPdf?.(),
                          }),
                        ],
                      })
                    : null,
                ].filter(Boolean),
              }),
        ].filter(Boolean),
      });

  return createElement("div", {
    className: "modal-overlay",
    children: [
      createElement("div", {
        className: "modal card edit-user-modal",
        children: [
          createElement("div", {
            className: "modal-title",
            text: mode === "create" ? "Lägg till lägenhet" : "Redigera lägenhet",
          }),
          createElement("div", {
            className: "edit-user-modal-scroll",
            children: [
              createElement("div", {
                className: "admin-form-grid",
                children: [
              field({
                label: "Lägenhets ID",
                input: createElement("input", {
                  className: "input",
                  attrs: { value: form.apartmentId || "", "data-focus-key": "editUserApartmentId" },
                  onInput: (event) => onChange("apartmentId", event.target.value),
                }),
                helpText:
                  "Det interna ID:t för lägenheten - förslagsvis samma som ni använder i era interna system. Måste vara unikt.",
                errorText: validationErrors.apartmentId,
              }),
              field({
                label: "Hus/Trapphus (valfritt)",
                input: createElement("input", {
                  className: "input",
                  attrs: { value: form.house || "", "data-focus-key": "editUserHouse" },
                  onInput: (event) => onChange("house", event.target.value),
                }),
                helpText:
                  'Kan användas för att styra tillgång till olika bokningsobjekt. T.ex. "3B".',
              }),
              createElement("div", {
                className: "form-inline-section-title",
                text: "RFID-taggar (valfritt)",
              }),
              createElement("div", {
                className: "form-field-hint form-inline-section-hint",
                text: "Lägg till UID på de taggar som lägenheten ska kunna logga in med på en bokningstavla.",
              }),
              createElement("div", {
                className: "form-field form-inline-section-content",
                children: [
                  validationErrors.rfidTags ? createElement("div", { className: "form-error", text: validationErrors.rfidTags }) : null,
                  createElement("div", {
                    className: "selector-row selector-row-table",
                    children: [
                      removableItemsTable({
                        values: form.rfidTags || [],
                        emptyText: "Inga RFID-taggar",
                        onRemove: (value) => {
                          onConfirmRemoveRfidTag?.(value);
                        },
                      }),
                      createElement("button", {
                        className: "secondary-button admin-btn-add",
                        text: "Lägg till",
                        onClick: onOpenAddRfid,
                      }),
                    ],
                  }),
                ],
              }),
              createElement("div", {
                className: "form-inline-section-title",
                text: "Behörighetsgrupper (valfritt)",
              }),
              createElement("div", {
                className: "form-field-hint form-inline-section-hint",
                text: "Skapa nya eller välj existerande behörighetsgrupper för att styra tillgång till olika bokningsobjekt.",
              }),
              createElement("div", {
                className: "form-field form-inline-section-content",
                children: [
                  createElement("div", {
                    className: "selector-row selector-row-table",
                    children: [
                      removableItemsTable({
                        values: form.groups || [],
                        emptyText: "Inga behörighetsgrupper",
                        onRemove: (value) => {
                          onConfirmRemoveGroup?.(value);
                        },
                      }),
                      createElement("div", {
                        className: "modal-action-stack",
                        children: [
                          createElement("button", {
                            className: "secondary-button admin-btn-select admin-btn-pick",
                            text: "Välj",
                            onClick: onOpenSelector,
                          }),
                          createElement("button", {
                            className: "secondary-button admin-btn-add",
                            text: "Skapa behörighetsgrupp",
                            onClick: onOpenGroupModal,
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
              createElement("div", { className: "form-inline-divider" }),
              field({
                label: "Admin",
                input: createElement("label", {
                  className: "checkbox-row",
                  children: [
                    createElement("input", {
                      attrs: { type: "checkbox", checked: form.admin ? "checked" : null },
                      onChange: () => onChange("admin", !form.admin),
                    }),
                    createElement("span", { text: "Kan administrera bokningar åt andra" }),
                  ],
                }),
                helpText:
                  "Gör det möjligt för användaren att boka och boka av åt andra, samt blockera tider/dagar. Lämpligt för styrelse och fastighetsskötare.",
              }),
              field({
                label: "Status",
                input: createElement("div", {
                  className: "radio-group",
                  children: [
                    createElement("label", {
                      className: "radio-item",
                      children: [
                        createElement("input", {
                          attrs: {
                            type: "radio",
                            name: "user-status",
                            value: "Aktiv",
                            checked: form.active ? "checked" : null,
                          },
                          onChange: () => onChange("active", true),
                        }),
                        createElement("span", { text: "Aktiv" }),
                      ],
                    }),
                    createElement("label", {
                      className: "radio-item",
                      children: [
                        createElement("input", {
                          attrs: {
                            type: "radio",
                            name: "user-status",
                            value: "Inaktiv",
                            checked: form.active ? null : "checked",
                          },
                          onChange: () => onChange("active", false),
                        }),
                        createElement("span", { text: "Inaktiv" }),
                      ],
                    }),
                  ],
                }),
                helpText:
                  "Används för att inaktivera konton. Inaktiv användare kan inte logga in - en administratör kan dock fortfarande skapa bokningar.",
              }),
              ...(adminLoginQr
                ? [createElement("div", { className: "form-inline-divider" }), loginQrSection]
                : []),
            ].filter(Boolean),
          }),
          validationErrors.general
            ? createElement("div", { className: "form-error edit-user-modal-general-error", text: validationErrors.general })
            : null,
            ].filter(Boolean),
          }),
          createElement("div", {
            className: "modal-footer",
            children: [
              createElement("button", {
                className: "secondary-button",
                text: "Avbryt",
                onClick: onClose,
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
      renderSelectorModal(),
      addRfidModal,
      groupModal,
    ].filter(Boolean),
  });
};
