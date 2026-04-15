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

const fieldGroup = ({ label, helpText, errorText, children }) =>
  createElement("div", {
    className: "form-field form-row-inline",
    children: [
      createElement("div", { className: "form-label form-label-inline", text: label }),
      createElement("div", {
        className: "form-input-inline",
        children: [
          ...children,
          helpText ? createElement("div", { className: "form-field-hint", text: helpText }) : null,
          errorText ? createElement("div", { className: "form-error", text: errorText }) : null,
        ].filter(Boolean),
      }),
    ],
  });

const buildQuarterHourTimeOptions = () => {
  const options = [];
  for (let hour = 0; hour < 24; hour += 1) {
    for (let minute = 0; minute < 60; minute += 15) {
      const hh = String(hour).padStart(2, "0");
      const mm = String(minute).padStart(2, "0");
      options.push(`${hh}:${mm}`);
    }
  }
  return options;
};

const QUARTER_HOUR_TIME_OPTIONS = buildQuarterHourTimeOptions();
const SLOT_DURATION_OPTIONS = [15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 210, 240, 300, 360];

export const BookingObjectModal = ({
  open,
  mode,
  form,
  validationErrors = {},
  validationError,
  onChange,
  onClose,
  onSave,
  selectorOpenKey,
  selectorScrollTop = 0,
  onSelectorScroll,
  onBookingModalOverlayScroll,
  onOpenSelector,
  onCloseSelector,
  bookingGroups,
  onSelectGroup,
  onUpdateGroupMax,
  groupModalOpen,
  groupNameDraft,
  groupValidationError,
  permissionOptions,
  onGroupNameChange,
  onOpenGroupModal,
  onCloseGroupModal,
  onCreateGroup,
}) => {
  if (!open) {
    return null;
  }

  const title =
    mode === "edit"
      ? "Redigera bokningsobjekt"
      : mode === "copy"
        ? "Kopiera bokningsobjekt"
        : "Lägg till bokningsobjekt";
  const houses = permissionOptions?.houses || [];
  const groups = permissionOptions?.groups || [];
  const apartments = permissionOptions?.apartments || [];
  const selectorOptions = {
    allowHouses: { label: "Hus / Trappuppgång", options: houses },
    allowGroups: { label: "Behörighetsgrupp", options: groups },
    allowApartments: { label: "Enskilda lägenheter", options: apartments },
    denyHouses: { label: "Hus / Trappuppgång", options: houses },
    denyGroups: { label: "Behörighetsgrupp", options: groups },
    denyApartments: { label: "Enskilda lägenheter", options: apartments },
  };

  const renderSelectedList = (value, onUpdate) =>
    value?.length
      ? createElement("div", {
          className: "selected-list",
          children: value.map((option) =>
            createElement("label", {
              className: "selected-item",
              children: [
                createElement("input", {
                  attrs: {
                    type: "checkbox",
                    value: option,
                    checked: "checked",
                  },
                  onChange: () => {
                    const next = value.filter((item) => item !== option);
                    onUpdate(next);
                  },
                }),
                createElement("span", { text: option }),
              ],
            })
          ),
        })
      : createElement("div", { className: "selected-empty", text: "Inget valt" });

  const renderSelectorButton = (key, value, onUpdate) =>
    createElement("div", {
      className: "selector-row",
      children: [
        renderSelectedList(value, onUpdate),
        createElement("button", {
          className: "secondary-button admin-btn-select admin-btn-pick",
          text: "Välj",
          attrs: { type: "button" },
          onClick: () => onOpenSelector(key),
        }),
      ],
    });

  const renderSelectorModal = () => {
    if (!selectorOpenKey) {
      return null;
    }
    const config = selectorOptions[selectorOpenKey];
    const currentValue = form[selectorOpenKey] || [];
    const updateValue = (next) => onChange(selectorOpenKey, next);

    return createElement("div", {
      className: "modal-overlay modal-overlay-scrollable",
      children: [
        createElement("div", {
          className: "modal card selector-modal",
          children: [
            createElement("div", { className: "modal-title", text: `Välj ${config.label}` }),
            createElement("div", {
              className: "selector-list",
              onScroll: (event) => onSelectorScroll?.(event.target.scrollTop),
              children: config.options.map((option) =>
                createElement("label", {
                  className: "selector-option",
                  children: [
                    createElement("input", {
                      attrs: {
                        type: "checkbox",
                        value: option,
                        checked: currentValue.includes(option) ? "checked" : null,
                      },
                      onChange: (event) => {
                        onSelectorScroll?.(
                          event.target.closest(".selector-list")?.scrollTop || selectorScrollTop || 0
                        );
                        const hasValue = currentValue.includes(option);
                        const next = hasValue
                          ? currentValue.filter((item) => item !== option)
                          : [...currentValue, option];
                        updateValue(next);
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

  const modal = createElement("div", {
    className: "modal-overlay",
    children: [
      createElement("div", {
        className: "modal card booking-object-modal",
        children: [
          createElement("div", { className: "modal-title", text: title }),
          createElement("div", {
            className: "booking-object-modal-scroll",
            onScroll: (event) => onBookingModalOverlayScroll?.(event.currentTarget.scrollTop),
            children: [
              createElement("div", {
                className: "admin-form-grid",
                children: [
              createElement("div", {
                className: "form-inline-section-title",
                text: "Grundinställningar",
              }),
              createElement("div", {
                className: "form-field-hint form-inline-section-hint",
                text: "Grunddata för bokningsobjektet och hur det bokas.",
              }),
              field({
                label: "Namn",
                helpText: "Visningsnamn för bokningsobjektet.",
                errorText: validationErrors.name,
                input: createElement("input", {
                  className: "input",
                  attrs: { value: form.name || "", "data-focus-key": "name" },
                  onInput: (event) => onChange("name", event.target.value),
                }),
              }),
              field({
                label: "Typ",
                helpText: "Välj om objektet bokas som tidspass eller dygn.",
                input: createElement("div", {
                  className: "radio-group",
                  children: [
                    createElement("label", {
                      className: "radio-item",
                      children: [
                        createElement("input", {
                          attrs: {
                            type: "radio",
                            name: "booking-type",
                            value: "Tidspass",
                            checked: form.type === "Tidspass" ? "checked" : null,
                          },
                          onChange: () => onChange("type", "Tidspass"),
                        }),
                        createElement("span", { text: "Tidspass" }),
                      ],
                    }),
                    createElement("label", {
                      className: "radio-item",
                      children: [
                        createElement("input", {
                          attrs: {
                            type: "radio",
                            name: "booking-type",
                            value: "Dygn",
                            checked: form.type === "Dygn" ? "checked" : null,
                          },
                          onChange: () => onChange("type", "Dygn"),
                        }),
                        createElement("span", { text: "Dygn" }),
                      ],
                    }),
                  ],
                }),
              }),
              createElement("div", {
                className: "form-inline-section-title",
                text: "Tidsfönster",
              }),
              createElement("div", {
                className: "form-field-hint form-inline-section-hint",
                text: "Välj tider i hela kvartar.",
              }),
              form.type === "Dygn"
                ? fieldGroup({
                    label: "Dygnstid",
                    helpText: "Ange när dygnet börjar och slutar, t.ex. 15:00-11:00.",
                    children: [
                      createElement("div", {
                        className: "form-row form-group",
                        children: [
                          createElement("label", {
                            className: "form-subfield",
                            children: [
                              createElement("span", { text: "Från" }),
                              createElement("select", {
                                className: "input",
                                attrs: { "data-focus-key": "fullDayStartTime" },
                                onChange: (event) => onChange("fullDayStartTime", event.target.value),
                                children: QUARTER_HOUR_TIME_OPTIONS.map((time) =>
                                  createElement("option", {
                                    text: time,
                                    attrs: { value: time, selected: (form.fullDayStartTime || "12:00") === time ? "selected" : null },
                                  })
                                ),
                              }),
                            ],
                          }),
                          createElement("label", {
                            className: "form-subfield",
                            children: [
                              createElement("span", { text: "Till" }),
                              createElement("select", {
                                className: "input",
                                attrs: { "data-focus-key": "fullDayEndTime" },
                                onChange: (event) => onChange("fullDayEndTime", event.target.value),
                                children: QUARTER_HOUR_TIME_OPTIONS.map((time) =>
                                  createElement("option", {
                                    text: time,
                                    attrs: { value: time, selected: (form.fullDayEndTime || "12:00") === time ? "selected" : null },
                                  })
                                ),
                              }),
                            ],
                          }),
                        ],
                      }),
                    ],
                  })
                : null,
              form.type === "Tidspass"
                ? fieldGroup({
                    label: "Tidsfönster för tidspass",
                    helpText: "Ange tidigaste och senaste start/slut för slotar.",
                    errorText: validationErrors.slotEndTime,
                    children: [
                      createElement("div", {
                        className: "form-row form-group",
                        children: [
                          createElement("label", {
                            className: "form-subfield",
                            children: [
                              createElement("span", { text: "Tidigaste tid" }),
                              createElement("select", {
                                className: "input",
                                attrs: { "data-focus-key": "slotStartTime" },
                                onChange: (event) => onChange("slotStartTime", event.target.value),
                                children: QUARTER_HOUR_TIME_OPTIONS.map((time) =>
                                  createElement("option", {
                                    text: time,
                                    attrs: { value: time, selected: (form.slotStartTime || "08:00") === time ? "selected" : null },
                                  })
                                ),
                              }),
                            ],
                          }),
                          createElement("label", {
                            className: "form-subfield",
                            children: [
                              createElement("span", { text: "Senaste tid" }),
                              createElement("select", {
                                className: "input",
                                attrs: { "data-focus-key": "slotEndTime" },
                                onChange: (event) => onChange("slotEndTime", event.target.value),
                                children: QUARTER_HOUR_TIME_OPTIONS.map((time) =>
                                  createElement("option", {
                                    text: time,
                                    attrs: { value: time, selected: (form.slotEndTime || "20:00") === time ? "selected" : null },
                                  })
                                ),
                              }),
                            ],
                          }),
                        ],
                      }),
                    ],
                  })
                : null,
              field({
                label: "Bokningslängd (minuter)",
                helpText: "Välj längd i hela kvartar.",
                errorText: validationErrors.slotDuration,
                input: createElement("select", {
                  className: "input",
                  attrs: { disabled: form.type === "Dygn" ? "disabled" : null, "data-focus-key": "slotDuration" },
                  onChange: (event) => onChange("slotDuration", event.target.value),
                  children: SLOT_DURATION_OPTIONS.map((minutes) =>
                    createElement("option", {
                      text: `${minutes} min`,
                      attrs: { value: String(minutes), selected: String(form.slotDuration || "120") === String(minutes) ? "selected" : null },
                    })
                  ),
                }),
              }),
              createElement("div", {
                className: "form-inline-section-title",
                text: "Bokningsfönster",
              }),
              createElement("div", {
                className: "form-field-hint form-inline-section-hint",
                text: "Styr minsta och största framförhållning i dagar.",
              }),
              fieldGroup({
                label: "Bokningsfönster",
                helpText: "",
                errorText: validationErrors.windowMax,
                children: [
                  createElement("div", {
                    className: "form-row form-group",
                    children: [
                      createElement("label", {
                        className: "form-subfield",
                        children: [
                          createElement("span", { text: "Minsta tid innan bokning (dagar)" }),
                          createElement("input", {
                            className: "input",
                            attrs: { value: form.windowMin || "", "data-focus-key": "windowMin" },
                            onInput: (event) => onChange("windowMin", event.target.value),
                          }),
                        ],
                      }),
                      createElement("label", {
                        className: "form-subfield",
                        children: [
                          createElement("span", { text: "Maximal framförhållning (dagar)" }),
                          createElement("input", {
                            className: "input",
                            attrs: { value: form.windowMax || "", "data-focus-key": "windowMax" },
                            onInput: (event) => onChange("windowMax", event.target.value),
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
              field({
                label: "Max bokningar",
                helpText: "Max antal aktiva bokningar per lägenhet.",
                errorText: validationErrors.maxBookings,
                input: createElement("div", {
                  className: "max-bookings-row",
                  children: [
                    createElement("input", {
                      className: "input input-sm",
                      attrs: {
                        type: "number",
                        min: "1",
                        step: "1",
                        required: "required",
                        value: form.maxBookings || "",
                        "data-focus-key": "maxBookings",
                      },
                      onInput: (event) => {
                        const value = event.target.value;
                        const normalized = value.trim() ? value : "2";
                        onChange("maxBookings", normalized);
                        onUpdateGroupMax?.(normalized);
                      },
                    }),
                    createElement("select", {
                      className: "input",
                      attrs: { "data-focus-key": "groupId" },
                      onChange: (event) => {
                        const value = event.target.value;
                        if (value === "create") {
                          onOpenGroupModal?.();
                          return;
                        }
                        onSelectGroup?.(value);
                      },
                      children: [
                        createElement("option", {
                          text: "Ingen",
                          attrs: { value: "", selected: form.groupId ? null : "selected" },
                        }),
                        ...(bookingGroups || []).map((group) =>
                          createElement("option", {
                            text: group.name,
                            attrs: { value: group.id, selected: form.groupId === group.id ? "selected" : null },
                          })
                        ),
                        createElement("option", { text: "Skapa bokningsgrupp...", attrs: { value: "create" } }),
                      ],
                    }),
                  ],
                }),
              }),
              createElement("div", {
                className: "form-inline-section-title",
                text: "Prissättning",
              }),
              createElement("div", {
                className: "form-field-hint form-inline-section-hint",
                text: "Sätt pris för vardag och helg i kronor.",
              }),
              fieldGroup({
                label: "Pris",
                helpText: "",
                children: [
                  createElement("div", {
                    className: "form-stack form-group",
                    children: [
                      createElement("label", {
                        className: "form-subfield",
                        children: [
                          createElement("span", { text: "Pris per bokning på vardag (kr)" }),
                          createElement("input", {
                            className: "input",
                            attrs: { value: form.priceWeekday || "", "data-focus-key": "priceWeekday" },
                            onInput: (event) => onChange("priceWeekday", event.target.value),
                          }),
                        ],
                      }),
                      createElement("label", {
                        className: "form-subfield",
                        children: [
                          createElement("span", { text: "Pris per bokning på helg (kr)" }),
                          createElement("input", {
                            className: "input",
                            attrs: { value: form.priceWeekend || "", "data-focus-key": "priceWeekend" },
                            onInput: (event) => onChange("priceWeekend", event.target.value),
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
              createElement("div", {
                className: "form-inline-section-title",
                text: "Behörigheter",
              }),
              createElement("div", {
                className: "form-field-hint form-inline-section-hint",
                text: "Styr vilka som får boka objektet via allow- och deny-regler.",
              }),
              fieldGroup({
                label: "Behörigheter",
                helpText: "Standard är att alla har tillgång. Allow begränsar, Deny maskar bort.",
                children: [
                  createElement("div", {
                    className: "permissions-stack",
                    children: [
                      createElement("div", {
                        className: "form-stack form-group",
                        children: [
                          createElement("div", { className: "form-group-title", text: "Allow" }),
                          createElement("label", {
                            className: "form-subfield",
                            children: [
                              createElement("span", { text: "Hus / Trappuppgång" }),
                              renderSelectorButton("allowHouses", form.allowHouses || [], (values) =>
                                onChange("allowHouses", values)
                              ),
                            ],
                          }),
                          createElement("label", {
                            className: "form-subfield",
                            children: [
                              createElement("span", { text: "Behörighetsgrupp" }),
                              renderSelectorButton("allowGroups", form.allowGroups || [], (values) =>
                                onChange("allowGroups", values)
                              ),
                            ],
                          }),
                          createElement("label", {
                            className: "form-subfield",
                            children: [
                              createElement("span", { text: "Enskilda lägenheter" }),
                              renderSelectorButton("allowApartments", form.allowApartments || [], (values) =>
                                onChange("allowApartments", values)
                              ),
                            ],
                          }),
                        ],
                      }),
                      createElement("div", {
                        className: "form-stack form-group",
                        children: [
                          createElement("div", { className: "form-group-title", text: "Deny" }),
                          createElement("label", {
                            className: "form-subfield",
                            children: [
                              createElement("span", { text: "Hus / Trappuppgång" }),
                              renderSelectorButton("denyHouses", form.denyHouses || [], (values) =>
                                onChange("denyHouses", values)
                              ),
                            ],
                          }),
                          createElement("label", {
                            className: "form-subfield",
                            children: [
                              createElement("span", { text: "Behörighetsgrupp" }),
                              renderSelectorButton("denyGroups", form.denyGroups || [], (values) =>
                                onChange("denyGroups", values)
                              ),
                            ],
                          }),
                          createElement("label", {
                            className: "form-subfield",
                            children: [
                              createElement("span", { text: "Enskilda lägenheter" }),
                              renderSelectorButton("denyApartments", form.denyApartments || [], (values) =>
                                onChange("denyApartments", values)
                              ),
                            ],
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
              createElement("div", { className: "form-inline-divider" }),
              field({
                label: "Status",
                helpText: "Aktiv eller inaktiv.",
                input: createElement("div", {
                  className: "radio-group",
                  children: [
                    createElement("label", {
                      className: "radio-item",
                      children: [
                        createElement("input", {
                          attrs: {
                            type: "radio",
                            name: "booking-status",
                            value: "Aktiv",
                            checked: form.status === "Aktiv" ? "checked" : null,
                          },
                          onChange: () => onChange("status", "Aktiv"),
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
                            name: "booking-status",
                            value: "Inaktiv",
                            checked: form.status === "Inaktiv" ? "checked" : null,
                          },
                          onChange: () => onChange("status", "Inaktiv"),
                        }),
                        createElement("span", { text: "Inaktiv" }),
                      ],
                    }),
                  ],
                }),
              }),
            ],
          }),
          validationError
            ? createElement("div", {
                className: "form-error booking-object-modal-general-error",
                text: validationError,
              })
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
    ],
  });

  const selectorModal = renderSelectorModal();

  const groupModal = groupModalOpen
    ? createElement("div", {
        className: "modal-overlay",
        children: [
          createElement("div", {
            className: "modal card",
            children: [
              createElement("div", { className: "modal-title", text: "Lägg till bokningsgrupp" }),
              createElement("div", {
                className: "form-field-hint",
                text: "Gruppnamnet måste vara unikt inom föreningen.",
              }),
              createElement("div", {
                className: "form-field",
                children: [
                  createElement("div", { className: "form-label", text: "Namn" }),
                  createElement("input", {
                    className: "input",
                    attrs: { value: groupNameDraft || "", "data-autofocus": "group-name" },
                    onInput: (event) => onGroupNameChange?.(event.target.value),
                  }),
                ],
              }),
              createElement("div", {
                className: "modal-footer",
                children: [
                  groupValidationError
                    ? createElement("div", {
                        className: "form-error",
                        text: groupValidationError,
                      })
                    : null,
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

  return createElement("div", {
    children: [modal, selectorModal, groupModal].filter(Boolean),
  });
};
