// Copyright (C) 2026 embsign AB
// SPDX-License-Identifier: AGPL-3.0-only

import { createElement } from "../hooks/dom.js";

const stepHeader = (current, total) =>
  createElement("div", {
    className: "modal-step",
    text: `Steg ${current} av ${total}`,
  });

const footer = ({ onBack, onNext, onImport, canNext, showImport, backLabel }) =>
  createElement("div", {
    className: "modal-footer",
    children: [
      createElement("button", {
        className: "secondary-button",
        text: backLabel,
        onClick: onBack,
      }),
      showImport
        ? createElement("button", {
            className: "primary-button",
            text: "Importera",
            onClick: onImport,
          })
        : createElement("button", {
            className: "primary-button",
            text: "Nästa",
            attrs: { disabled: canNext ? null : "disabled" },
            onClick: onNext,
          }),
    ],
  });

export const ImportUsersModal = ({
  open,
  step,
  form,
  mapping,
  preview,
  onClose,
  onNext,
  onPrev,
  onImport,
  onChange,
}) => {
  if (!open) {
    return null;
  }

  const canNext =
    step === 1
      ? Boolean(form.fileName)
      : step === 2
        ? Boolean(mapping.identityField)
        : step === 3
          ? Boolean(form.apartmentField)
          : step < 8;
  const isImporting = Boolean(form.isImporting);

  const step1 = createElement("div", {
    className: "import-step",
    children: [
      stepHeader(1, 8),
      createElement("div", { className: "modal-title", text: "Välj CSV-fil" }),
      createElement("div", {
        className: "form-field",
        children: [
          createElement("div", { className: "form-label", text: "CSV-fil" }),
          createElement("input", {
            className: "input",
            attrs: { type: "file", accept: ".csv" },
            onChange: (event) => {
              const file = event.target.files?.[0];
              onChange("file", file || null);
              onChange("fileName", file?.name || "");
            },
          }),
        ],
      }),
      form.fileName
        ? createElement("div", {
            className: "state-panel",
            text: `Vald fil: ${form.fileName} • ${form.rowCount} rader${
              form.encoding ? ` • ${form.encoding}` : ""
            }`,
          })
        : createElement("div", { className: "empty-state", text: "Ingen fil vald ännu." }),
      form.encodingWarning
        ? createElement("div", { className: "form-error", text: form.encodingWarning })
        : null,
    ],
  });

  const step2 = createElement("div", {
    className: "import-step",
    children: [
      stepHeader(2, 8),
      createElement("div", { className: "modal-title", text: "Välj namn-kolumn" }),
      createElement("div", {
        className: "admin-form-grid",
        children: [
          createElement("label", {
            className: "form-field form-row-inline",
            children: [
              createElement("div", { className: "form-label form-label-inline", text: "Namn" }),
              createElement("select", {
                className: "input",
                onChange: (event) => onChange("identityField", event.target.value),
                children: mapping.headers.map((header) =>
                  createElement("option", {
                    text: header,
                    attrs: {
                      value: header,
                      selected:
                        mapping.identityField === header ||
                        (!mapping.identityField && header === "OrgGrupp")
                          ? "selected"
                          : null,
                    },
                  })
                ),
              }),
            ],
          }),
        ],
      }),
    ],
  });

  const step3 = createElement("div", {
    className: "import-step",
    children: [
      stepHeader(3, 8),
      createElement("div", { className: "modal-title", text: "Lägenhet" }),
      createElement("div", {
        className: "admin-form-grid",
        children: [
          createElement("div", {
            className: "form-group",
            children: [
              createElement("div", { className: "form-group-title", text: "Välj kolumn för lägenhet" }),
              createElement("label", {
                className: "form-field form-row-inline",
                children: [
                  createElement("div", { className: "form-label form-label-inline", text: "Fält" }),
                  createElement("select", {
                    className: "input",
                    onChange: (event) => onChange("apartmentField", event.target.value),
                    children: mapping.headers.map((header) =>
                      createElement("option", {
                        text: header,
                        attrs: { value: header, selected: form.apartmentField === header ? "selected" : null },
                      })
                    ),
                  }),
                ],
              }),
              createElement("label", {
                className: "form-field form-row-inline",
                children: [
                  createElement("div", { className: "form-label form-label-inline", text: "Regex-filter" }),
                  createElement("input", {
                    className: "input",
                    attrs: { value: form.apartmentRegex || "", "data-autofocus": "apartmentRegex" },
                    onInput: (event) => {
                      onChange("apartmentRegex", event.target.value);
                      onChange("importFocus", "apartmentRegex");
                      onChange("importFocusStart", event.target.selectionStart);
                      onChange("importFocusEnd", event.target.selectionEnd);
                    },
                  }),
                ],
              }),
              createElement("div", {
                className: "import-effect",
                children: form.effectApartment.map((row) =>
                  createElement("div", {
                    className: "import-effect-row",
                    children: [
                      createElement("span", { text: row.original }),
                      createElement("span", { text: "⇒" }),
                      createElement("span", { text: row.value }),
                    ],
                  })
                ),
              }),
            ],
          }),
        ],
      }),
    ],
  });

  const step4 = createElement("div", {
    className: "import-step",
    children: [
      stepHeader(4, 8),
      createElement("div", { className: "modal-title", text: "Hus/Trapphus" }),
      createElement("div", {
        className: "screen-subtitle",
        text: "Valfritt – du kan hoppa över det här steget.",
      }),
      createElement("div", {
        className: "admin-form-grid",
        children: [
          createElement("div", {
            className: "form-group",
            children: [
              createElement("div", { className: "form-group-title", text: "Välj kolumn för hus" }),
              createElement("label", {
                className: "form-field form-row-inline",
                children: [
                  createElement("div", { className: "form-label form-label-inline", text: "Fält" }),
                  createElement("select", {
                    className: "input",
                    onChange: (event) => onChange("houseField", event.target.value),
                    children: ["-", ...mapping.headers].map((header) =>
                      createElement("option", {
                        text: header === "-" ? "Hoppa över" : header,
                        attrs: { value: header === "-" ? "-" : header, selected: form.houseField === header ? "selected" : null },
                      })
                    ),
                  }),
                ],
              }),
              form.houseField && form.houseField !== "-"
                ? createElement("label", {
                    className: "form-field form-row-inline",
                    children: [
                      createElement("div", { className: "form-label form-label-inline", text: "Regex-filter" }),
                      createElement("input", {
                        className: "input",
                        attrs: { value: form.houseRegex || "", "data-autofocus": "houseRegex" },
                        onInput: (event) => {
                          onChange("houseRegex", event.target.value);
                          onChange("importFocus", "houseRegex");
                          onChange("importFocusStart", event.target.selectionStart);
                          onChange("importFocusEnd", event.target.selectionEnd);
                        },
                      }),
                    ],
                  })
                : null,
              form.houseField && form.houseField !== "-"
                ? createElement("div", {
                    className: "import-effect",
                    children: form.effectHouse.map((row) =>
                      createElement("div", {
                        className: "import-effect-row",
                        children: [
                          createElement("span", { text: row.original }),
                          createElement("span", { text: "⇒" }),
                          createElement("span", { text: row.value }),
                        ],
                      })
                    ),
                  })
                : null,
            ].filter(Boolean),
          }),
        ],
      }),
    ],
  });

  const adminSelectorModal = form.adminSelectorOpen
    ? createElement("div", {
        className: "modal-overlay modal-overlay-scrollable",
        children: [
          createElement("div", {
            className: "modal card selector-modal",
            children: [
              createElement("div", { className: "modal-title", text: "Välj admin‑grupper" }),
              createElement("div", {
                className: "selector-list",
                onScroll: (event) => onChange("adminSelectorScrollTop", event.target.scrollTop),
                children: (form.adminGroupOptions || []).map((group) =>
                  createElement("label", {
                    className: "selector-option",
                    children: [
                      createElement("input", {
                        attrs: {
                          type: "checkbox",
                          checked: form.adminGroups?.includes(group) ? "checked" : null,
                        },
                      onChange: (event) => {
                        const container = event.currentTarget?.closest(".selector-list");
                        if (container) {
                          onChange("adminSelectorScrollTop", container.scrollTop || 0);
                        }
                        const hasValue = form.adminGroups?.includes(group);
                        const next = hasValue
                          ? form.adminGroups.filter((item) => item !== group)
                          : [...(form.adminGroups || []), group];
                        onChange("adminGroups", next);
                      },
                      }),
                      createElement("span", { text: group }),
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
                    onClick: () => {
                      onChange("adminSelectorOpen", false);
                      onChange("adminSelectorScrollTop", 0);
                    },
                  }),
                ],
              }),
            ],
          }),
        ],
      })
    : null;

  const step5 = createElement("div", {
    className: "import-step",
    children: [
      stepHeader(5, 8),
      createElement("div", { className: "modal-title", text: "Behörigheter" }),
      createElement("div", {
        className: "screen-subtitle",
        text: "Valfritt – hoppa över om CSV saknar behörigheter.",
      }),
      createElement("div", {
        className: "admin-form-grid",
        children: [
          createElement("label", {
            className: "form-field form-row-inline",
            children: [
              createElement("div", { className: "form-label form-label-inline", text: "Fält" }),
              createElement("select", {
                className: "input",
                onChange: (event) => onChange("groupsField", event.target.value),
                children: ["-", ...mapping.headers].map((header) =>
                  createElement("option", {
                    text: header === "-" ? "Hoppa över" : header,
                    attrs: { value: header === "-" ? "-" : header, selected: mapping.groupsField === header ? "selected" : null },
                  })
                ),
              }),
            ],
          }),
          form.groupsField && form.groupsField !== "-"
            ? createElement("label", {
                className: "form-field form-row-inline",
                children: [
                  createElement("div", { className: "form-label form-label-inline", text: "Separator" }),
                  createElement("input", {
                    className: "input",
                    attrs: { value: form.groupSeparator || "", "data-autofocus": "groupSeparator" },
                    onInput: (event) => {
                      onChange("groupSeparator", event.target.value);
                      onChange("importFocus", "groupSeparator");
                      onChange("importFocusStart", event.target.selectionStart);
                      onChange("importFocusEnd", event.target.selectionEnd);
                    },
                  }),
                ],
              })
            : null,
          form.groupsField && form.groupsField !== "-"
            ? createElement("div", {
                className: "import-effect",
                children: form.effectGroups.map((row) =>
                  createElement("div", {
                    className: "import-effect-row",
                    children: [
                      createElement("span", { text: row.original }),
                      createElement("div", {
                        className: "pill-row",
                        children: row.values.map((pill) => createElement("span", { className: "pill", text: pill })),
                      }),
                    ],
                  })
                ),
              })
            : null,
        ].filter(Boolean),
      }),
    ],
  });

  const step6 = createElement("div", {
    className: "import-step",
    children: [
      stepHeader(6, 8),
      createElement("div", { className: "modal-title", text: "Aktiv status" }),
      createElement("div", {
        className: "screen-subtitle",
        text: "Valfritt – välj kolumn för aktiv/inaktiv eller hoppa över.",
      }),
      createElement("div", {
        className: "admin-form-grid",
        children: [
          createElement("label", {
            className: "form-field form-row-inline",
            children: [
              createElement("div", { className: "form-label form-label-inline", text: "Aktiv-fält" }),
              createElement("select", {
                className: "input",
                onChange: (event) => onChange("activeField", event.target.value),
                children: ["-", ...mapping.headers].map((header) =>
                  createElement("option", {
                    text: header === "-" ? "Hoppa över" : header,
                    attrs: { value: header, selected: mapping.activeField === header ? "selected" : null },
                  })
                ),
              }),
            ],
          }),
        ],
      }),
    ],
  });

  const step7 = createElement("div", {
    className: "import-step",
    children: [
      stepHeader(7, 8),
      createElement("div", { className: "modal-title", text: "Adminbehörigheter" }),
      createElement("div", {
        className: "screen-subtitle",
        text: "Välj vilka behörigheter som ger administratörsbehörighet.",
      }),
      createElement("div", {
        className: "form-field",
        children: [
          createElement("div", { className: "form-label", text: "Admin‑grupper" }),
          createElement("div", {
            className: "selector-row",
            children: [
              form.adminGroups?.length
                ? createElement("div", {
                    className: "selected-list",
                    children: form.adminGroups.map((group) =>
                      createElement("label", {
                        className: "selected-item",
                        children: [
                          createElement("input", {
                            attrs: { type: "checkbox", checked: "checked" },
                            onChange: () =>
                              onChange(
                                "adminGroups",
                                form.adminGroups.filter((item) => item !== group)
                              ),
                          }),
                          createElement("span", { text: group }),
                        ],
                      })
                    ),
                  })
                : createElement("div", { className: "selected-empty", text: "Inga valda grupper" }),
              createElement("button", {
                className: "secondary-button admin-btn-select",
                text: "Välj",
                onClick: () => {
                  onChange("adminSelectorOpen", true);
                  onChange("adminSelectorScrollTop", 0);
                },
              }),
            ],
          }),
        ],
      }),
    ],
  });

  const previewContent =
    isImporting
      ? [
          createElement("div", { className: "modal-title", text: "Importerar" }),
          createElement("div", {
            className: "progress-bar",
            children: [
              createElement("div", {
                className: "progress-bar-fill",
                attrs: { style: `width: ${form.progress || 0}%` },
              }),
            ],
          }),
          createElement("div", { className: "screen-subtitle", text: `${form.progress || 0}% klart` }),
        ]
      : [
          createElement("div", { className: "modal-title", text: "Förhandsgranskning" }),
          createElement("div", {
            className: "import-summary",
            children: [
              createElement("div", { className: "status-pill active", text: `${preview.newCount} nya` }),
              createElement("div", { className: "status-pill warning", text: `${preview.updatedCount} uppdateras` }),
              createElement("div", { className: "status-pill inactive", text: `${preview.removedCount} tas bort` }),
              createElement("div", { className: "status-pill", text: `${preview.ignoredCount || 0} ignorerade` }),
              createElement("div", { className: "status-pill", text: `${preview.unchangedCount} oförändrade` }),
            ],
          }),
          createElement("div", {
            className: "import-options",
            children: [
              createElement("label", {
                className: "checkbox-row",
                children: [
                  createElement("input", {
                    attrs: { type: "checkbox", checked: form.addNew ? "checked" : null },
                    onChange: () => onChange("addNew", !form.addNew),
                  }),
                  createElement("span", { text: "Lägg till nya rader" }),
                ],
              }),
              createElement("label", {
                className: "checkbox-row",
                children: [
                  createElement("input", {
                    attrs: { type: "checkbox", checked: form.updateChanged ? "checked" : null },
                    onChange: () => onChange("updateChanged", !form.updateChanged),
                  }),
                  createElement("span", { text: "Uppdatera rader som ändrats" }),
                ],
              }),
              createElement("label", {
                className: "checkbox-row",
                children: [
                  createElement("input", {
                    attrs: { type: "checkbox", checked: form.removeMissing ? "checked" : null },
                    onChange: () => onChange("removeMissing", !form.removeMissing),
                  }),
                  createElement("span", { text: "Radera rader som saknas i filen" }),
                ],
              }),
            ],
          }),
          createElement("div", {
            className: "import-preview-table",
            children: [
              createElement("div", {
                className: "import-preview-row import-preview-header",
                children: [
                  createElement("span", { text: "Namn" }),
                  createElement("span", { text: "Lägenhets ID" }),
                  createElement("span", { text: "Hus/Trapphus" }),
                  createElement("span", { text: "Admin" }),
                  createElement("span", { text: "RFID" }),
                  createElement("span", { text: "Status" }),
                ],
              }),
              ...preview.rows.map((row) =>
                createElement("div", {
                  className: `import-preview-row ${row.statusClass}`,
                  children: [
                    createElement("span", { text: row.identity }),
                    createElement("span", { text: row.apartmentId }),
                    createElement("span", { text: row.house }),
                    createElement("span", { text: row.admin ? "Ja" : "Nej" }),
                    createElement("span", { text: row.rfidStatus || "Oförändrad" }),
                    createElement("span", { text: row.status }),
                  ],
                })
              ),
            ],
          }),
        ];

  const step8 = createElement("div", {
    className: "import-step",
    children: [stepHeader(8, 8), ...previewContent],
  });

  const steps = [step1, step2, step3, step4, step5, step6, step7, step8];
  const content = steps[step - 1] || step1;

  const importCard = createElement("div", {
    className: "modal card import-modal",
    children: [
      content,
      isImporting
        ? null
        : footer({
            onBack: step === 1 ? onClose : onPrev,
            onNext,
            onImport,
            canNext,
            showImport: step === 8,
            backLabel: step === 1 ? "Avbryt" : "Tillbaka",
          }),
    ].filter(Boolean),
  });

  return createElement("div", {
    className: "import-root",
    children: [
      createElement("div", {
        className: "modal-overlay",
        children: [importCard],
      }),
      adminSelectorModal,
    ].filter(Boolean),
  });
};
