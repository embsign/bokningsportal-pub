// Copyright (C) 2026 embsign AB
// SPDX-License-Identifier: AGPL-3.0-only

import landingScreenUrl from "./img/screen.png";
import { Header } from "./components/Header.js";
import { ServiceSelection } from "./screens/ServiceSelection.js";
import { DateSelection } from "./screens/DateSelection.js";
import { TimeSelection } from "./screens/TimeSelection.js";
import { Confirmation } from "./screens/Confirmation.js";
import { AdminDashboard } from "./screens/AdminDashboard.js";
import { BookingObjectModal } from "./components/BookingObjectModal.js";
import { CreateBrfModal } from "./components/CreateBrfModal.js";
import { ImportUsersModal } from "./components/ImportUsersModal.js";
import { EditUserModal } from "./components/EditUserModal.js";
import { ReportModal } from "./components/ReportModal.js";
import { BookingObjectsTable } from "./components/BookingObjectsTable.js";
import { UserList } from "./components/UserList.js";
import { createBookingSummary } from "./utils/bookingSummary.js";
import { buildCalendarDownloadPageUrl, buildCalendarQrImageUrl } from "./utils/calendarExport.js";
import { buildConfirmModalState, renderConfirmModal } from "./utils/confirmModal.js";
import { getSession, getBootstrap, rotatePersonalLoginLink, getDemoLinks } from "./api/session.js";
import { getPublicConfig } from "./api/config.js";
import { setAccessToken } from "./api/client.js";
import { registerBrf, verifyBrfSetup, completeBrfSetup } from "./api/brf.js";
import { getCurrentBookings, createBooking, cancelBooking } from "./api/bookings.js";
import { getBookableUsers } from "./api/users.js";
import {
  getMonthAvailability,
  getMonthLabel,
  getWeekAvailability,
  getWeekStart,
  weekAvailabilityStateKey,
} from "./api/availability.js";
import {
  getBookingGroups,
  getBookingObjects,
  getBookingScreens,
  getUsers,
  updateUser,
  createUser,
  deleteUser,
  getAccessGroups,
  createAccessGroup,
  createBookingGroup,
  createBookingObject,
  updateBookingObject,
  deactivateBookingObject,
  getUserLoginQrExportData,
  getImportRules,
  saveImportRules,
  previewImport,
  applyImport,
  downloadReportCsv,
  orderBookingScreens,
  pairBookingScreen,
  updateBookingScreen,
  deleteBookingScreen,
  getAdminUserLoginQr,
  rotateAdminUserLoginQr,
} from "./api/admin.js";
import { createStore } from "./hooks/useStore.js";
import { createElement, clearElement } from "./hooks/dom.js";
import { downloadApartmentLoginQrPdf } from "./utils/apartmentQrPdf.js";

const app = document.getElementById("app");
const path = window.location.pathname;
const rawHash = window.location.hash.replace(/^#/, "");
const hashPath = rawHash
  ? rawHash.startsWith("/")
    ? rawHash
    : `/${rawHash}`
  : "";
// Direktlänkar (/admin/, /user/, /setup/) måste vinna över hash — annars kan en gammal #‑route
// från tidigare besök skicka fel token till API (t.ex. ogiltig setup‑signatur).
const routePath = /^\/(admin|user|setup)\//.test(path) ? path : hashPath || path;
const buildQrImageUrl = (targetUrl, size = 320) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(targetUrl)}`;

/** Skroll i bokningsobjekt-modalen får inte skrivas till store (varje skrollevent skulle rendera om hela appen). */
let adminBookingObjectModalScrollTop = 0;
let setupBookingObjectModalScrollTop = 0;
const TURNSTILE_SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const ensureTurnstileScript = (() => {
  let promise = null;
  return () => {
    if (typeof window === "undefined") {
      return Promise.reject(new Error("turnstile_unavailable"));
    }
    if (window.turnstile) {
      return Promise.resolve(window.turnstile);
    }
    if (!promise) {
      promise = new Promise((resolve, reject) => {
        const existing = document.querySelector('script[src^="https://challenges.cloudflare.com/turnstile/"]');
        if (existing) {
          existing.addEventListener(
            "load",
            () => resolve(window.turnstile),
            { once: true }
          );
          existing.addEventListener(
            "error",
            () => reject(new Error("turnstile_script_load_failed")),
            { once: true }
          );
          return;
        }
        const script = document.createElement("script");
        script.src = TURNSTILE_SCRIPT_SRC;
        script.async = true;
        script.defer = true;
        script.onload = () => resolve(window.turnstile);
        script.onerror = () => reject(new Error("turnstile_script_load_failed"));
        document.head.append(script);
      });
    }
    return promise;
  };
})();
const openHelp = () => {
  window.alert(
    "Hjälp\n\nBoka genom att välja objekt, vecka/datum och tid.\nVid problem med behörighet eller bokning, kontakta styrelsen/förvaltaren."
  );
};

const createLegalFooter = () =>
  createElement("footer", { className: "legal-footer" }, [
    createElement("span", {}, "Copyright (c) 2026 "),
    createElement(
      "a",
      {
        attrs: {
          href: "https://embsign.se",
          target: "_blank",
          rel: "noopener noreferrer",
        },
      },
      "embsign AB"
    ),
    createElement("span", {}, ". "),
    createElement(
      "span",
      {},
      "Tjänsten är släppt under "
    ),
    createElement(
      "a",
      {
        attrs: {
          href: "https://github.com/embsign/bokningsportal-pub",
          target: "_blank",
          rel: "noopener noreferrer",
        },
      },
      "AGPL"
    ),
    createElement("span", {}, "."),
  ]);
const DEFAULT_MAX_BOOKINGS = "2";
const parseRequiredPositiveInt = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};
const normalizeRequiredMaxBookings = (value) => {
  const parsed = parseRequiredPositiveInt(value);
  return parsed === null ? null : String(parsed);
};

const getMinutesFromClock = (value, fallback = "00:00") => {
  const raw = String(value || "").trim();
  const t = /^\d{2}:\d{2}$/.test(raw) ? raw : fallback;
  const [h, m] = t.split(":").map((part) => Number(part));
  return h * 60 + m;
};

const validateBookingObjectForm = (form) => {
  const errors = {};
  const name = String(form?.name || "").trim();
  if (!name) errors.name = "Ange ett namn för bokningsobjektet.";
  const windowMin = Number(form?.windowMin ?? 0);
  const windowMax = Number(form?.windowMax ?? 0);
  if (Number.isFinite(windowMin) && Number.isFinite(windowMax) && windowMin > windowMax) {
    errors.windowMax = "Minsta tid innan bokning får inte vara större än maximal framförhållning.";
  }
  if (form?.type === "Tidspass") {
    const sm = getMinutesFromClock(form.slotStartTime, "08:00");
    const em = getMinutesFromClock(form.slotEndTime, "20:00");
    if (em <= sm) {
      errors.slotEndTime = "Senaste tid måste vara efter tidigaste tid för tidspass.";
    }
    const slotDur = Number(form.slotDuration);
    if (Number.isFinite(slotDur) && slotDur > 0 && em - sm < slotDur) {
      errors.slotDuration = "Bokningslängden får inte vara längre än tidsfönstret.";
    }
  }
  return errors;
};

const BOOKING_MODAL_VALIDATION_RESET_FIELDS = new Set([
  "name",
  "type",
  "slotStartTime",
  "slotEndTime",
  "fullDayStartTime",
  "fullDayEndTime",
  "slotDuration",
  "windowMin",
  "windowMax",
  "maxBookings",
]);
const buildEmptyUserForm = () => ({
  apartmentId: "",
  house: "",
  groups: [],
  rfidTags: [],
  rfidDraft: "",
  rfid: "",
  active: true,
  admin: false,
});
const buildUserFormFromUser = (user) => ({
  apartmentId: user?.apartmentId || "",
  house: user?.house || "",
  groups: user?.groups || [],
  rfidTags: user?.rfidTags || (user?.rfid ? [user.rfid] : []),
  rfidDraft: "",
  rfid: user?.rfid || "",
  active: user?.active !== false,
  admin: user?.admin === true,
});
const validateUserForm = (form) => {
  const errors = {};
  const apartmentId = String(form?.apartmentId || "").trim();
  if (!apartmentId) {
    errors.apartmentId = "Lägenhets ID krävs.";
  }
  return errors;
};
const clearUserValidationErrorsForField = (errors = {}, field) => {
  const next = { ...(errors || {}) };
  delete next.general;
  if (field === "apartmentId") {
    delete next.apartmentId;
  }
  if (field === "rfid" || field === "rfidTags") {
    delete next.rfidTags;
  }
  return next;
};
const getUserSaveValidationErrors = (error) => {
  const detail = String(error?.detail || error?.message || "");
  if (detail.startsWith("invalid_rfid_format:")) {
    const sample = detail.split(":").slice(1).join(":").trim();
    return {
      rfidTags: sample
        ? `Ogiltigt RFID-format: ${sample}. Ange UID i giltigt format.`
        : "Ett eller flera RFID-värden har ogiltigt format.",
    };
  }
  if (detail === "invalid_payload") {
    return { apartmentId: "Ange Lägenhets ID." };
  }
  if (detail === "apartment_id_taken") {
    return {
      apartmentId: "Det finns redan en lägenhet med detta lägenhets-ID. Välj ett annat ID.",
    };
  }
  return { general: "Kunde inte spara användaren. Kontrollera fälten och försök igen." };
};
const toSortedUniqueStrings = (values = []) =>
  Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, "sv", { numeric: true, sensitivity: "base" }));
const buildPermissionOptions = ({ users = [], accessGroups = [] } = {}) => {
  const userGroups = users.flatMap((user) => user.groups || []);
  return {
    houses: toSortedUniqueStrings(users.map((user) => user.house)),
    groups: toSortedUniqueStrings([...(accessGroups || []), ...userGroups]),
    apartments: toSortedUniqueStrings(users.map((user) => user.apartmentId)),
  };
};
const logout = () => {
  setAccessToken(null);
  window.location.assign("/");
};

const detectCsvDelimiter = (line) => {
  const candidates = [",", ";", "\t"];
  let best = ",";
  let bestCount = -1;
  candidates.forEach((delimiter) => {
    const count = line.split(delimiter).length - 1;
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  });
  return best;
};

const parseCsvRows = (csvText, delimiterOverride) => {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;
  const delimiter = delimiterOverride || detectCsvDelimiter(csvText.split(/\r?\n/)[0] || "");
  for (let i = 0; i < csvText.length; i += 1) {
    const char = csvText[i];
    if (char === '"') {
      if (inQuotes && csvText[i + 1] === '"') {
        value += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === delimiter && !inQuotes) {
      row.push(value);
      value = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && csvText[i + 1] === "\n") {
        i += 1;
      }
      row.push(value);
      value = "";
      if (row.length > 1 || row[0] !== "") {
        rows.push(row);
      }
      row = [];
      continue;
    }
    value += char;
  }
  row.push(value);
  if (row.length > 1 || row[0] !== "") {
    rows.push(row);
  }
  const headers = rows.shift() || [];
  return { headers, rows };
};

const extractCsvGroups = (csvText, groupsField, separator) => {
  if (!csvText || !groupsField || groupsField === "-") {
    return [];
  }
  const { headers, rows } = parseCsvRows(csvText);
  const index = headers.indexOf(groupsField);
  if (index === -1) {
    return [];
  }
  const sep = separator || "|";
  const found = new Set();
  rows.forEach((row) => {
    const raw = row[index] || "";
    raw
      .split(sep)
      .map((value) => value.trim())
      .filter(Boolean)
      .forEach((value) => found.add(value));
  });
  return Array.from(found).sort((a, b) => a.localeCompare(b));
};

const extractCsvColumnSamples = (csvText, field, limit = 5) => {
  if (!csvText || !field || field === "-") {
    return [];
  }
  const { headers, rows } = parseCsvRows(csvText);
  const index = headers.indexOf(field);
  if (index === -1) {
    return [];
  }
  const values = rows.map((row) => (row[index] || "").trim()).filter(Boolean);
  if (!values.length) {
    return [];
  }
  const picks = new Set();
  picks.add(0);
  const remaining = Math.min(limit - 1, values.length - 1);
  if (remaining > 0) {
    const step = Math.max(1, Math.floor((values.length - 1) / remaining));
    for (let i = 1; i <= remaining; i += 1) {
      picks.add(Math.min(values.length - 1, i * step));
    }
  }
  const samples = Array.from(picks)
    .sort((a, b) => a - b)
    .map((index) => values[index]);
  return samples;
};

const buildGroupEffect = (samples, separator) =>
  samples.map((original) => ({
    original,
    values: original
      .split(separator || "|")
      .map((value) => value.trim())
      .filter(Boolean),
  }));

const updateImportSamples = (prev, next = {}) => {
  const csvText = next.importCsvText ?? prev.importCsvText;
  const houseField = next.houseField ?? prev.houseField;
  const apartmentField = next.apartmentField ?? prev.apartmentField;
  const groupsField = next.groupsField ?? prev.groupsField;
  const separator = next.groupSeparator ?? prev.groupSeparator;
  return {
    houseSamples: extractCsvColumnSamples(csvText, houseField),
    apartmentSamples: extractCsvColumnSamples(csvText, apartmentField),
    groupSamples: extractCsvColumnSamples(csvText, groupsField),
  };
};

const readCsvFile = async (file) => {
  const buffer = await file.arrayBuffer();
  const decode = (encoding) => new TextDecoder(encoding, { fatal: false }).decode(buffer);
  let text = decode("utf-8");
  let { headers } = parseCsvRows(text);
  let encoding = "utf-8";
  const hasReplacementChar = text.includes("\uFFFD");
  if (headers.length <= 1 || hasReplacementChar) {
    text = decode("iso-8859-1");
    headers = parseCsvRows(text).headers;
    encoding = "iso-8859-1";
  }
  const encodingWarning =
    headers.length <= 1 ? "Rubriker kunde inte identifieras. Testa att spara om filen som UTF-8." : "";
  return { text, encoding, encodingWarning };
};

if (routePath.startsWith("/admin/")) {
  const buildRegexEffect = (samples, regexSource) => {
    if (!regexSource) {
      return samples.map((original) => ({ original, value: "—" }));
    }
    let regex;
    try {
      regex = new RegExp(regexSource);
    } catch (error) {
      return samples.map((original) => ({ original, value: "Ogiltig regex" }));
    }
    return samples.map((original) => {
      const match = regex.exec(original);
      if (!match) {
        return { original, value: "Ingen träff" };
      }
      if (match.length > 1) {
        return { original, value: match.slice(1).join("-") };
      }
      return { original, value: match[0] };
    });
  };

  const houseSamples = [
    "1-LGH1001 /1001 Kor tag1",
    "1-LGH1012 /1108 iLoq Blå",
    "6-LGH1132/1204 iLoq Grön",
    "6-LGH1133 /1205 tag1",
    "6-LGH1133/1205 iLoq Röd",
  ];

  const apartmentSamples = [
    "1-LGH1001 /1001 Kor tag1",
    "1-LGH1012 /1108 iLoq Blå",
    "6-LGH1132/1204 iLoq Grön",
    "6-LGH1133 /1205 tag1",
    "6-LGH1133/1205 iLoq Röd",
  ];

  const adminStore = createStore({
    adminUser: { name: "", association: "" },
    bookingObjects: [],
    bookingGroups: [],
    users: [],
    accessGroups: [],
    importRules: null,
    importPreview: null,
    importHeaders: [],
    importCsvText: "",
    importLoading: false,
    isImporting: false,
    modalOpen: false,
    modalMode: "add",
    selectorOpenKey: null,
    bookingSelectorScrollTop: 0,
    groupModalOpen: false,
    groupNameDraft: "",
    importOpen: false,
    importStep: 1,
    importFileName: "",
    importRowCount: 0,
    groupsField: "-",
    groupSeparator: "|",
    apartmentRegexOpen: false,
    houseRegexOpen: false,
    csvGroups: [],
    adminSelectorOpen: false,
    adminSelectorScrollTop: 0,
    importFocus: "",
    importFocusStart: null,
    importFocusEnd: null,
    userPickerOpen: false,
    userQuery: "",
    userListError: "",
    adminAllQrPdfLoading: false,
    editUserOpen: false,
    editUserId: null,
    editUserForm: buildEmptyUserForm(),
    editUserValidationErrors: {},
    editUserLoginQrUrl: "",
    editUserLoginQrLoading: false,
    editUserLoginQrError: "",
    editUserLoginQrRotating: false,
    userSelectorOpen: false,
    userRfidModalOpen: false,
    userGroupModalOpen: false,
    addRfidDraft: "",
    confirmModal: buildConfirmModalState(),
    reportOpen: false,
    reportStep: 1,
    reportMonth: "",
    reportBookingObjectId: "",
    bookingScreens: [],
    orderScreensModalOpen: false,
    pairScreenModalOpen: false,
    editScreenModalOpen: false,
    pairScreenCode: "",
    pairScreenName: "",
    editScreenId: null,
    editScreenName: "",
    modalValidationError: "",
    modalValidationErrors: {},
    modalForm: {
      name: "",
      type: "Tidspass",
      slotDuration: "",
      fullDayStartTime: "12:00",
      fullDayEndTime: "12:00",
      slotStartTime: "08:00",
      slotEndTime: "20:00",
      windowMin: "",
      windowMax: "",
      maxBookings: DEFAULT_MAX_BOOKINGS,
      groupId: "",
      priceWeekday: "",
      priceWeekend: "",
      status: "Aktiv",
      allowHouses: [],
      allowGroups: [],
      allowApartments: [],
      denyHouses: [],
      denyGroups: [],
      denyApartments: [],
    },
    editId: null,
  });

  const openModal = (mode, item) => {
    adminBookingObjectModalScrollTop = 0;
    adminStore.setState({
      modalOpen: true,
      modalMode: mode,
      editId: item?.id || null,
      selectorOpenKey: null,
      bookingSelectorScrollTop: 0,
      modalValidationError: "",
      modalValidationErrors: {},
      modalForm: item
        ? {
            name: item.name,
            type: item.type,
            slotDuration: item.slotDuration,
            fullDayStartTime: item.fullDayStartTime || "12:00",
            fullDayEndTime: item.fullDayEndTime || "12:00",
            slotStartTime: item.slotStartTime || "08:00",
            slotEndTime: item.slotEndTime || "20:00",
            windowMin: item.windowMin,
            windowMax: item.windowMax,
            maxBookings: item.maxBookings,
            groupId: item.groupId || "",
            priceWeekday: item.priceWeekday,
            priceWeekend: item.priceWeekend,
            status: item.status,
            allowHouses: item.allowHouses || [],
            allowGroups: item.allowGroups || [],
            allowApartments: item.allowApartments || [],
            denyHouses: item.denyHouses || [],
            denyGroups: item.denyGroups || [],
            denyApartments: item.denyApartments || [],
          }
        : {
            name: "",
            type: "Tidspass",
            slotDuration: "",
            fullDayStartTime: "12:00",
            fullDayEndTime: "12:00",
            slotStartTime: "08:00",
            slotEndTime: "20:00",
            windowMin: "",
            windowMax: "",
            maxBookings: DEFAULT_MAX_BOOKINGS,
            groupId: "",
            priceWeekday: "",
            priceWeekend: "",
            status: "Aktiv",
            allowHouses: [],
            allowGroups: [],
            allowApartments: [],
            denyHouses: [],
            denyGroups: [],
            denyApartments: [],
          },
    });
  };

  let adminInitialized = false;
  const buildImportRules = (state) => ({
    identity_field: state.identityField || state.importRules?.identity_field || "OrgGrupp",
    groups_field:
      state.groupsField === "-"
        ? ""
        : state.groupsField || state.importRules?.groups_field || "Behörighetsgrupp",
    rfid_field: state.rfidField || state.importRules?.rfid_field || "Identitetsid",
    active_field:
      state.activeField === "-"
        ? ""
        : state.activeField || state.importRules?.active_field || "Identitetsstatus (0=på 1=av)",
    house_field:
      state.houseField === "-"
        ? ""
        : state.houseField || state.importRules?.house_field || "Placering",
    apartment_field: state.apartmentField || state.importRules?.apartment_field || "Lägenhet",
    house_regex: state.houseRegex || state.importRules?.house_regex || "",
    apartment_regex: state.apartmentRegex || state.importRules?.apartment_regex || "",
    group_separator: state.groupSeparator || state.importRules?.group_separator || "|",
    admin_groups: (state.adminGroups?.length ? state.adminGroups : state.importRules?.admin_groups?.split("|") || []).join("|"),
  });

  const loadAdminEditUserLoginQr = async (userId) => {
    adminStore.setState({ editUserLoginQrLoading: true, editUserLoginQrError: "", editUserLoginQrUrl: "" });
    try {
      const data = await getAdminUserLoginQr(userId, typeof window !== "undefined" ? window.location.origin : "");
      adminStore.setState({
        editUserLoginQrUrl: data.login_url || "",
        editUserLoginQrLoading: false,
      });
    } catch {
      adminStore.setState({
        editUserLoginQrLoading: false,
        editUserLoginQrError: "Kunde inte hämta bokningslänken.",
      });
    }
  };

  const openAdminUserModal = (user = null) => {
    adminStore.setState({
      userPickerOpen: false,
      userQuery: "",
      userListError: "",
      editUserOpen: true,
      editUserId: user?.id || null,
      editUserForm: user ? buildUserFormFromUser(user) : buildEmptyUserForm(),
      editUserValidationErrors: {},
      editUserLoginQrUrl: "",
      editUserLoginQrError: "",
      editUserLoginQrLoading: Boolean(user?.id),
      editUserLoginQrRotating: false,
      userSelectorOpen: false,
      userRfidModalOpen: false,
      userGroupModalOpen: false,
      addRfidDraft: "",
      groupNameDraft: "",
    });
    if (user?.id) {
      void loadAdminEditUserLoginQr(user.id);
    }
  };

  const openAdminConfirmModal = ({ title, message, confirmLabel = "Bekräfta", onConfirm }) => {
    adminStore.setState({
      confirmModal: buildConfirmModalState({
        open: true,
        title,
        message,
        confirmLabel,
        onConfirm,
      }),
    });
  };

  const closeAdminConfirmModal = () => {
    adminStore.setState({ confirmModal: buildConfirmModalState() });
  };

  const deleteAdminUserEntry = async (user) => {
    try {
      await deleteUser(user.id, false);
      await loadAdminData();
      adminStore.setState({ userListError: "" });
    } catch (error) {
      if (error?.detail === "user_has_bookings") {
        openAdminConfirmModal({
          title: "Ta bort användare med bokningar",
          message: "Användaren har bokningar. Vill du ta bort användaren och alla bokningar?",
          confirmLabel: "Ta bort allt",
          onConfirm: async () => {
            await deleteUser(user.id, true);
            await loadAdminData();
            adminStore.setState({ userListError: "" });
          },
        });
        return;
      }
      adminStore.setState({ userListError: "Kunde inte ta bort användaren." });
    }
  };



  const loadAdminData = async () => {
    try {
      const [bookingObjectsData, bookingGroupsData, usersData, rulesData, accessGroupsData, bookingScreensData] = await Promise.all([
        getBookingObjects(),
        getBookingGroups(),
        getUsers(),
        getImportRules(),
        getAccessGroups(),
        getBookingScreens(),
      ]);
      const rules = rulesData?.rules || null;
      adminStore.setState({
        bookingObjects: bookingObjectsData,
        bookingGroups: bookingGroupsData,
        users: usersData,
        accessGroups: accessGroupsData.map((group) => group.name),
        importRules: rules,
        identityField: rules?.identity_field,
        groupsField: rules?.groups_field || "-",
        rfidField: rules?.rfid_field,
        activeField: rules?.active_field || "-",
        houseField: rules?.house_field,
        apartmentField: rules?.apartment_field,
        houseRegex: rules?.house_regex,
        apartmentRegex: rules?.apartment_regex,
        groupSeparator: rules?.group_separator,
        adminGroups: rules?.admin_groups ? rules.admin_groups.split("|").filter(Boolean) : [],
        bookingScreens: bookingScreensData,
      });
    } catch (error) {
      if (error.status === 403) {
        alert("Behörighet saknas.");
      }
    }
  };

  const initAdmin = async () => {
    if (adminInitialized) {
      return;
    }
    adminInitialized = true;
    const token = routePath.split("/")[2];
    if (token) {
      setAccessToken(token);
    }
    try {
      const session = await getSession();
      adminStore.setState({
        adminUser: {
          name: session.user.apartment_id,
          association: session.tenant.name,
        },
      });
      await loadAdminData();
    } catch (error) {
      if (error.status === 401) {
        if (error.detail === "setup_incomplete") {
          alert("Setup är inte klar ännu. Följ länken i mailet för att slutföra.");
        } else {
          alert("Sessionen är ogiltig eller har gått ut.");
        }
      }
    }
  };

  const renderAdmin = () => {
    const state = adminStore.getState();
    const docScrollX = window.scrollX;
    const docScrollY = window.scrollY;
    const activeElement =
      state.modalOpen ||
      state.editUserOpen ||
      state.userRfidModalOpen ||
      state.userGroupModalOpen ||
      state.pairScreenModalOpen ||
      state.editScreenModalOpen
        ? document.activeElement
        : null;
    const modalFocusSnapshot =
      activeElement && activeElement.getAttribute?.("data-focus-key")
        ? {
            key: activeElement.getAttribute("data-focus-key"),
            start:
              typeof activeElement.selectionStart === "number"
                ? activeElement.selectionStart
                : null,
            end:
              typeof activeElement.selectionEnd === "number"
                ? activeElement.selectionEnd
                : null,
          }
        : null;
    const existingEditUserScrollEl =
      state.editUserOpen ? document.querySelector(".edit-user-modal-scroll") : null;
    const savedEditUserModalScrollTop = existingEditUserScrollEl ? existingEditUserScrollEl.scrollTop : 0;
    clearElement(app);
    const shell = createElement("div", { className: "app-shell" });
    initAdmin();

    const modal = BookingObjectModal({
      open: state.modalOpen,
      mode: state.modalMode,
      form: state.modalForm,
      validationErrors: state.modalValidationErrors || {},
      validationError: state.modalValidationError || "",
      groupValidationError: state.modalValidationError || "",
      bookingGroups: state.bookingGroups,
      permissionOptions: buildPermissionOptions({
        users: state.users,
        accessGroups: state.accessGroups,
      }),
      onChange: (field, value) =>
        adminStore.setState((prev) => ({
          modalValidationError: BOOKING_MODAL_VALIDATION_RESET_FIELDS.has(field) ? "" : prev.modalValidationError,
          modalValidationErrors: BOOKING_MODAL_VALIDATION_RESET_FIELDS.has(field) ? {} : prev.modalValidationErrors,
          modalForm: { ...prev.modalForm, [field]: value },
        })),
      onSelectGroup: (groupId) =>
        adminStore.setState((prev) => {
          if (!groupId) {
            return { modalForm: { ...prev.modalForm, groupId: "" } };
          }
          const group = prev.bookingGroups.find((item) => item.id === groupId);
          return {
            modalForm: {
              ...prev.modalForm,
              groupId,
              maxBookings: group?.maxBookings || prev.modalForm.maxBookings || DEFAULT_MAX_BOOKINGS,
            },
          };
        }),
      onUpdateGroupMax: (value) =>
        adminStore.setState((prev) => {
          const groupId = prev.modalForm.groupId;
          if (!groupId) {
            return {};
          }
          return {
            bookingGroups: prev.bookingGroups.map((group) =>
              group.id === groupId ? { ...group, maxBookings: value } : group
            ),
          };
        }),
      groupModalOpen: state.groupModalOpen,
      groupNameDraft: state.groupNameDraft,
      onGroupNameChange: (value) => adminStore.setState({ groupNameDraft: value }),
      onOpenGroupModal: () => adminStore.setState({ groupModalOpen: true, groupNameDraft: "" }),
      onCloseGroupModal: () => adminStore.setState({ groupModalOpen: false }),
      onCreateGroup: async () => {
        const name = adminStore.getState().groupNameDraft?.trim();
        if (!name) {
          adminStore.setState({ groupModalOpen: false });
          return;
        }
        const maxBookings = parseRequiredPositiveInt(adminStore.getState().modalForm.maxBookings);
        if (maxBookings === null) {
          adminStore.setState({
            modalValidationError: "",
            modalValidationErrors: { maxBookings: "Max bokningar måste vara ett heltal större än 0." },
          });
          return;
        }
        await createBookingGroup({ name, max_bookings: maxBookings });
        await loadAdminData();
        adminStore.setState({ groupModalOpen: false, groupNameDraft: "", modalValidationError: "" });
      },
      onClose: () => {
        adminBookingObjectModalScrollTop = 0;
        adminStore.setState({
          modalOpen: false,
          modalValidationError: "",
          modalValidationErrors: {},
        });
      },
      selectorOpenKey: state.selectorOpenKey,
      selectorScrollTop: state.bookingSelectorScrollTop || 0,
      onSelectorScroll: (value) => adminStore.setState({ bookingSelectorScrollTop: value }),
      onBookingModalOverlayScroll: (value) => {
        adminBookingObjectModalScrollTop = value;
      },
      onOpenSelector: (key) => {
        const scrollEl = document.querySelector(".booking-object-modal-scroll");
        adminBookingObjectModalScrollTop = scrollEl ? scrollEl.scrollTop : adminBookingObjectModalScrollTop;
        adminStore.setState({
          selectorOpenKey: key,
          bookingSelectorScrollTop: 0,
        });
      },
      onCloseSelector: () => adminStore.setState({ selectorOpenKey: null, bookingSelectorScrollTop: 0 }),
      onSave: async () => {
        const form = adminStore.getState().modalForm;
        const normalizedMaxBookings = normalizeRequiredMaxBookings(form.maxBookings);
        if (!normalizedMaxBookings) {
          adminStore.setState({
            modalValidationError: "",
            modalValidationErrors: { maxBookings: "Max bokningar måste vara ett heltal större än 0." },
          });
          return;
        }
        const formErrors = validateBookingObjectForm({ ...form, maxBookings: normalizedMaxBookings });
        if (Object.keys(formErrors).length > 0) {
          adminStore.setState({ modalValidationErrors: formErrors, modalValidationError: "" });
          return;
        }
        adminStore.setState({ modalValidationError: "", modalValidationErrors: {} });
        const payload = { ...form, maxBookings: normalizedMaxBookings };
        try {
          if (adminStore.getState().modalMode === "edit") {
            await updateBookingObject(adminStore.getState().editId, payload);
          } else {
            await createBookingObject(payload);
          }
          await loadAdminData();
          adminBookingObjectModalScrollTop = 0;
          adminStore.setState({
            modalOpen: false,
            modalValidationError: "",
            modalValidationErrors: {},
            selectorOpenKey: null,
            bookingSelectorScrollTop: 0,
          });
        } catch (error) {
          const detail = String(error?.detail || "");
          if (detail === "invalid_booking_object_name") {
            adminStore.setState({ modalValidationErrors: { name: "Ange ett namn för bokningsobjektet." }, modalValidationError: "" });
          } else if (detail === "invalid_booking_window") {
            adminStore.setState({
              modalValidationErrors: {
                windowMax: "Minsta tid innan bokning får inte vara större än maximal framförhållning.",
              },
              modalValidationError: "",
            });
          } else if (detail === "invalid_time_slot_window") {
            adminStore.setState({
              modalValidationErrors: { slotEndTime: "Senaste tid måste vara efter tidigaste tid för tidspass." },
              modalValidationError: "",
            });
          } else if (detail === "invalid_time_slot_duration") {
            adminStore.setState({
              modalValidationErrors: { slotDuration: "Bokningslängden får inte vara längre än tidsfönstret." },
              modalValidationError: "",
            });
          } else {
            adminStore.setState({ modalValidationError: "Kunde inte spara bokningsobjektet.", modalValidationErrors: {} });
          }
        }
      },
    });

    const importModal = ImportUsersModal({
      open: state.importOpen,
      step: state.importStep,
      form: {
        fileName: state.importFileName,
        rowCount: state.importRowCount || 17,
        encoding: state.importEncoding,
        encodingWarning: state.importEncodingWarning,
        apartmentRegexOpen: state.apartmentRegexOpen,
        houseRegexOpen: state.houseRegexOpen,
        houseRegex: state.houseRegex || "",
        apartmentRegex: state.apartmentRegex || "",
        groupSeparator: state.groupSeparator || "|",
        addNew: state.addNew !== false,
        updateChanged: state.updateChanged !== false,
        removeMissing: state.removeMissing === true,
        progress: state.importProgress || 0,
        isImporting: state.isImporting === true,
        houseField: state.houseField || "Placering",
        apartmentField: state.apartmentField || "Lägenhet",
        groupsField: state.groupsField || "Behörighetsgrupp",
        adminGroups: state.adminGroups || [],
        adminSelectorOpen: state.adminSelectorOpen || false,
        adminGroupOptions: Array.from(
          new Set([...(state.accessGroups || []), ...(state.csvGroups || [])].filter(Boolean))
        ),
        effectHouse: buildRegexEffect(state.houseSamples || [], state.houseRegex || ""),
        effectApartment: buildRegexEffect(state.apartmentSamples || [], state.apartmentRegex || ""),
        effectGroups: buildGroupEffect(state.groupSamples || [], state.groupSeparator || "|"),
      },
      mapping: {
        headers: state.importHeaders?.length ? state.importHeaders : ["OrgGrupp", "Placering", "Lägenhet"],
        identityField: state.identityField || state.importRules?.identity_field || "OrgGrupp",
        groupsField: state.groupsField || state.importRules?.groups_field || "Behörighetsgrupp",
        rfidField: state.rfidField || state.importRules?.rfid_field || "Identitetsid",
        activeField: state.activeField || state.importRules?.active_field || "Identitetsstatus (0=på 1=av)",
      },
      preview: state.importPreview || {
        newCount: 0,
        updatedCount: 0,
        unchangedCount: 0,
        ignoredCount: 0,
        removedCount: 0,
        rows: [],
      },
      onClose: () => adminStore.setState({ importOpen: false, importStep: 1 }),
      onNext: async () => {
        const nextStep = Math.min(state.importStep + 1, 8);
        adminStore.setState({ importStep: nextStep });
        if (nextStep === 8 && state.importCsvText) {
          const rules = buildImportRules(adminStore.getState());
          const preview = await previewImport(state.importCsvText, rules);
          adminStore.setState({
            importPreview: {
              newCount: preview.summary.new,
              updatedCount: preview.summary.updated,
              unchangedCount: preview.summary.unchanged,
              ignoredCount: preview.summary.ignored || 0,
              removedCount: preview.summary.removed,
              rows: preview.rows.map((row) => ({
                identity: row.identity,
                apartmentId: row.apartment_id,
                house: row.house,
                status: row.status,
                statusClass:
                  row.status === "Ny"
                    ? "preview-new"
                    : row.status === "Uppdateras"
                      ? "preview-updated"
                      : row.status === "Ignorerad"
                        ? "preview-ignored"
                      : row.status === "Tas bort"
                        ? "preview-removed"
                        : "preview-unchanged",
                admin: row.admin,
                rfidStatus: row.rfid_status || "Oförändrad",
              })),
            },
            importHeaders: preview.headers,
          });
        }
      },
      onPrev: () =>
        adminStore.setState((prev) => ({ importStep: Math.max(prev.importStep - 1, 1) })),
      onImport: async () => {
        adminStore.setState({ importStep: 8, importProgress: 0, isImporting: true });
        const rules = buildImportRules(adminStore.getState());
        try {
          await saveImportRules(rules);
        } catch (error) {
          // Non-blocking: import should still run even if persisting rules fails.
          console.warn("Kunde inte spara importregler, fortsätter med import.", error);
        }
        const actions = {
          add_new: state.addNew !== false,
          update_existing: state.updateChanged !== false,
          remove_missing: state.removeMissing === true,
        };
        let offset = 0;
        const limit = 100;
        while (true) {
          const result = await applyImport(state.importCsvText, rules, actions, { offset, limit });
          const processed = result?.progress?.processed || 0;
          const total = result?.progress?.total || 0;
          const done = Boolean(result?.progress?.done);
          const percent = total > 0 ? Math.min(99, Math.round((processed / total) * 100)) : 99;
          adminStore.setState({ importProgress: percent });
          if (done) {
            break;
          }
          offset = processed;
        }
        adminStore.setState({ importProgress: 100, isImporting: false, importOpen: false, importStep: 1 });
        void loadAdminData();
      },
      onChange: (field, value) =>
        adminStore.setState((prev) => {
          switch (field) {
            case "fileName":
              return { importFileName: value };
            case "file":
              if (value) {
                readCsvFile(value).then(({ text, encoding, encodingWarning }) => {
                  const csvGroups = extractCsvGroups(text, prev.groupsField, prev.groupSeparator);
                  const sampleUpdate = updateImportSamples(prev, { importCsvText: text });
                  adminStore.setState({
                    importCsvText: text,
                    importRowCount: text.split("\n").length,
                    csvGroups,
                    ...sampleUpdate,
                    importEncoding: encoding,
                    importEncodingWarning: encodingWarning,
                  });
                  const rules = buildImportRules(adminStore.getState());
                  previewImport(text, rules).then((preview) =>
                    adminStore.setState({
                      importHeaders: preview.headers,
                      importPreview: {
                        newCount: preview.summary.new,
                        updatedCount: preview.summary.updated,
                        unchangedCount: preview.summary.unchanged,
                        ignoredCount: preview.summary.ignored || 0,
                        removedCount: preview.summary.removed,
                        rows: preview.rows.map((row) => ({
                          identity: row.identity,
                          apartmentId: row.apartment_id,
                          house: row.house,
                          status: row.status,
                          statusClass:
                            row.status === "Ny"
                              ? "preview-new"
                              : row.status === "Uppdateras"
                                ? "preview-updated"
                                : row.status === "Ignorerad"
                                  ? "preview-ignored"
                                : row.status === "Tas bort"
                                  ? "preview-removed"
                                  : "preview-unchanged",
                          admin: row.admin,
                          rfidStatus: row.rfid_status || "Oförändrad",
                        })),
                      },
                    })
                  );
                });
              }
              return {};
            case "groupsField": {
              const csvGroups = extractCsvGroups(prev.importCsvText, value, prev.groupSeparator);
              return { groupsField: value, csvGroups, ...updateImportSamples(prev, { groupsField: value }) };
            }
            case "groupSeparator": {
              const csvGroups = extractCsvGroups(prev.importCsvText, prev.groupsField, value);
              return { groupSeparator: value, csvGroups, ...updateImportSamples(prev, { groupSeparator: value }) };
            }
            case "houseField":
              return { houseField: value, ...updateImportSamples(prev, { houseField: value }) };
            case "apartmentField":
              return { apartmentField: value, ...updateImportSamples(prev, { apartmentField: value }) };
            case "importFocus":
            case "importFocusStart":
            case "importFocusEnd":
            case "apartmentRegexOpen":
            case "houseRegexOpen":
            case "identityField":
            case "rfidField":
            case "activeField":
            case "houseRegex":
            case "apartmentRegex":
            case "addNew":
            case "updateChanged":
            case "removeMissing":
            case "adminGroups":
            case "adminSelectorOpen":
            case "adminSelectorScrollTop":
              return { [field]: value };
            default:
              return prev;
          }
        }),
    });

    const editUserModal = EditUserModal({
      open: state.editUserOpen,
      mode: state.editUserId ? "edit" : "create",
      form: state.editUserForm,
      validationErrors: state.editUserValidationErrors || {},
      groupOptions: state.accessGroups || [],
      selectorOpen: state.userSelectorOpen,
      addRfidOpen: state.userRfidModalOpen,
      onOpenAddRfid: () => adminStore.setState({ userRfidModalOpen: true }),
      onCloseAddRfid: () => adminStore.setState({ userRfidModalOpen: false, addRfidDraft: "" }),
      rfidDraft: state.addRfidDraft || "",
      onRfidDraftChange: (value) => adminStore.setState({ addRfidDraft: value }),
      onSubmitAddRfid: () =>
        adminStore.setState((prev) => {
          const nextTag = String(prev.addRfidDraft || "").trim();
          if (!nextTag) {
            return { userRfidModalOpen: false, addRfidDraft: "" };
          }
          if ((prev.editUserForm.rfidTags || []).includes(nextTag)) {
            return { userRfidModalOpen: false, addRfidDraft: "" };
          }
          return {
            editUserForm: { ...prev.editUserForm, rfidTags: [...(prev.editUserForm.rfidTags || []), nextTag] },
            userRfidModalOpen: false,
            addRfidDraft: "",
          };
        }),
      onOpenSelector: () => adminStore.setState({ userSelectorOpen: true }),
      onCloseSelector: () => adminStore.setState({ userSelectorOpen: false }),
      onChange: (field, value) =>
        adminStore.setState((prev) => ({
          editUserForm: { ...prev.editUserForm, [field]: value },
          editUserValidationErrors: clearUserValidationErrorsForField(prev.editUserValidationErrors, field),
        })),
      onClose: () =>
        adminStore.setState({
          editUserOpen: false,
          userSelectorOpen: false,
          userRfidModalOpen: false,
          userGroupModalOpen: false,
          addRfidDraft: "",
          groupNameDraft: "",
          editUserValidationErrors: {},
          editUserLoginQrUrl: "",
          editUserLoginQrError: "",
          editUserLoginQrLoading: false,
          editUserLoginQrRotating: false,
        }),
      groupNameDraft: state.groupNameDraft,
      groupModalOpen: state.userGroupModalOpen,
      onOpenGroupModal: () => adminStore.setState({ userGroupModalOpen: true, groupNameDraft: "" }),
      onCloseGroupModal: () => adminStore.setState({ userGroupModalOpen: false, groupNameDraft: "" }),
      onGroupNameChange: (value) => adminStore.setState({ groupNameDraft: value }),
      onCreateGroup: async () => {
        const newGroupName = state.groupNameDraft?.trim();
        if (!newGroupName) return;
        await createAccessGroup(newGroupName);
        adminStore.setState((prev) => ({
          groupNameDraft: "",
          userGroupModalOpen: false,
          editUserForm: {
            ...prev.editUserForm,
            groups: toSortedUniqueStrings([...(prev.editUserForm.groups || []), newGroupName]),
          },
        }));
        await loadAdminData();
      },
      onSave: async () => {
        const preflightErrors = validateUserForm(state.editUserForm);
        if (Object.keys(preflightErrors).length) {
          adminStore.setState({ editUserValidationErrors: preflightErrors });
          return;
        }
        try {
          if (state.editUserId) {
            await updateUser(state.editUserId, state.editUserForm);
          } else {
            await createUser(state.editUserForm);
          }
          await loadAdminData();
          adminStore.setState({
            editUserOpen: false,
            userSelectorOpen: false,
            userRfidModalOpen: false,
            userGroupModalOpen: false,
            addRfidDraft: "",
            groupNameDraft: "",
            editUserValidationErrors: {},
            editUserLoginQrUrl: "",
            editUserLoginQrError: "",
            editUserLoginQrLoading: false,
            editUserLoginQrRotating: false,
          });
        } catch (error) {
          adminStore.setState({ editUserValidationErrors: getUserSaveValidationErrors(error) });
        }
      },
      onConfirmRemoveRfidTag: (value) =>
        openAdminConfirmModal({
          title: "Ta bort RFID-tag",
          message: `Ta bort taggen "${value}"?`,
          confirmLabel: "Ta bort",
          onConfirm: async () => {
            const current = adminStore.getState();
            const next = (current.editUserForm.rfidTags || []).filter((item) => item !== value);
            adminStore.setState({
              editUserForm: { ...current.editUserForm, rfidTags: next },
            });
          },
        }),
      onConfirmRemoveGroup: (value) =>
        openAdminConfirmModal({
          title: "Ta bort behörighetsgrupp",
          message: `Ta bort gruppen "${value}"?`,
          confirmLabel: "Ta bort",
          onConfirm: async () => {
            const current = adminStore.getState();
            const next = (current.editUserForm.groups || []).filter((item) => item !== value);
            adminStore.setState({
              editUserForm: { ...current.editUserForm, groups: next },
            });
          },
        }),
      adminLoginQr: true,
      loginQrUrl: state.editUserLoginQrUrl || "",
      loginQrLoading: Boolean(state.editUserLoginQrLoading),
      loginQrError: state.editUserLoginQrError || "",
      loginQrRotating: Boolean(state.editUserLoginQrRotating),
      loginQrImageSrc: state.editUserLoginQrUrl ? buildQrImageUrl(state.editUserLoginQrUrl, 200) : "",
      onRotateLoginQr: () =>
        openAdminConfirmModal({
          title: "Ny bokningslänk?",
          message:
            "Den gamla QR-koden och bokmärken som pekar på den gamla länken slutar fungera. Dela den nya länken eller utskriften till boendet.",
          confirmLabel: "Generera ny",
          onConfirm: async () => {
            const current = adminStore.getState();
            const id = current.editUserId;
            if (!id) return;
            adminStore.setState({ editUserLoginQrRotating: true, editUserLoginQrError: "" });
            try {
              const data = await rotateAdminUserLoginQr(id, window.location.origin);
              adminStore.setState({
                editUserLoginQrUrl: data.login_url || "",
                editUserLoginQrRotating: false,
              });
            } catch {
              adminStore.setState({
                editUserLoginQrRotating: false,
                editUserLoginQrError: "Kunde inte byta länk.",
              });
            }
          },
        }),
      onDownloadLoginQrPdf: async () => {
        const current = adminStore.getState();
        const url = current.editUserLoginQrUrl;
        if (!url) return;
        try {
          const result = await downloadApartmentLoginQrPdf({
            tenantName: current.adminUser?.association || "",
            filenameStem: current.editUserForm.apartmentId,
            rows: [
              {
                apartment_id: current.editUserForm.apartmentId || "",
                house: current.editUserForm.house || "",
                login_url: url,
              },
            ],
          });
          if (!result?.ok) {
            window.alert("Kunde inte skapa PDF.");
          }
        } catch {
          window.alert("Kunde inte skapa PDF.");
        }
      },
    });

    const reportModal = ReportModal({
      open: state.reportOpen,
      step: state.reportStep,
      form: {
        month: state.reportMonth,
        bookingObjectId: state.reportBookingObjectId,
      },
      bookingObjects: state.bookingObjects,
      onClose: () =>
        adminStore.setState({ reportOpen: false, reportStep: 1, reportMonth: "", reportBookingObjectId: "" }),
      onNext: () =>
        adminStore.setState((prev) => ({ reportStep: Math.min(prev.reportStep + 1, 3) })),
      onPrev: () =>
        adminStore.setState((prev) => ({ reportStep: Math.max(prev.reportStep - 1, 1) })),
      onDownload: async () => {
        const csv = await downloadReportCsv(state.reportMonth, state.reportBookingObjectId);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `debiteringsunderlag-${state.reportMonth || "rapport"}.csv`;
        link.click();
        URL.revokeObjectURL(url);
      },
      onChange: (field, value) =>
        adminStore.setState((prev) => {
          switch (field) {
            case "month":
              return { reportMonth: value };
            case "bookingObjectId":
              return { reportBookingObjectId: value };
            default:
              return prev;
          }
        }),
    });

    const confirmModal = renderConfirmModal({
      state: state.confirmModal,
      onCancel: closeAdminConfirmModal,
      onConfirm: async () => {
        const callback = adminStore.getState().confirmModal?.onConfirm;
        closeAdminConfirmModal();
        if (callback) {
          await callback();
        }
      },
    });

    shell.append(
      Header({
        apartmentId: state.adminUser?.association || "—",
        tenantName: state.adminUser?.association,
        onHelp: openHelp,
        onLogout: logout,
      }),
      AdminDashboard({
        adminUser: state.adminUser,
        users: state.users,
        userQuery: state.userQuery,
        userListError: state.userListError,
        bookingObjects: state.bookingObjects,
        bookingScreens: state.bookingScreens,
        onAdd: () => openModal("add"),
        onCopy: (item) => openModal("copy", item),
        onEdit: (item) => openModal("edit", item),
        onAddUser: () => openAdminUserModal(null),
        onImportUsers: () => adminStore.setState({ importOpen: true, importStep: 1 }),
        allQrPdfLoading: state.adminAllQrPdfLoading,
        onDownloadAllQrPdf: async () => {
          adminStore.setState({ adminAllQrPdfLoading: true, userListError: "" });
          try {
            const data = await getUserLoginQrExportData(window.location.origin);
            const rows = data.rows || [];
            if (!rows.length) {
              window.alert("Inga aktiva lägenheter att exportera.");
              return;
            }
            const latest = adminStore.getState();
            const result = await downloadApartmentLoginQrPdf({
              tenantName: data.tenant_name || latest.adminUser?.association || "",
              rows,
            });
            if (!result?.ok) {
              window.alert("Kunde inte skapa PDF.");
            }
          } catch {
            adminStore.setState({ userListError: "Kunde inte hämta data för PDF-export." });
          } finally {
            adminStore.setState({ adminAllQrPdfLoading: false });
          }
        },
        onEditUser: (user) => openAdminUserModal(user),
        onDeleteUser: (user) => deleteAdminUserEntry(user),
        onUserQueryChange: (value) => adminStore.setState({ userQuery: value }),
        onCreateReport: () => adminStore.setState({ reportOpen: true, reportStep: 1 }),
        onOpenOrderScreens: () => adminStore.setState({ orderScreensModalOpen: true }),
        onOpenPairScreen: () =>
          adminStore.setState({ pairScreenModalOpen: true, pairScreenCode: "", pairScreenName: "" }),
        onCloseOrderScreens: () => adminStore.setState({ orderScreensModalOpen: false }),
        onConfirmOrderScreens: async () => {
          try {
            await orderBookingScreens({ quantity: 1 });
            adminStore.setState({ orderScreensModalOpen: false });
            alert(
              "Beställningsförfrågan skickad till info@embsign.se. En säljare kommer kontakta er."
            );
          } catch (error) {
            alert("Kunde inte skicka beställningsförfrågan just nu.");
          }
        },
        onClosePairScreen: () =>
          adminStore.setState({ pairScreenModalOpen: false, pairScreenCode: "", pairScreenName: "" }),
        onConfirmPairScreen: async () => {
          const current = adminStore.getState();
          const pairingCode = String(current.pairScreenCode || "").trim().toUpperCase();
          const name = String(current.pairScreenName || "").trim();
          if (pairingCode.length !== 6) {
            alert("Ange sex tecken i kopplingskoden.");
            return;
          }
          if (!name) {
            alert("Ange ett namn för bokningsskärmen.");
            return;
          }
          try {
            await pairBookingScreen({ pairingCode, name });
            await loadAdminData();
            adminStore.setState({ pairScreenModalOpen: false, pairScreenCode: "", pairScreenName: "" });
          } catch (error) {
            alert("Koden kunde inte kopplas. Kontrollera att plattan är i kopplingsläge.");
          }
        },
        onPairCodeInput: (value) =>
          adminStore.setState({ pairScreenCode: String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) }),
        onPairNameInput: (value) => adminStore.setState({ pairScreenName: value }),
        onEditScreen: (screen) =>
          adminStore.setState({ editScreenModalOpen: true, editScreenId: screen.id, editScreenName: screen.name }),
        onDeleteScreen: async (screen) => {
          openAdminConfirmModal({
            title: "Ta bort bokningsskärm",
            message: `Ta bort bokningsskärmen "${screen.name}"?`,
            confirmLabel: "Ta bort",
            onConfirm: async () => {
              await deleteBookingScreen(screen.id);
              await loadAdminData();
            },
          });
        },
        onCloseEditScreen: () =>
          adminStore.setState({ editScreenModalOpen: false, editScreenId: null, editScreenName: "" }),
        onConfirmEditScreen: async () => {
          const current = adminStore.getState();
          const name = String(current.editScreenName || "").trim();
          if (!current.editScreenId || !name) {
            alert("Ange ett giltigt namn.");
            return;
          }
          await updateBookingScreen(current.editScreenId, { name });
          await loadAdminData();
          adminStore.setState({ editScreenModalOpen: false, editScreenId: null, editScreenName: "" });
        },
        onEditScreenNameInput: (value) => adminStore.setState({ editScreenName: value }),
        orderScreensModalOpen: state.orderScreensModalOpen,
        pairScreenModalOpen: state.pairScreenModalOpen,
        editScreenModalOpen: state.editScreenModalOpen,
        pairScreenCode: state.pairScreenCode,
        pairScreenName: state.pairScreenName,
        editScreenName: state.editScreenName,
        modal,
        importModal,
        editUserModal,
        reportModal,
        confirmModal,
      })
    );
    app.append(shell);

    if (state.modalOpen) {
      const bookingScroll = app.querySelector(".booking-object-modal-scroll");
      if (bookingScroll) {
        bookingScroll.scrollTop = adminBookingObjectModalScrollTop || 0;
      }
    }

    if (
      modalFocusSnapshot &&
      !state.groupModalOpen &&
      !state.orderScreensModalOpen &&
      !state.userSelectorOpen &&
      !state.importOpen
    ) {
      const target = app.querySelector(`[data-focus-key="${modalFocusSnapshot.key}"]`);
      if (target) {
        target.focus();
        if (
          typeof modalFocusSnapshot.start === "number" &&
          typeof modalFocusSnapshot.end === "number" &&
          typeof target.setSelectionRange === "function"
        ) {
          target.setSelectionRange(modalFocusSnapshot.start, modalFocusSnapshot.end);
        }
      }
    }

    if (state.groupModalOpen) {
      const input = app.querySelector('[data-autofocus="group-name"]');
      if (input) {
        input.focus();
        input.setSelectionRange?.(input.value.length, input.value.length);
      }
    }

    if (state.userRfidModalOpen) {
      const input = app.querySelector('[data-autofocus="edit-user-rfid"]');
      if (input) {
        input.focus();
        input.setSelectionRange?.(input.value.length, input.value.length);
      }
    }

    if (state.userGroupModalOpen) {
      const input = app.querySelector('[data-autofocus="edit-user-group"]');
      if (input) {
        input.focus();
        input.setSelectionRange?.(input.value.length, input.value.length);
      }
    }

    if (state.pairScreenModalOpen) {
      const input = app.querySelector('[data-autofocus="booking-screen-name"]');
      if (input) {
        input.focus();
        input.setSelectionRange?.(input.value.length, input.value.length);
      }
    }

    if (state.editScreenModalOpen) {
      const input = app.querySelector('[data-autofocus="booking-screen-edit-name"]');
      if (input) {
        input.focus();
        input.setSelectionRange?.(input.value.length, input.value.length);
      }
    }

    if (state.importOpen && state.importFocus) {
      const input = app.querySelector(`[data-autofocus="${state.importFocus}"]`);
      if (input) {
        input.focus();
        const start =
          typeof state.importFocusStart === "number" ? state.importFocusStart : input.value.length;
        const end = typeof state.importFocusEnd === "number" ? state.importFocusEnd : input.value.length;
        input.setSelectionRange?.(start, end);
      }
    }

    if (state.importOpen && state.adminSelectorOpen) {
      const list = app.querySelector(".import-modal .selector-list");
      if (list) {
        list.scrollTop = state.adminSelectorScrollTop || 0;
      }
    }

    if (state.modalOpen && state.selectorOpenKey) {
      const list = app.querySelector(".booking-object-modal + .modal-overlay .selector-list");
      if (list) {
        list.scrollTop = state.bookingSelectorScrollTop || 0;
      }
    }

    if (state.editUserOpen) {
      const editUserScroll = app.querySelector(".edit-user-modal-scroll");
      if (editUserScroll) {
        editUserScroll.scrollTop = savedEditUserModalScrollTop;
      }
    }

    window.scrollTo(docScrollX, docScrollY);
  };

  adminStore.subscribe(renderAdmin);
  renderAdmin();
} else if (routePath.startsWith("/user/")) {
const isKioskRoute = new URLSearchParams(window.location.search).get("kiosk") === "1";

const today = new Date();
const initialMonth = { year: today.getFullYear(), monthIndex: today.getMonth() };
const initialWeek = getWeekStart(today);

const store = createStore({
  step: 1,
  selectedService: null,
  selectedDate: null,
  selectedSlot: null,
  monthCursor: initialMonth,
  weekCursor: initialWeek,
  confirmed: false,
  services: [],
  bookings: [],
  sessionUser: null,
  sessionTenant: null,
  sessionError: null,
  sessionLoading: true,
  availabilityMonthKey: null,
  availabilityMonthRequestKey: null,
  availabilityMonth: [],
  availabilityWeekKey: null,
  availabilityWeekRequestKey: null,
  availabilityWeekLoadingPlaceholder: null,
  availabilityWeek: [],
  availabilityLoading: false,
  dataLoading: false,
  cancelModalOpen: false,
  cancelBooking: null,
  cancelledDayIds: [],
  cancelledSlotIds: [],
  qrWarningOpen: false,
  qrGenerating: false,
  qrError: "",
  qrUrl: "",
  qrImageUrl: "",
  qrRedirectPath: "",
  qrModalOpen: false,
  confirmationCalendarEvent: null,
  confirmationBookingId: null,
  adminBookableUsers: [],
  adminBookingAction: "self",
  adminBookingForUserId: "",
  uiStates: {
    service: "loading",
    date: "normal",
    time: "normal",
    confirmation: "normal",
  },
});

const getBookableDateRange = (service) => {
  const minDays = Number(service?.windowMin);
  const maxDays = Number(service?.windowMax);
  if (!Number.isFinite(minDays) || !Number.isFinite(maxDays)) {
    return null;
  }
  const min = Math.max(0, minDays);
  const max = Math.max(min, maxDays);
  const start = new Date();
  start.setDate(start.getDate() + min);
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setDate(end.getDate() + max);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const canMoveMonth = (year, monthIndex, service = null) => {
  const target = new Date(year, monthIndex, 1);
  const periodStart = new Date(target.getFullYear(), target.getMonth(), 1, 0, 0, 0, 0);
  const periodEnd = new Date(target.getFullYear(), target.getMonth() + 1, 0, 23, 59, 59, 999);
  const range = getBookableDateRange(service);
  if (!range) {
    return false;
  }
  const { start, end } = range;
  return periodEnd >= start && periodStart <= end;
};

const canMoveWeek = (weekDate, service = null) => {
  const periodStart = new Date(weekDate);
  periodStart.setHours(0, 0, 0, 0);
  const periodEnd = new Date(weekDate);
  periodEnd.setDate(periodEnd.getDate() + 6);
  periodEnd.setHours(23, 59, 59, 999);
  const range = getBookableDateRange(service);
  if (!range) {
    return false;
  }
  const { start, end } = range;
  return periodEnd >= start && periodStart <= end;
};

const getWeekLabel = (weekStart) => `Vecka ${getWeekNumber(weekStart)}`;

const getExpectedWeekSlots = (weekStart, slotDurationMinutes) => {
  const slotMinutes = Number(slotDurationMinutes) > 0 ? Number(slotDurationMinutes) : 60;
  const slotCount = Math.max(1, Math.floor((12 * 60) / slotMinutes));
  return Array.from({ length: 7 }).map((_, dayOffset) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + dayOffset);
    const dayName = date.toLocaleDateString("sv-SE", { weekday: "short" }).replace(".", "");
    const dayNameCapitalized = dayName.replace(/^./, (char) => char.toUpperCase());
    return {
      id: `expected-${date.toISOString().slice(0, 10)}`,
      label: `${dayNameCapitalized} ${date.getDate()}/${date.getMonth() + 1}`,
      slots: Array.from({ length: slotCount }),
    };
  });
};

const getExpectedMonthDays = (year, monthIndex) => {
  const firstDay = new Date(year, monthIndex, 1);
  const startDay = new Date(firstDay);
  const dayOfWeek = (firstDay.getDay() + 6) % 7;
  startDay.setDate(firstDay.getDate() - dayOfWeek);
  const days = [];
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(startDay);
    date.setDate(startDay.getDate() + i);
    days.push({
      id: `expected-month-${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
      date,
      label: `${date.getDate()}/${date.getMonth() + 1}`,
      status: date.getMonth() === monthIndex ? "available" : "outside",
      monthIndex: date.getMonth(),
    });
  }
  return days;
};

const formatDayLabel = (date) =>
  date
    .toLocaleDateString("sv-SE", { weekday: "short" })
    .replace(".", "")
    .replace(/^./, (char) => char.toUpperCase());

const formatDateLabel = (date) => `${date.getDate()}/${date.getMonth() + 1}`;
const formatNextAvailableLabel = (value, bookingType) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const toWeekdayShort = (date) => date.toLocaleDateString("sv-SE", { weekday: "short" }).replace(".", "").toLowerCase();
  const toDayMonth = (date) => `${date.getDate()}/${date.getMonth() + 1}`;
  if (bookingType === "time-slot") {
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(raw)) {
      const [datePart, timePart] = raw.split(" ");
      const [year, month, day] = datePart.split("-").map(Number);
      const date = new Date(year, month - 1, day);
      return `${toWeekdayShort(date)} ${toDayMonth(date)} kl ${timePart}`;
    }
    const parsed = new Date(raw.includes(" ") && !raw.includes("T") ? raw.replace(" ", "T") : raw);
    if (!Number.isNaN(parsed.getTime())) {
      const hh = String(parsed.getHours()).padStart(2, "0");
      const mm = String(parsed.getMinutes()).padStart(2, "0");
      return `${toWeekdayShort(parsed)} ${toDayMonth(parsed)} kl ${hh}:${mm}`;
    }
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString("sv-SE", { day: "numeric", month: "long" });
  }
  const parsed = new Date(raw.includes(" ") && !raw.includes("T") ? raw.replace(" ", "T") : raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString("sv-SE", { day: "numeric", month: "long" });
  }
  return raw;
};

const parseServiceNextAvailableDate = (service) => {
  const raw = String(service?.nextAvailableRaw || service?.nextAvailable || "").trim();
  if (!raw) {
    return null;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  const parsed = new Date(raw.includes(" ") && !raw.includes("T") ? raw.replace(" ", "T") : raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }
  return null;
};

const getInitialCursorForService = (service) => {
  const nextAvailableDate = parseServiceNextAvailableDate(service);
  if (!nextAvailableDate) {
    return { monthCursor: initialMonth, weekCursor: initialWeek };
  }
  return {
    monthCursor: {
      year: nextAvailableDate.getFullYear(),
      monthIndex: nextAvailableDate.getMonth(),
    },
    weekCursor: getWeekStart(nextAvailableDate),
  };
};

const normalizeClockTime = (value) => (/^\d{2}:\d{2}$/.test(value || "") ? value : "12:00");

const getFullDayTimeLabel = (service) =>
  `${normalizeClockTime(service?.fullDayStartTime)}-${normalizeClockTime(service?.fullDayEndTime)}`;

const buildFullDayDateRange = (date, service) => {
  const startTime = normalizeClockTime(service?.fullDayStartTime);
  const endTime = normalizeClockTime(service?.fullDayEndTime);
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  const start = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), startHour, startMinute, 0, 0));
  const end = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), endHour, endMinute, 0, 0));
  if (endHour < startHour || (endHour === startHour && endMinute <= startMinute)) {
    end.setUTCDate(end.getUTCDate() + 1);
  }
  return {
    startTime: start.toISOString(),
    endTime: end.toISOString(),
  };
};

const buildCancelBooking = ({ date, timeLabel, serviceName, sourceId, bookingId = null, cancelType = "booking" }) => ({
  id: sourceId,
  bookingId,
  cancelType,
  serviceName,
  dayLabel: formatDayLabel(date),
  dateLabel: formatDateLabel(date),
  timeLabel,
  status: "mine",
});

const buildBookingRangeForState = (state) => {
  if (state.selectedSlot?.startTime && state.selectedSlot?.endTime) {
    return {
      startTime: state.selectedSlot.startTime,
      endTime: state.selectedSlot.endTime,
      timeLabel: state.selectedSlot.label,
    };
  }
  if (state.selectedDate?.date) {
    const range = buildFullDayDateRange(state.selectedDate.date, state.selectedService);
    return {
      startTime: range.startTime,
      endTime: range.endTime,
      timeLabel: getFullDayTimeLabel(state.selectedService),
    };
  }
  return null;
};

const getSelectedServiceBookingLimit = (service) => {
  const explicitLimit = Number(service?.maxBookingsLimit);
  if (Number.isFinite(explicitLimit) && explicitLimit > 0) {
    return explicitLimit;
  }
  const fallbackLimit = Number(service?.maxBookings);
  if (Number.isFinite(fallbackLimit) && fallbackLimit > 0) {
    return fallbackLimit;
  }
  return null;
};

const isBookingCountLimited = (service) => getSelectedServiceBookingLimit(service) !== null;

const getActiveBookingsForSelectedService = (state) => {
  const selectedService = state.selectedService;
  if (!selectedService) {
    return [];
  }
  const scope = selectedService.maxBookingsScope;
  const groupId = selectedService.bookingGroupId || "";
  if (scope === "group" && groupId) {
    return (state.bookings || []).filter((booking) => booking.groupId === groupId);
  }
  return (state.bookings || []).filter((booking) => booking.bookingObjectId === selectedService.id);
};

const isSelectedServiceMaxReached = (state) => {
  if (!state.selectedService) {
    return false;
  }
  const bookingLimit = getSelectedServiceBookingLimit(state.selectedService);
  if (bookingLimit === null) {
    return false;
  }
  const activeBookings = getActiveBookingsForSelectedService(state);
  return activeBookings.length >= bookingLimit;
};

const buildConfirmationCalendarEvent = (state, range) => {
  if (!state.selectedService || !state.selectedDate?.date || !range?.startTime || !range?.endTime) {
    return null;
  }
  return {
    title: `Bokning: ${state.selectedService.name}`,
    startTime: range.startTime,
    endTime: range.endTime,
    description: `${formatDayLabel(state.selectedDate.date)} ${formatDateLabel(state.selectedDate.date)} ${range.timeLabel}`,
  };
};

const markMonthDayAsMine = (days, selectedDayId) =>
  (days || []).map((day) => (day.id === selectedDayId ? { ...day, status: "mine" } : day));

const markWeekSlotAsMine = (weekDays, selectedSlotId) =>
  (weekDays || []).map((day) => ({
    ...day,
    slots: day.slots.map((slot) => (slot.id === selectedSlotId ? { ...slot, status: "mine" } : slot)),
  }));

const bookingMatches = (booking, target) => {
  if (!target) {
    return false;
  }
  return (
    booking.serviceName === target.serviceName &&
    booking.dateLabel === target.dateLabel &&
    booking.timeLabel === target.timeLabel
  );
};

const findBookingId = (bookingsList, target) =>
  bookingsList.find((booking) => bookingMatches(booking, target))?.id;

const isBookingCurrentOrFuture = (booking) => {
  if (!booking?.startTime || !booking?.endTime) {
    return true;
  }
  return new Date(booking.endTime).getTime() > Date.now();
};

const getWeekNumber = (date) => {
  const temp = new Date(date.getTime());
  temp.setHours(0, 0, 0, 0);
  temp.setDate(temp.getDate() + 3 - ((temp.getDay() + 6) % 7));
  const week1 = new Date(temp.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(
      ((temp.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
    )
  );
};

const applyBootstrapData = (bootstrap) => {
  const servicesData = Array.isArray(bootstrap?.services)
    ? bootstrap.services.map((service) => ({
        id: service.id,
        name: service.name,
        description: service.description || "",
        duration: service.booking_type === "full-day"
          ? "1 dygn"
          : service.slot_duration_minutes
            ? (() => {
                const hours = service.slot_duration_minutes / 60;
                return hours % 1 === 0
                  ? `${hours} timmar`
                  : `${hours.toString().replace(".", ",")} timmar`;
              })()
            : "",
        nextAvailableRaw: service.next_available_start || service.next_available || "",
        nextAvailable: formatNextAvailableLabel(service.next_available, service.booking_type),
        priceText: (() => {
          const weekdayCents = Number(service.price_weekday_cents || 0);
          const weekendCents = Number(service.price_weekend_cents || 0);
          if (weekdayCents <= 0 && weekendCents <= 0) return "";
          const weekday = Math.round(weekdayCents / 100);
          const weekend = Math.round(weekendCents / 100);
          if (weekday === weekend) return `Debiteras: ${weekday} kr`;
          const low = Math.min(weekday, weekend);
          const high = Math.max(weekday, weekend);
          return `Debiteras: ${low}-${high} kr`;
        })(),
        bookingType: service.booking_type,
        slotDuration: service.slot_duration_minutes || "",
        fullDayStartTime: /^\d{2}:\d{2}$/.test(service.full_day_start_time || "") ? service.full_day_start_time : "12:00",
        fullDayEndTime: /^\d{2}:\d{2}$/.test(service.full_day_end_time || "") ? service.full_day_end_time : "12:00",
        timeSlotStartTime: /^\d{2}:\d{2}$/.test(service.time_slot_start_time || "") ? service.time_slot_start_time : "08:00",
        timeSlotEndTime: /^\d{2}:\d{2}$/.test(service.time_slot_end_time || "") ? service.time_slot_end_time : "20:00",
        windowMin: Number(service.window_min_days),
        windowMax: Number(service.window_max_days),
        maxBookings: Number(service.max_bookings_limit || service.max_bookings || 0),
        maxBookingsLimit: Number(service.max_bookings_limit || service.max_bookings || 0),
        maxBookingsScope: service.max_bookings_scope || null,
        bookingGroupId: service.group_id || "",
        priceWeekday: service.price_weekday_cents || 0,
        priceWeekend: service.price_weekend_cents || 0,
      }))
    : [];

  const bookingsData = Array.isArray(bootstrap?.bookings)
    ? bootstrap.bookings.map((booking) => {
        const date = new Date(booking.date);
        return {
          id: booking.id,
          bookingObjectId: booking.booking_object_id,
          groupId: booking.booking_group_id || "",
          startTime: booking.start_time || "",
          endTime: booking.end_time || "",
          serviceName: booking.service_name,
          dayLabel: date
            .toLocaleDateString("sv-SE", { weekday: "short" })
            .replace(".", "")
            .replace(/^./, (char) => char.toUpperCase()),
          dateLabel: `${date.getDate()}/${date.getMonth() + 1}`,
          timeLabel: booking.time_label,
          status: booking.status,
        };
      })
    : [];

  store.setState({
    sessionUser: bootstrap?.user || null,
    sessionTenant: bootstrap?.tenant || null,
    sessionLoading: false,
    services: servicesData,
    bookings: bookingsData.filter(isBookingCurrentOrFuture),
    dataLoading: false,
    uiStates: {
      ...store.getState().uiStates,
      service: servicesData.length ? "normal" : "empty",
    },
  });
};

let userInitialized = false;
const initUser = async () => {
  if (userInitialized) {
    return;
  }
  userInitialized = true;
  const token = routePath.split("/")[2];
  if (token) {
    setAccessToken(token);
  }
  store.setState((prev) => ({ dataLoading: true, uiStates: { ...prev.uiStates, service: "loading" } }));
  try {
    const bootstrap = await getBootstrap();
    applyBootstrapData(bootstrap);
    if (bootstrap?.user?.is_admin) {
      try {
        const users = await getBookableUsers();
        store.setState({ adminBookableUsers: users });
      } catch {
        store.setState({ adminBookableUsers: [] });
      }
    }
  } catch (error) {
    store.setState((prev) => ({
      sessionError: "unauthorized",
      sessionLoading: false,
      dataLoading: false,
      uiStates: { ...prev.uiStates, service: "error" },
    }));
  }
};

const refreshPersonalQrLink = async () => {
  store.setState({ qrGenerating: true, qrError: "" });
  try {
    const result = await rotatePersonalLoginLink();
    const loginPath = typeof result?.login_url === "string" ? result.login_url : "";
    const accessToken = typeof result?.access_token === "string" ? result.access_token : "";
    if (!loginPath || !accessToken) {
      throw new Error("invalid_login_link");
    }
    const loginUrl = `${window.location.origin}${loginPath}`;
    setAccessToken(accessToken);
    store.setState({
      qrGenerating: false,
      qrWarningOpen: false,
      qrModalOpen: true,
      qrUrl: loginUrl,
      qrImageUrl: buildQrImageUrl(loginUrl, 320),
      qrRedirectPath: loginPath,
    });
  } catch (error) {
    store.setState({
      qrGenerating: false,
      qrError:
        error?.detail === "unauthorized"
          ? "Kunde inte generera ny länk. Logga in igen."
          : "Kunde inte generera QR-kod. Försök igen.",
    });
  }
};

const loadMonthAvailability = async (service, year, monthIndex) => {
  const key = `${service.id}-${year}-${monthIndex}`;
  store.setState((prev) => ({
    availabilityLoading: true,
    availabilityMonthRequestKey: key,
    uiStates: { ...prev.uiStates, date: "loading" },
  }));
  try {
    const days = await getMonthAvailability(service.id, year, monthIndex);
    store.setState((prev) => {
      if (prev.availabilityMonthRequestKey !== key) {
        return {};
      }
      return {
        availabilityMonthKey: key,
        availabilityMonthRequestKey: null,
        availabilityMonth: days,
        availabilityLoading: false,
        uiStates: { ...prev.uiStates, date: days.length ? "normal" : "empty" },
      };
    });
  } catch (error) {
    store.setState((prev) => {
      if (prev.availabilityMonthRequestKey !== key) {
        return {};
      }
      return {
        availabilityLoading: false,
        availabilityMonthRequestKey: null,
        uiStates: { ...prev.uiStates, date: "error" },
      };
    });
  }
};

const loadWeekAvailability = async (service, weekStart) => {
  const key = weekAvailabilityStateKey(service.id, weekStart);
  store.setState((prev) => ({
    availabilityLoading: true,
    availabilityWeekRequestKey: key,
    availabilityWeekLoadingPlaceholder:
      prev.availabilityWeekKey && prev.availabilityWeek?.length
        ? prev.availabilityWeek
        : null,
    uiStates: { ...prev.uiStates, time: "loading" },
  }));
  try {
    const days = await getWeekAvailability(service.id, weekStart);
    store.setState((prev) => {
      if (prev.availabilityWeekRequestKey !== key) {
        return {};
      }
      return {
        availabilityWeekKey: key,
        availabilityWeekRequestKey: null,
        availabilityWeekLoadingPlaceholder: null,
        availabilityWeek: days,
        availabilityLoading: false,
        uiStates: { ...prev.uiStates, time: days.length ? "normal" : "empty" },
      };
    });
  } catch (error) {
    store.setState((prev) => {
      if (prev.availabilityWeekRequestKey !== key) {
        return {};
      }
      return {
        availabilityLoading: false,
        availabilityWeekRequestKey: null,
        availabilityWeekLoadingPlaceholder: null,
        uiStates: { ...prev.uiStates, time: "error" },
      };
    });
  }
};

  const render = () => {
  const state = store.getState();
  initUser();

  if (state.step === 1 && state.services.length === 1 && !state.selectedService) {
    const initialCursor = getInitialCursorForService(state.services[0]);
    store.setState({
      selectedService: state.services[0],
      monthCursor: initialCursor.monthCursor,
      weekCursor: initialCursor.weekCursor,
      availabilityMonthKey: null,
      availabilityMonthRequestKey: null,
      availabilityWeekKey: null,
      availabilityWeekRequestKey: null,
      availabilityMonth: [],
      availabilityWeek: [],
      adminBookingAction: "self",
      adminBookingForUserId: "",
      step: 2,
    });
    return;
  }

  const isMobile = window.innerWidth <= 600;
  clearElement(app);
  const shell = createElement("div", { className: "app-shell" });

  const headerBack =
    state.step === 1
      ? null
      : state.step === 2
        ? () => store.setState({ step: 1 })
        : () => store.setState({ step: 2 });

    shell.append(
      Header({
        apartmentId: state.sessionUser?.apartment_id || "—",
        tenantName: state.sessionTenant?.name,
        showBack: Boolean(headerBack),
        onBack: headerBack || undefined,
        onHelp: openHelp,
        onLogout: logout,
      })
    );

  let screen;
  let footer;
  let pendingMonthLoad = null;
  let pendingWeekLoad = null;

  if (state.step === 1) {
    screen = ServiceSelection({
      services: state.services,
      selectedService: state.selectedService,
      onSelect: (service) => {
        const initialCursor = getInitialCursorForService(service);
        store.setState({
          selectedService: service,
          selectedDate: null,
          selectedSlot: null,
          monthCursor: initialCursor.monthCursor,
          weekCursor: initialCursor.weekCursor,
          availabilityMonthKey: null,
          availabilityMonthRequestKey: null,
          availabilityWeekKey: null,
          availabilityWeekRequestKey: null,
          availabilityMonth: [],
          availabilityWeek: [],
          adminBookingAction: "self",
          adminBookingForUserId: "",
          step: 2,
          confirmed: false,
          confirmationCalendarEvent: null,
          confirmationBookingId: null,
        });
      },
      bookings: state.bookings,
      cancelModalOpen: state.cancelModalOpen,
      cancelBooking: state.cancelBooking,
      onOpenCancel: (booking) =>
        store.setState({ cancelModalOpen: true, cancelBooking: booking }),
      onCloseCancel: () => store.setState({ cancelModalOpen: false, cancelBooking: null }),
      onConfirmCancel: async () => {
        const target = store.getState().cancelBooking;
        if (target?.id) {
          await cancelBooking(target.id);
        }
        const bookingsData = await getCurrentBookings();
        store.setState({
          bookings: bookingsData.filter(isBookingCurrentOrFuture),
          cancelModalOpen: false,
          cancelBooking: null,
        });
      },
      qrWarningOpen: state.qrWarningOpen,
      qrGenerating: state.qrGenerating,
      qrError: state.qrError,
      qrUrl: state.qrUrl,
      qrImageUrl: state.qrImageUrl,
      qrModalOpen: state.qrModalOpen,
      onOpenQrWarning: () => store.setState({ qrWarningOpen: true, qrError: "" }),
      onCloseQrWarning: () => store.setState({ qrWarningOpen: false, qrError: "" }),
      onConfirmQr: refreshPersonalQrLink,
      onCloseQrModal: () => {
        const nextPath = store.getState().qrRedirectPath;
        store.setState({ qrModalOpen: false });
        if (nextPath) {
          window.location.assign(nextPath);
        }
      },
      isMobile,
      isKioskMode: isKioskRoute,
      state: state.uiStates.service,
    });

    footer = null;
  }

  if (state.step === 2 && state.selectedService?.bookingType === "full-day") {
    const isAdminUser = Boolean(state.sessionUser?.is_admin);
    const { year, monthIndex } = state.monthCursor;
    const monthKey = `${state.selectedService.id}-${year}-${monthIndex}`;
    const isMonthDataCurrent = state.availabilityMonthKey === monthKey;
    const isMonthRequestInFlight = state.availabilityMonthRequestKey === monthKey;
    if (!isMonthDataCurrent && !isMonthRequestInFlight) {
      pendingMonthLoad = {
        service: state.selectedService,
        year,
        monthIndex,
      };
    }
    const days = (isMonthDataCurrent ? state.availabilityMonth || [] : []).map((day) => {
      const statusPatchedDay = state.cancelledDayIds.includes(day.id) ? { ...day, status: "available" } : day;
      if (statusPatchedDay.status === "outside") {
        return statusPatchedDay;
      }
      const isWeekend = [0, 6].includes(statusPatchedDay.date.getDay());
      const priceCents = isWeekend ? Number(state.selectedService?.priceWeekend || 0) : Number(state.selectedService?.priceWeekday || 0);
      return {
        ...statusPatchedDay,
        bookedByApartmentId: isAdminUser ? statusPatchedDay.bookedByApartmentId || null : null,
        priceText: priceCents > 0 ? `${Math.round(priceCents / 100)} kr` : "",
      };
    });
    const visibleDays = isMobile ? days.filter((day) => day.status !== "disabled") : days;

    screen = DateSelection({
      monthLabel: getMonthLabel(year, monthIndex),
      days: visibleDays,
      expectedDays: getExpectedMonthDays(year, monthIndex),
      selectedDateId: state.selectedDate?.id,
      onSelect: (day) => {
        if (day.status === "mine" || (isAdminUser && day.status === "booked") || (isAdminUser && day.status === "blocked")) {
          store.setState({
            cancelModalOpen: true,
            cancelBooking: buildCancelBooking({
              date: day.date,
              timeLabel: getFullDayTimeLabel(state.selectedService),
              serviceName: state.selectedService?.name,
              sourceId: day.id,
              bookingId: day.bookingId || day.blockId || null,
              cancelType: day.status === "blocked" ? "block" : "booking",
            }),
          });
          return;
        }
        if (day.status !== "available") {
          return;
        }
        store.setState({
          selectedDate: day,
          selectedSlot: null,
          adminBookingAction: "self",
          adminBookingForUserId: "",
          step: 3,
          confirmed: false,
          confirmationCalendarEvent: null,
          confirmationBookingId: null,
        });
      },
      onPrev: () => {
        const nextMonth = new Date(year, monthIndex - 1, 1);
        if (canMoveMonth(nextMonth.getFullYear(), nextMonth.getMonth(), state.selectedService)) {
          store.setState({ monthCursor: { year: nextMonth.getFullYear(), monthIndex: nextMonth.getMonth() } });
        }
      },
      onNext: () => {
        const nextMonth = new Date(year, monthIndex + 1, 1);
        if (canMoveMonth(nextMonth.getFullYear(), nextMonth.getMonth(), state.selectedService)) {
          store.setState({ monthCursor: { year: nextMonth.getFullYear(), monthIndex: nextMonth.getMonth() } });
        }
      },
      canPrev: canMoveMonth(year, monthIndex - 1, state.selectedService),
      canNext: canMoveMonth(year, monthIndex + 1, state.selectedService),
      state: isMonthDataCurrent ? state.uiStates.date : "loading",
      cancelModalOpen: state.cancelModalOpen,
      cancelBooking: state.cancelBooking,
      onCloseCancel: () => store.setState({ cancelModalOpen: false, cancelBooking: null }),
      onConfirmCancel: async () => {
        const target = store.getState().cancelBooking;
        const bookingId = target?.bookingId || findBookingId(store.getState().bookings, target);
        if (bookingId) {
          await cancelBooking(bookingId);
        }
        const bookingsData = await getCurrentBookings();
        store.setState({
          cancelledDayIds: [...store.getState().cancelledDayIds, store.getState().cancelBooking?.id].filter(Boolean),
          bookings: bookingsData.filter(isBookingCurrentOrFuture),
          cancelModalOpen: false,
          cancelBooking: null,
        });
        loadMonthAvailability(state.selectedService, year, monthIndex);
      },
      isAdminView: isAdminUser,
    });

    footer = null;
  }

  if (state.step === 2 && state.selectedService?.bookingType !== "full-day") {
    const isAdminUser = Boolean(state.sessionUser?.is_admin);
    const weekKey = weekAvailabilityStateKey(state.selectedService.id, state.weekCursor);
    const isWeekDataCurrent = state.availabilityWeekKey === weekKey;
    const isWeekRequestInFlight = state.availabilityWeekRequestKey === weekKey;
    if (!isWeekDataCurrent && !isWeekRequestInFlight) {
      pendingWeekLoad = {
        service: state.selectedService,
        weekStart: new Date(state.weekCursor),
      };
    }
    const weekSlots = (isWeekDataCurrent ? state.availabilityWeek || [] : []).map((day) => ({
      ...day,
      slots: day.slots.map((slot) =>
        state.cancelledSlotIds.includes(slot.id)
          ? { ...slot, status: "available", bookedByApartmentId: null }
          : {
              ...slot,
              bookedByApartmentId: isAdminUser ? slot.bookedByApartmentId || null : null,
            }
      ),
    }));
    const visibleSlots = isMobile
      ? weekSlots.filter((day) => day.slots.some((slot) => slot.status !== "disabled"))
      : weekSlots;
    const prevWeekCandidate = new Date(state.weekCursor);
    prevWeekCandidate.setDate(prevWeekCandidate.getDate() - 7);
    const nextWeekCandidate = new Date(state.weekCursor);
    nextWeekCandidate.setDate(nextWeekCandidate.getDate() + 7);
    const expectedWeekSlots = getExpectedWeekSlots(state.weekCursor, state.selectedService?.slotDuration);

    screen = TimeSelection({
      weekLabel: getWeekLabel(state.weekCursor),
      weekSlots: visibleSlots,
      expectedWeekSlots: state.availabilityWeekLoadingPlaceholder || expectedWeekSlots,
      selectedSlotId: state.selectedSlot?.id,
      onSelect: (slot) => {
        if (slot.status === "mine" || (isAdminUser && slot.status === "booked") || (isAdminUser && slot.status === "blocked")) {
          store.setState({
            cancelModalOpen: true,
            cancelBooking: buildCancelBooking({
              date: slot.date,
              timeLabel: slot.label,
              serviceName: state.selectedService?.name,
              sourceId: slot.id,
              bookingId: slot.bookingId || slot.blockId || null,
              cancelType: slot.status === "blocked" ? "block" : "booking",
            }),
          });
          return;
        }
        if (slot.status !== "available") {
          return;
        }
        store.setState({
          selectedSlot: slot,
          selectedDate: { id: slot.id, date: slot.date },
          adminBookingAction: "self",
          adminBookingForUserId: "",
          step: 3,
          confirmed: false,
          confirmationCalendarEvent: null,
          confirmationBookingId: null,
        });
      },
      onPrev: () => {
        if (canMoveWeek(prevWeekCandidate, state.selectedService)) {
          store.setState({
            weekCursor: new Date(prevWeekCandidate),
            availabilityWeekRequestKey: null,
          });
        }
      },
      onNext: () => {
        if (canMoveWeek(nextWeekCandidate, state.selectedService)) {
          store.setState({
            weekCursor: new Date(nextWeekCandidate),
            availabilityWeekRequestKey: null,
          });
        }
      },
      canPrev: canMoveWeek(prevWeekCandidate, state.selectedService),
      canNext: canMoveWeek(nextWeekCandidate, state.selectedService),
      state: isWeekDataCurrent ? state.uiStates.time : "loading",
      cancelModalOpen: state.cancelModalOpen,
      cancelBooking: state.cancelBooking,
      onCloseCancel: () => store.setState({ cancelModalOpen: false, cancelBooking: null }),
      onConfirmCancel: async () => {
        const target = store.getState().cancelBooking;
        const bookingId = target?.bookingId || findBookingId(store.getState().bookings, target);
        if (bookingId) {
          await cancelBooking(bookingId);
        }
        const bookingsData = await getCurrentBookings();
        store.setState({
          cancelledSlotIds: [...store.getState().cancelledSlotIds, store.getState().cancelBooking?.id].filter(Boolean),
          bookings: bookingsData.filter(isBookingCurrentOrFuture),
          cancelModalOpen: false,
          cancelBooking: null,
        });
        loadWeekAvailability(state.selectedService, state.weekCursor);
      },
      isAdminView: isAdminUser,
    });

    footer = null;
  }

  if (state.step === 3) {
    const maxBookingsReached = isSelectedServiceMaxReached(state);
    const isAdminUser = Boolean(state.sessionUser?.is_admin);
    const adminAction = state.adminBookingAction || "self";
    const enforceClientMaxBookings = !(isAdminUser && (adminAction === "other" || adminAction === "block"));
    const maxBookingsBlockedByClient = maxBookingsReached && enforceClientMaxBookings;
    const requiresTargetUser = isAdminUser && adminAction === "other";
    const adminTargetMissing = requiresTargetUser && !state.adminBookingForUserId;
    const summary = createBookingSummary({
      service: state.selectedService,
      date: state.selectedDate?.date,
      timeslot: state.selectedSlot,
    });

    const calendarBookingId = state.confirmationBookingId;
    const calendarPageUrl = buildCalendarDownloadPageUrl({ bookingId: calendarBookingId });
    const calendarQrImageUrl = buildCalendarQrImageUrl(calendarPageUrl);

    screen = Confirmation({
      summary,
      state: state.uiStates.confirmation,
      maxBookingsReached: maxBookingsBlockedByClient,
      confirmed: state.confirmed,
      isKioskMode: !isMobile,
      calendarQrImageUrl,
      calendarDownloadUrl: calendarPageUrl,
      onBack: () =>
        store.setState((prev) => ({
          step: 2,
          bookingErrorDetail: "",
          uiStates: { ...prev.uiStates, confirmation: "normal" },
        })),
      onAcknowledge: () =>
        store.setState({
          step: 2,
          confirmed: false,
          selectedDate: null,
          selectedSlot: null,
          confirmationCalendarEvent: null,
          confirmationBookingId: null,
          uiStates: { ...store.getState().uiStates, confirmation: "normal" },
        }),
      onConfirm: async () => {
        if (!summary || maxBookingsBlockedByClient || adminTargetMissing) {
          return;
        }
        store.setState((prev) => ({ uiStates: { ...prev.uiStates, confirmation: "loading" } }));
        try {
          const currentState = store.getState();
          const bookingRange = buildBookingRangeForState(currentState);
          if (!bookingRange) {
            store.setState((prev) => ({
              confirmed: false,
              uiStates: { ...prev.uiStates, confirmation: "error" },
            }));
            return;
          }
          const bookingResult = await createBooking({
            booking_object_id: currentState.selectedService.id,
            start_time: bookingRange.startTime,
            end_time: bookingRange.endTime,
            action: isAdminUser && currentState.adminBookingAction === "block" ? "block" : "book",
            booking_for_user_id:
              isAdminUser && currentState.adminBookingAction === "other"
                ? currentState.adminBookingForUserId
                : undefined,
          });
          const shouldMarkAsMine = !(isAdminUser && currentState.adminBookingAction !== "self");
          const calendarEventData = buildConfirmationCalendarEvent(currentState, bookingRange);
          store.setState((prev) => ({
            confirmed: true,
            confirmationCalendarEvent: calendarEventData,
            confirmationBookingId: bookingResult?.booking_id || null,
            availabilityMonth:
              prev.selectedService?.bookingType === "full-day" && shouldMarkAsMine
                ? markMonthDayAsMine(prev.availabilityMonth, prev.selectedDate?.id)
                : prev.availabilityMonth,
            availabilityWeek:
              prev.selectedService?.bookingType === "full-day" || !shouldMarkAsMine
                ? prev.availabilityWeek
                : markWeekSlotAsMine(prev.availabilityWeek, prev.selectedSlot?.id),
            uiStates: { ...prev.uiStates, confirmation: "normal" },
          }));
          try {
            const bookingsData = await getCurrentBookings();
            store.setState({
              bookings: bookingsData.filter(isBookingCurrentOrFuture),
            });
          } catch (refreshError) {
            console.error("Kunde inte uppdatera aktuella bokningar efter bokning.", refreshError);
          }
          if (currentState.selectedService?.bookingType === "full-day") {
            loadMonthAvailability(currentState.selectedService, currentState.monthCursor.year, currentState.monthCursor.monthIndex);
          } else if (currentState.selectedService) {
            loadWeekAvailability(currentState.selectedService, currentState.weekCursor);
          }
        } catch (error) {
          store.setState((prev) => ({
            confirmed: false,
            confirmationCalendarEvent: null,
            confirmationBookingId: null,
            bookingErrorDetail: error?.detail || "booking_failed",
            uiStates: { ...prev.uiStates, confirmation: "error" },
          }));
        }
      },
      errorDetail:
        state.uiStates.confirmation === "error"
          ? state.bookingErrorDetail || (maxBookingsBlockedByClient ? "max_bookings_reached" : "booking_failed")
          : maxBookingsBlockedByClient
            ? "max_bookings_reached"
            : "",
      isAdminUser,
      adminUsers: state.adminBookableUsers,
      bookingAction: state.adminBookingAction,
      bookingForUserId: state.adminBookingForUserId,
      onChangeBookingAction: (value) =>
        store.setState({
          adminBookingAction: value,
          adminBookingForUserId: value === "other" ? store.getState().adminBookingForUserId : "",
        }),
      onChangeBookingForUserId: (value) => store.setState({ adminBookingForUserId: value }),
      confirmDisabled: !summary || maxBookingsBlockedByClient || adminTargetMissing,
    });

    footer = null;
  }

  if (screen) {
    shell.append(screen);
  }
  if (footer) {
    shell.append(footer);
  }
  shell.append(createLegalFooter());
    app.append(shell);

  if (pendingMonthLoad) {
    queueMicrotask(() => {
      const latest = store.getState();
      if (latest.step !== 2 || latest.selectedService?.bookingType !== "full-day" || !latest.selectedService) {
        return;
      }
      const { service, year, monthIndex } = pendingMonthLoad;
      if (!latest.selectedService || latest.selectedService.id !== service.id) {
        return;
      }
      const key = `${service.id}-${year}-${monthIndex}`;
      if (latest.availabilityMonthKey === key || latest.availabilityMonthRequestKey === key) {
        return;
      }
      loadMonthAvailability(service, year, monthIndex);
    });
  }

  if (pendingWeekLoad) {
    queueMicrotask(() => {
      const latest = store.getState();
      if (latest.step !== 2 || latest.selectedService?.bookingType === "full-day" || !latest.selectedService) {
        return;
      }
      const { service, weekStart } = pendingWeekLoad;
      if (latest.selectedService.id !== service.id) {
        return;
      }
      const key = weekAvailabilityStateKey(service.id, weekStart);
      if (latest.availabilityWeekKey === key || latest.availabilityWeekRequestKey === key) {
        return;
      }
      loadWeekAvailability(service, weekStart);
    });
  }
  };

  store.subscribe(render);
  render();
} else if (routePath.startsWith("/setup/")) {
  const setupState = {
    step: 1,
    status: "loading",
    data: null,
    error: "",
    users: [],
    bookingObjects: [],
    bookingGroups: [],
    accessGroups: [],
    userQuery: "",
    userListError: "",
    bookingListError: "",
    stepError: "",
    editUserOpen: false,
    editUserId: null,
    editUserForm: {
      apartmentId: "",
      house: "",
      groups: [],
      rfidTags: [],
      rfidDraft: "",
      rfid: "",
      active: true,
      admin: false,
    },
    editUserValidationErrors: {},
    userSelectorOpen: false,
    userRfidModalOpen: false,
    userGroupModalOpen: false,
    addRfidDraft: "",
    confirmModal: buildConfirmModalState(),
    accessGroupDraft: "",
    bookingModalOpen: false,
    bookingModalMode: "add",
    editBookingId: null,
    bookingForm: {
      name: "Tvättstuga",
      type: "Tidspass",
      slotDuration: "120",
      fullDayStartTime: "12:00",
      fullDayEndTime: "12:00",
      slotStartTime: "08:00",
      slotEndTime: "20:00",
      windowMin: "0",
      windowMax: "30",
      maxBookings: DEFAULT_MAX_BOOKINGS,
      groupId: "",
      priceWeekday: "",
      priceWeekend: "",
      status: "Aktiv",
      allowHouses: [],
      allowGroups: [],
      allowApartments: [],
      denyHouses: [],
      denyGroups: [],
      denyApartments: [],
    },
    selectorOpenKey: null,
    bookingSelectorScrollTop: 0,
    groupModalOpen: false,
    bookingGroupDraft: "",
    bookingModalValidationError: "",
    bookingModalValidationErrors: {},
    setupOrderSending: false,
    setupOrderSuccess: "",
    setupOrderError: "",
    setupQrPdfLoading: false,
    setupQrPdfError: "",
    importOpen: false,
    importStep: 1,
    importFileName: "",
    importRowCount: 0,
    importCsvText: "",
    importHeaders: [],
    importPreview: null,
    importProgress: 0,
    isImporting: false,
    csvGroups: [],
    houseSamples: [],
    apartmentSamples: [],
    groupSamples: [],
    importEncoding: "",
    importEncodingWarning: "",
    addNew: true,
    updateChanged: true,
    removeMissing: false,
    identityField: "",
    groupsField: "-",
    rfidField: "",
    activeField: "",
    houseField: "",
    apartmentField: "",
    houseRegex: "",
    apartmentRegex: "",
    apartmentRegexOpen: false,
    houseRegexOpen: false,
    groupSeparator: "|",
    adminGroups: [],
    adminSelectorOpen: false,
    adminSelectorScrollTop: 0,
    importFocus: "",
    importFocusStart: null,
    importFocusEnd: null,
    importRules: null,
  };
  const setupToken =
    routePath.startsWith("/setup/") ? routePath.slice("/setup/".length).replace(/\/+$/, "") : "";

  const setSetupState = (next) => {
    const update = typeof next === "function" ? next({ ...setupState }) : next;
    Object.assign(setupState, update);
    renderSetup();
  };

  const buildRegexEffect = (samples, regexSource) => {
    if (!regexSource) {
      return samples.map((original) => ({ original, value: "—" }));
    }
    let regex;
    try {
      regex = new RegExp(regexSource);
    } catch {
      return samples.map((original) => ({ original, value: "Ogiltig regex" }));
    }
    return samples.map((original) => {
      const match = regex.exec(original);
      if (!match) {
        return { original, value: "Ingen träff" };
      }
      if (match.length > 1) {
        return { original, value: match.slice(1).join("-") };
      }
      return { original, value: match[0] };
    });
  };

  const houseSamples = [
    "1-LGH1001 /1001 Kor tag1",
    "1-LGH1012 /1108 iLoq Blå",
    "6-LGH1132/1204 iLoq Grön",
    "6-LGH1133 /1205 tag1",
    "6-LGH1133/1205 iLoq Röd",
  ];

  const apartmentSamples = [
    "1-LGH1001 /1001 Kor tag1",
    "1-LGH1012 /1108 iLoq Blå",
    "6-LGH1132/1204 iLoq Grön",
    "6-LGH1133 /1205 tag1",
    "6-LGH1133/1205 iLoq Röd",
  ];

  const buildImportRules = (state) => ({
    identity_field: state.identityField || state.importRules?.identity_field || "OrgGrupp",
    groups_field:
      state.groupsField === "-"
        ? ""
        : state.groupsField || state.importRules?.groups_field || "Behörighetsgrupp",
    rfid_field: state.rfidField || state.importRules?.rfid_field || "Identitetsid",
    active_field:
      state.activeField === "-"
        ? ""
        : state.activeField || state.importRules?.active_field || "Identitetsstatus (0=på 1=av)",
    house_field:
      state.houseField === "-"
        ? ""
        : state.houseField || state.importRules?.house_field || "Placering",
    apartment_field: state.apartmentField || state.importRules?.apartment_field || "Lägenhet",
    house_regex: state.houseRegex || state.importRules?.house_regex || "",
    apartment_regex: state.apartmentRegex || state.importRules?.apartment_regex || "",
    group_separator: state.groupSeparator || state.importRules?.group_separator || "|",
    admin_groups: (state.adminGroups?.length ? state.adminGroups : state.importRules?.admin_groups?.split("|") || []).join("|"),
  });

  const nextStep = () => {
    if (setupState.step === 1 && setupState.users.length === 0) {
      setSetupState({ stepError: "Lägg till minst en användare för att gå vidare." });
      return;
    }
    if (setupState.step === 2 && setupState.bookingObjects.length === 0) {
      setSetupState({ stepError: "Lägg till minst ett bokningsobjekt för att gå vidare." });
      return;
    }
    setSetupState((prev) => ({ step: Math.min((prev.step || 1) + 1, 3), stepError: "" }));
  };
  const prevStep = () => setSetupState((prev) => ({ step: Math.max((prev.step || 1) - 1, 1), stepError: "" }));

  const loadSetupLists = async () => {
    const [usersData, bookingObjectsData, bookingGroupsData, accessGroupsData, rulesData] = await Promise.all([
      getUsers(),
      getBookingObjects(),
      getBookingGroups(),
      getAccessGroups(),
      getImportRules(),
    ]);
    const rules = rulesData?.rules || null;
    setSetupState({
      users: usersData,
      bookingObjects: bookingObjectsData,
      bookingGroups: bookingGroupsData,
      accessGroups: accessGroupsData.map((group) => group.name),
      importRules: rules,
      identityField: rules?.identity_field,
      groupsField: rules?.groups_field || "-",
      rfidField: rules?.rfid_field,
      activeField: rules?.active_field || "-",
      houseField: rules?.house_field,
      apartmentField: rules?.apartment_field,
      houseRegex: rules?.house_regex,
      apartmentRegex: rules?.apartment_regex,
      groupSeparator: rules?.group_separator,
      adminGroups: rules?.admin_groups ? rules.admin_groups.split("|").filter(Boolean) : [],
    });
  };

  const loadSetupData = async () => {
    let data;
    try {
      data = await verifyBrfSetup(setupToken);
    } catch (error) {
      const message = error?.detail || "Länken är ogiltig eller har gått ut.";
      setSetupState({ status: "error", error: message });
      return;
    }

    if (data?.is_setup_complete) {
      window.location.href = `/admin/${data.account_owner_token || data.uuid}`;
      return;
    }

    setAccessToken(data.account_owner_token || data.uuid);
    setSetupState({ status: "ready", data, error: "", stepError: "" });
    try {
      await loadSetupLists();
    } catch (error) {
      const detail = error?.detail || "internal_error";
      setSetupState({
        stepError: `Länken verifierades, men kunde inte ladda setup-data (${detail}). Ladda om sidan.`,
      });
    }
  };

  const openUserModal = (user) => {
    setSetupState({
      editUserOpen: true,
      editUserId: user?.id || null,
      userSelectorOpen: false,
      userRfidModalOpen: false,
      userGroupModalOpen: false,
      addRfidDraft: "",
      accessGroupDraft: "",
      editUserForm: user
        ? {
            apartmentId: user.apartmentId,
            house: user.house,
            groups: user.groups || [],
            rfidTags: user.rfidTags || (user.rfid ? [user.rfid] : []),
            rfidDraft: "",
            rfid: user.rfid || "",
            active: user.active !== false,
            admin: user.admin === true,
          }
        : {
            apartmentId: "",
            house: "",
            groups: [],
            rfidTags: [],
            rfidDraft: "",
            rfid: "",
            active: true,
            admin: false,
          },
      editUserValidationErrors: {},
    });
  };

  const openSetupConfirmModal = ({ title, message, confirmLabel = "Bekräfta", onConfirm }) => {
    setSetupState({
      confirmModal: buildConfirmModalState({
        open: true,
        title,
        message,
        confirmLabel,
        onConfirm,
      }),
    });
  };

  const closeSetupConfirmModal = () => {
    setSetupState({ confirmModal: buildConfirmModalState() });
  };

  const deleteUserEntry = async (user) => {
    try {
      await deleteUser(user.id, false);
      await loadSetupLists();
      setSetupState({ userListError: "" });
    } catch (error) {
      if (error?.detail === "user_has_bookings") {
        openSetupConfirmModal({
          title: "Ta bort användare med bokningar",
          message: "Användaren har bokningar. Vill du ta bort användaren och alla bokningar?",
          confirmLabel: "Ta bort allt",
          onConfirm: async () => {
            await deleteUser(user.id, true);
            await loadSetupLists();
            setSetupState({ userListError: "" });
          },
        });
        return;
      }
      setSetupState({ userListError: "Kunde inte ta bort användaren." });
    }
  };

  const openBookingModal = (mode, item) => {
    setupBookingObjectModalScrollTop = 0;
    setSetupState({
      bookingModalOpen: true,
      bookingModalMode: mode,
      editBookingId: item?.id || null,
      selectorOpenKey: null,
      bookingSelectorScrollTop: 0,
      bookingModalValidationError: "",
      bookingModalValidationErrors: {},
      bookingForm: item
        ? {
            name: item.name,
            type: item.type,
            slotDuration: item.slotDuration,
            fullDayStartTime: item.fullDayStartTime || "12:00",
            fullDayEndTime: item.fullDayEndTime || "12:00",
            slotStartTime: item.slotStartTime || "08:00",
            slotEndTime: item.slotEndTime || "20:00",
            windowMin: item.windowMin,
            windowMax: item.windowMax,
            maxBookings: item.maxBookings,
            groupId: item.groupId || "",
            priceWeekday: item.priceWeekday,
            priceWeekend: item.priceWeekend,
            status: item.status,
            allowHouses: item.allowHouses || [],
            allowGroups: item.allowGroups || [],
            allowApartments: item.allowApartments || [],
            denyHouses: item.denyHouses || [],
            denyGroups: item.denyGroups || [],
            denyApartments: item.denyApartments || [],
          }
        : {
            name: "Tvättstuga",
            type: "Tidspass",
            slotDuration: "120",
            fullDayStartTime: "12:00",
            fullDayEndTime: "12:00",
            slotStartTime: "08:00",
            slotEndTime: "20:00",
            windowMin: "0",
            windowMax: "30",
            maxBookings: DEFAULT_MAX_BOOKINGS,
            groupId: "",
            priceWeekday: "",
            priceWeekend: "",
            status: "Aktiv",
            allowHouses: [],
            allowGroups: [],
            allowApartments: [],
            denyHouses: [],
            denyGroups: [],
            denyApartments: [],
          },
    });
  };

  const deleteBookingObject = async (item) => {
    try {
      await deactivateBookingObject(item.id, false);
      await loadSetupLists();
      setSetupState({ bookingListError: "" });
    } catch (error) {
      if (error?.detail === "booking_object_has_future_bookings") {
        openSetupConfirmModal({
          title: "Ta bort bokningsobjekt med bokningar",
          message: "Det finns framtida/pågående bokningar. Vill du ta bort objektet och avboka dessa?",
          confirmLabel: "Ta bort och avboka",
          onConfirm: async () => {
            await deactivateBookingObject(item.id, true);
            await loadSetupLists();
            setSetupState({ bookingListError: "" });
          },
        });
        return;
      }
      setSetupState({ bookingListError: "Kunde inte ta bort bokningsobjektet." });
    }
  };

  const renderSetup = () => {
    const docScrollX = window.scrollX;
    const docScrollY = window.scrollY;
    const setupActiveElement =
      setupState.editUserOpen ||
      setupState.userRfidModalOpen ||
      setupState.userGroupModalOpen ||
      setupState.userSelectorOpen
        ? document.activeElement
        : null;
    const setupEditUserFocusSnapshot =
      setupActiveElement && setupActiveElement.getAttribute?.("data-focus-key")
        ? {
            key: setupActiveElement.getAttribute("data-focus-key"),
            start:
              typeof setupActiveElement.selectionStart === "number"
                ? setupActiveElement.selectionStart
                : null,
            end:
              typeof setupActiveElement.selectionEnd === "number" ? setupActiveElement.selectionEnd : null,
          }
        : null;
    const existingSetupEditUserScrollEl =
      setupState.editUserOpen ? document.querySelector(".edit-user-modal-scroll") : null;
    const savedSetupEditUserModalScrollTop = existingSetupEditUserScrollEl
      ? existingSetupEditUserScrollEl.scrollTop
      : 0;
    clearElement(app);
    const step = setupState.step || 1;

    const stepHeader = createElement("div", {
      className: "modal-step",
      text: `Steg ${step} av 3`,
    });

    if (setupState.status === "loading") {
      app.append(
        createElement("div", {
          className: "setup-page",
          children: [
            createElement("div", {
              className: "setup-container",
              children: [
                createElement("div", {
                  className: "setup-card card",
                  children: [
                    createElement("div", { className: "modal-title", text: "Verifierar länken..." }),
                    createElement("div", {
                      className: "screen-subtitle",
                      text: "Detta kan ta några sekunder.",
                    }),
                  ],
                }),
              ],
            }),
          ],
        })
      );
      return;
    }

    if (setupState.status === "error") {
      app.append(
        createElement("div", {
          className: "setup-page",
          children: [
            createElement("div", {
              className: "setup-container",
              children: [
                createElement("div", {
                  className: "setup-card card",
                  children: [
                    createElement("div", { className: "modal-title", text: "Länken kunde inte verifieras" }),
                    createElement("div", { className: "form-error", text: setupState.error }),
                  ],
                }),
              ],
            }),
          ],
        })
      );
      return;
    }

    const userActions = createElement("div", {
      className: "admin-section-actions",
      children: [
        createElement("button", {
          className: "secondary-button admin-btn-add",
          text: "Lägg till",
          onClick: () => openUserModal(null),
        }),
        createElement("button", {
          className: "secondary-button admin-btn-add",
          text: "Importera",
          onClick: () => setSetupState({ importOpen: true, importStep: 1 }),
        }),
        createElement("button", {
          className: "secondary-button admin-btn-add",
          text: "Ladda ner CSV‑mall",
          onClick: () => {
            const csv = "Lägenhet,Hus/Trappuppgång,RFID UID,Behörigheter\n";
            const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = "anvandare-mall.csv";
            link.click();
            URL.revokeObjectURL(url);
          },
        }),
      ],
    });

    const usersSection = createElement("div", {
      className: "admin-section card",
      children: [
        createElement("div", {
          className: "admin-section-header",
          children: [
            createElement("div", {
              children: [
                createElement("div", { className: "admin-section-title", text: "Lägenheter" }),
                createElement("div", {
                  className: "admin-section-desc",
                  text: "Lägg till minst en lägenhet innan du går vidare.",
                }),
              ],
            }),
            userActions,
          ],
        }),
        setupState.userListError
          ? createElement("div", { className: "form-error", text: setupState.userListError })
          : null,
        UserList({
          users: setupState.users,
          query: setupState.userQuery,
          onQueryChange: (value) => setSetupState({ userQuery: value }),
          onPrimaryAction: openUserModal,
          primaryLabel: "Redigera",
          onDelete: deleteUserEntry,
          emptyText: "Inga användare ännu.",
        }),
      ].filter(Boolean),
    });

    const bookingSection = createElement("div", {
      className: "admin-section card",
      children: [
        createElement("div", {
          className: "admin-section-header",
          children: [
            createElement("div", {
              children: [
                createElement("div", { className: "admin-section-title", text: "Bokningsobjekt" }),
                createElement("div", {
                  className: "admin-section-desc",
                  text: "Skapa minst ett bokningsobjekt innan du går vidare.",
                }),
              ],
            }),
            createElement("div", {
              className: "admin-section-actions",
              children: [
                createElement("button", {
                  className: "secondary-button admin-btn-add",
                  text: "Lägg till",
                  onClick: () => openBookingModal("add"),
                }),
              ],
            }),
          ],
        }),
        setupState.bookingListError
          ? createElement("div", { className: "form-error", text: setupState.bookingListError })
          : null,
        setupState.bookingObjects.length
          ? BookingObjectsTable({
              bookingObjects: setupState.bookingObjects,
              onEdit: (item) => openBookingModal("edit", item),
              onCopy: (item) => openBookingModal("copy", item),
              onDelete: deleteBookingObject,
            })
          : createElement("div", { className: "empty-state", text: "Inga bokningsobjekt ännu." }),
      ].filter(Boolean),
    });

    const orderSection = createElement("div", {
      className: "form-stack",
      children: [
        createElement("div", {
          className: "form-inline-section-title",
          text: "Beställ bokningstavlor",
        }),
        createElement("div", {
          className: "form-field-hint form-inline-section-hint",
          text: "Om ni vill ha digitala bokningstavlor i trapphus / tvättstugor kan ni beställa dem här. De digitala tavlorna möjliggör inte bara bokningar via touchskärmen utan också \"self-service\" för boende där de med hjälp av sina taggar kan generera egna personliga inloggningslänkar att använda för att boka via mobiltelefon och dator.",
        }),
        createElement("div", {
          className: "form-field-hint form-inline-section-hint",
          text: "Beställ bokningsskärmar till er förening. Pris: 6 000 kr per skärm inklusive moms. Klicka intill så kommer en säljare från embsign AB att kontakta dig!",
        }),
        createElement("button", {
          className: "primary-button setup-inline-action-button",
          text: setupState.setupOrderSending ? "Skickar…" : "Kontakta mig",
          attrs: {
            type: "button",
            disabled: setupState.setupOrderSending || !setupState.data ? "disabled" : null,
          },
          onClick: setupState.setupOrderSending
            ? null
            : async () => {
                const email = String(setupState.data?.email || "").trim();
                const associationName = String(setupState.data?.association_name || "").trim();
                setSetupState({ setupOrderSending: true, setupOrderError: "", setupOrderSuccess: "" });
                try {
                  await orderBookingScreens({
                    quantity: 1,
                    contactEmail: email,
                    contactName: associationName,
                  });
                  setSetupState({
                    setupOrderSending: false,
                    setupOrderSuccess:
                      "Beställningen har skickats till info@embsign.se. En säljare kommer kontakta er.",
                  });
                } catch (error) {
                  setSetupState({
                    setupOrderSending: false,
                    setupOrderError: "Kunde inte skicka beställningen just nu. Försök igen senare eller kontakta Embsign.",
                  });
                }
              },
        }),
        setupState.setupOrderSuccess
          ? createElement("div", { className: "form-field-hint", text: setupState.setupOrderSuccess })
          : null,
        setupState.setupOrderError
          ? createElement("div", { className: "form-error", text: setupState.setupOrderError })
          : null,
      ].filter(Boolean),
    });

    const qrSection = createElement("div", {
      className: "form-stack",
      children: [
        createElement("div", {
          className: "form-inline-section-title",
          text: "Inloggningslänkar",
        }),
        createElement("div", {
          className: "form-field-hint form-inline-section-hint",
          text: "Ladda ned en PDF med en rad per aktiv lägenhet: intern lägenhets‑ID, eventuellt hus/trappuppgång, och en QR‑kod som boende kan skanna för att öppna sin personliga bokningslänk.",
        }),
        createElement("button", {
          className: "primary-button setup-inline-action-button",
          text: setupState.setupQrPdfLoading ? "Skapar PDF…" : "Ladda ned PDF med QR‑koder",
          attrs: {
            type: "button",
            disabled: setupState.setupQrPdfLoading || !setupState.data ? "disabled" : null,
          },
          onClick: setupState.setupQrPdfLoading
            ? null
            : async () => {
                setSetupState({ setupQrPdfLoading: true, setupQrPdfError: "" });
                try {
                  const payload = await getUserLoginQrExportData(
                    typeof window !== "undefined" ? window.location.origin : ""
                  );
                  const rows = payload?.rows || [];
                  const result = await downloadApartmentLoginQrPdf({
                    tenantName: payload?.tenant_name || "",
                    rows,
                  });
                  if (!result.ok) {
                    setSetupState({
                      setupQrPdfLoading: false,
                      setupQrPdfError:
                        "Det finns inga aktiva lägenheter att exportera. Gå tillbaka till steg 1 och lägg till användare.",
                    });
                    return;
                  }
                  setSetupState({ setupQrPdfLoading: false });
                } catch {
                  setSetupState({
                    setupQrPdfLoading: false,
                    setupQrPdfError:
                      "Kunde inte skapa PDF (nätverk eller tillfälligt fel). Försök igen eller ladda om sidan.",
                  });
                }
              },
        }),
        setupState.setupQrPdfError
          ? createElement("div", { className: "form-error", text: setupState.setupQrPdfError })
          : null,
      ].filter(Boolean),
    });

    const completeSection = createElement("div", {
      className: "form-stack",
      children: [
        createElement("div", {
          className: "form-inline-section-title",
          text: "Slutför setup",
        }),
        createElement("div", {
          className: "form-field-hint form-inline-section-hint",
          text: "När du klickar på Slutför setup skickas ett e-postmeddelande med admin-länken till markus@berglund.mx. Länken ger full åtkomst och ska sparas säkert.",
        }),
      ],
    });

    const content = (() => {
      switch (step) {
        case 1:
          return [
            createElement("div", { className: "modal-title", text: "Slutför setup – lägenheter" }),
            usersSection,
          ];
        case 2:
          return [
            createElement("div", { className: "modal-title", text: "Slutför setup – bokningsobjekt" }),
            bookingSection,
          ];
        case 3:
          return [
            createElement("div", { className: "modal-title", text: "Slutför setup" }),
            orderSection,
            qrSection,
            completeSection,
          ];
        default:
          return [];
      }
    })();

    const footer = createElement("div", {
      className: "modal-footer",
      children: [
        createElement("button", {
          className: "secondary-button",
          text: "Tillbaka",
          attrs: { disabled: step === 1 ? "disabled" : null },
          onClick: step === 1 ? null : prevStep,
        }),
        createElement("button", {
          className: "primary-button",
          text: step === 3 ? "Slutför setup" : "Nästa",
          onClick: async () => {
            if (step === 3) {
              try {
                const result = await completeBrfSetup(
                  setupState.data.account_owner_token,
                  setupState.data.email
                );
                if (result?.email_sent === false) {
                  const missing = result?.missing_email_config?.length
                    ? ` Saknar i Worker: ${result.missing_email_config.join(", ")}.`
                    : "";
                  const err = result?.email_error ? ` (${result.email_error})` : "";
                  window.alert(
                    `Admin-länken kunde inte skickas med e-post till ${setupState.data.email}.${missing}${err} Du skickas nu till admin – spara gärna länken som bokmärke.`
                  );
                }
              } catch (e) {
                window.alert(String(e?.message || e || "Kunde inte slutföra setup."));
                return;
              }
              window.location.href = `/admin/${setupState.data.account_owner_token}`;
              return;
            }
            nextStep();
          },
        }),
      ],
    });

    const page = createElement("div", {
      className: "setup-page",
      children: [
        createElement("div", {
          className: "setup-container",
          children: [
            createElement("div", {
              className: "setup-card card",
              children: [stepHeader, ...content, setupState.stepError ? createElement("div", { className: "form-error", text: setupState.stepError }) : null, footer].filter(Boolean),
            }),
          ],
        }),
      ],
    });

    const bookingModal = BookingObjectModal({
      open: setupState.bookingModalOpen,
      mode: setupState.bookingModalMode,
      form: setupState.bookingForm,
      validationErrors: setupState.bookingModalValidationErrors || {},
      validationError: setupState.bookingModalValidationError || "",
      groupValidationError: setupState.bookingModalValidationError || "",
      permissionOptions: buildPermissionOptions({
        users: setupState.users,
        accessGroups: setupState.accessGroups,
      }),
      onChange: (field, value) =>
        setSetupState({
          bookingForm: { ...setupState.bookingForm, [field]: value },
          bookingModalValidationErrors: BOOKING_MODAL_VALIDATION_RESET_FIELDS.has(field)
            ? {}
            : setupState.bookingModalValidationErrors,
          bookingModalValidationError: BOOKING_MODAL_VALIDATION_RESET_FIELDS.has(field)
            ? ""
            : setupState.bookingModalValidationError,
        }),
      onClose: () => {
        setupBookingObjectModalScrollTop = 0;
        setSetupState({
          bookingModalOpen: false,
          bookingModalValidationError: "",
          bookingModalValidationErrors: {},
        });
      },
      selectorOpenKey: setupState.selectorOpenKey,
      selectorScrollTop: setupState.bookingSelectorScrollTop || 0,
      onSelectorScroll: (value) => setSetupState({ bookingSelectorScrollTop: value }),
      onBookingModalOverlayScroll: (value) => {
        setupBookingObjectModalScrollTop = value;
      },
      onOpenSelector: (key) => {
        const scrollEl = document.querySelector(".booking-object-modal-scroll");
        setupBookingObjectModalScrollTop = scrollEl ? scrollEl.scrollTop : setupBookingObjectModalScrollTop;
        setSetupState({
          selectorOpenKey: key,
          bookingSelectorScrollTop: 0,
        });
      },
      onCloseSelector: () => setSetupState({ selectorOpenKey: null, bookingSelectorScrollTop: 0 }),
      bookingGroups: setupState.bookingGroups,
      onSelectGroup: (value) => {
        if (!value) {
          setSetupState({ bookingForm: { ...setupState.bookingForm, groupId: "" } });
          return;
        }
        const selectedGroup = (setupState.bookingGroups || []).find((group) => group.id === value);
        setSetupState({
          bookingForm: {
            ...setupState.bookingForm,
            groupId: value,
            maxBookings: selectedGroup?.maxBookings || setupState.bookingForm.maxBookings || DEFAULT_MAX_BOOKINGS,
          },
        });
      },
      onUpdateGroupMax: (value) => setSetupState({ bookingForm: { ...setupState.bookingForm, maxBookings: value } }),
      groupModalOpen: setupState.groupModalOpen,
      groupNameDraft: setupState.bookingGroupDraft,
      onGroupNameChange: (value) => setSetupState({ bookingGroupDraft: value }),
      onOpenGroupModal: () => setSetupState({ groupModalOpen: true }),
      onCloseGroupModal: () => setSetupState({ groupModalOpen: false }),
      onCreateGroup: async () => {
        if (!setupState.bookingGroupDraft?.trim()) return;
        const maxBookings = parseRequiredPositiveInt(setupState.bookingForm.maxBookings);
        if (maxBookings === null) {
          setSetupState({
            bookingModalValidationError: "",
            bookingModalValidationErrors: { maxBookings: "Max bokningar måste vara ett heltal större än 0." },
          });
          return;
        }
        await createBookingGroup({
          name: setupState.bookingGroupDraft.trim(),
          max_bookings: maxBookings,
        });
        setSetupState({ groupModalOpen: false, bookingGroupDraft: "", bookingModalValidationError: "" });
        await loadSetupLists();
      },
      onSave: async () => {
        const normalizedMaxBookings = normalizeRequiredMaxBookings(setupState.bookingForm.maxBookings);
        if (!normalizedMaxBookings) {
          setSetupState({
            bookingModalValidationError: "",
            bookingModalValidationErrors: { maxBookings: "Max bokningar måste vara ett heltal större än 0." },
          });
          return;
        }
        const formErrors = validateBookingObjectForm({
          ...setupState.bookingForm,
          maxBookings: normalizedMaxBookings,
        });
        if (Object.keys(formErrors).length > 0) {
          setSetupState({ bookingModalValidationErrors: formErrors, bookingModalValidationError: "" });
          return;
        }
        setSetupState({ bookingModalValidationError: "", bookingModalValidationErrors: {} });
        const payload = { ...setupState.bookingForm, maxBookings: normalizedMaxBookings };
        try {
          if (setupState.bookingModalMode === "edit") {
            await updateBookingObject(setupState.editBookingId, payload);
          } else {
            await createBookingObject(payload);
          }
          await loadSetupLists();
          setupBookingObjectModalScrollTop = 0;
          setSetupState({
            bookingModalOpen: false,
            bookingModalValidationError: "",
            bookingModalValidationErrors: {},
            selectorOpenKey: null,
            bookingSelectorScrollTop: 0,
          });
        } catch (error) {
          const detail = String(error?.detail || "");
          if (detail === "invalid_booking_object_name") {
            setSetupState({
              bookingModalValidationErrors: { name: "Ange ett namn för bokningsobjektet." },
              bookingModalValidationError: "",
            });
          } else if (detail === "invalid_booking_window") {
            setSetupState({
              bookingModalValidationErrors: {
                windowMax: "Minsta tid innan bokning får inte vara större än maximal framförhållning.",
              },
              bookingModalValidationError: "",
            });
          } else if (detail === "invalid_time_slot_window") {
            setSetupState({
              bookingModalValidationErrors: { slotEndTime: "Senaste tid måste vara efter tidigaste tid för tidspass." },
              bookingModalValidationError: "",
            });
          } else if (detail === "invalid_time_slot_duration") {
            setSetupState({
              bookingModalValidationErrors: { slotDuration: "Bokningslängden får inte vara längre än tidsfönstret." },
              bookingModalValidationError: "",
            });
          } else {
            setSetupState({
              bookingModalValidationError: "Kunde inte spara bokningsobjektet.",
              bookingModalValidationErrors: {},
            });
          }
        }
      },
    });

    const editUserModal = EditUserModal({
      open: setupState.editUserOpen,
      mode: setupState.editUserId ? "edit" : "create",
      form: setupState.editUserForm,
      validationErrors: setupState.editUserValidationErrors || {},
      groupOptions: setupState.accessGroups || [],
      selectorOpen: setupState.userSelectorOpen,
      addRfidOpen: setupState.userRfidModalOpen,
      onOpenAddRfid: () => setSetupState({ userRfidModalOpen: true }),
      onCloseAddRfid: () => setSetupState({ userRfidModalOpen: false, addRfidDraft: "" }),
      rfidDraft: setupState.addRfidDraft || "",
      onRfidDraftChange: (value) => setSetupState({ addRfidDraft: value }),
      onSubmitAddRfid: () => {
        const nextTag = String(setupState.addRfidDraft || "").trim();
        if (!nextTag) {
          setSetupState({ userRfidModalOpen: false, addRfidDraft: "" });
          return;
        }
        if ((setupState.editUserForm.rfidTags || []).includes(nextTag)) {
          setSetupState({ userRfidModalOpen: false, addRfidDraft: "" });
          return;
        }
        setSetupState({
          editUserForm: { ...setupState.editUserForm, rfidTags: [...(setupState.editUserForm.rfidTags || []), nextTag] },
          userRfidModalOpen: false,
          addRfidDraft: "",
        });
      },
      onOpenSelector: () => setSetupState({ userSelectorOpen: true }),
      onCloseSelector: () => setSetupState({ userSelectorOpen: false }),
      onChange: (field, value) =>
        setSetupState({
          editUserForm: { ...setupState.editUserForm, [field]: value },
          editUserValidationErrors: clearUserValidationErrorsForField(setupState.editUserValidationErrors, field),
        }),
      onClose: () =>
        setSetupState({
          editUserOpen: false,
          userSelectorOpen: false,
          userRfidModalOpen: false,
          userGroupModalOpen: false,
          addRfidDraft: "",
          accessGroupDraft: "",
          editUserValidationErrors: {},
        }),
      groupNameDraft: setupState.accessGroupDraft,
      groupModalOpen: setupState.userGroupModalOpen,
      onOpenGroupModal: () => setSetupState({ userGroupModalOpen: true, accessGroupDraft: "" }),
      onCloseGroupModal: () => setSetupState({ userGroupModalOpen: false, accessGroupDraft: "" }),
      onGroupNameChange: (value) => setSetupState({ accessGroupDraft: value }),
      onCreateGroup: async () => {
        const newGroupName = setupState.accessGroupDraft?.trim();
        if (!newGroupName) return;
        await createAccessGroup(newGroupName);
        setSetupState((prev) => ({
          accessGroupDraft: "",
          userGroupModalOpen: false,
          editUserForm: {
            ...prev.editUserForm,
            groups: toSortedUniqueStrings([...(prev.editUserForm.groups || []), newGroupName]),
          },
        }));
        await loadSetupLists();
      },
      onSave: async () => {
        const preflightErrors = validateUserForm(setupState.editUserForm);
        if (Object.keys(preflightErrors).length) {
          setSetupState({ editUserValidationErrors: preflightErrors });
          return;
        }
        try {
          if (setupState.editUserId) {
            await updateUser(setupState.editUserId, setupState.editUserForm);
          } else {
            await createUser(setupState.editUserForm);
          }
          await loadSetupLists();
          setSetupState({
            editUserOpen: false,
            userSelectorOpen: false,
            userRfidModalOpen: false,
            userGroupModalOpen: false,
            addRfidDraft: "",
            accessGroupDraft: "",
            editUserValidationErrors: {},
          });
        } catch (error) {
          setSetupState({ editUserValidationErrors: getUserSaveValidationErrors(error) });
        }
      },
      onConfirmRemoveRfidTag: (value) =>
        openSetupConfirmModal({
          title: "Ta bort RFID-tag",
          message: `Ta bort taggen "${value}"?`,
          confirmLabel: "Ta bort",
          onConfirm: async () => {
            const next = (setupState.editUserForm.rfidTags || []).filter((item) => item !== value);
            setSetupState({
              editUserForm: { ...setupState.editUserForm, rfidTags: next },
            });
          },
        }),
      onConfirmRemoveGroup: (value) =>
        openSetupConfirmModal({
          title: "Ta bort behörighetsgrupp",
          message: `Ta bort gruppen "${value}"?`,
          confirmLabel: "Ta bort",
          onConfirm: async () => {
            const next = (setupState.editUserForm.groups || []).filter((item) => item !== value);
            setSetupState({
              editUserForm: { ...setupState.editUserForm, groups: next },
            });
          },
        }),
    });

    const confirmModal = renderConfirmModal({
      state: setupState.confirmModal,
      onCancel: closeSetupConfirmModal,
      onConfirm: async () => {
        const callback = setupState.confirmModal?.onConfirm;
        closeSetupConfirmModal();
        if (callback) {
          await callback();
        }
      },
    });

    const importModal = ImportUsersModal({
      open: setupState.importOpen,
      step: setupState.importStep,
      form: {
        fileName: setupState.importFileName,
        rowCount: setupState.importRowCount || 17,
        encoding: setupState.importEncoding,
        encodingWarning: setupState.importEncodingWarning,
        apartmentRegexOpen: setupState.apartmentRegexOpen,
        houseRegexOpen: setupState.houseRegexOpen,
        houseRegex: setupState.houseRegex || "",
        apartmentRegex: setupState.apartmentRegex || "",
        groupSeparator: setupState.groupSeparator || "|",
        addNew: setupState.addNew !== false,
        updateChanged: setupState.updateChanged !== false,
        removeMissing: setupState.removeMissing === true,
        progress: setupState.importProgress || 0,
        isImporting: setupState.isImporting === true,
        houseField: setupState.houseField || "Placering",
        apartmentField: setupState.apartmentField || "Lägenhet",
        groupsField: setupState.groupsField || "Behörighetsgrupp",
        adminGroups: setupState.adminGroups || [],
        adminSelectorOpen: setupState.adminSelectorOpen || false,
        adminGroupOptions: Array.from(
          new Set([...(setupState.accessGroups || []), ...(setupState.csvGroups || [])].filter(Boolean))
        ),
        effectHouse: buildRegexEffect(setupState.houseSamples || [], setupState.houseRegex || ""),
        effectApartment: buildRegexEffect(setupState.apartmentSamples || [], setupState.apartmentRegex || ""),
        effectGroups: buildGroupEffect(setupState.groupSamples || [], setupState.groupSeparator || "|"),
      },
      mapping: {
        headers: setupState.importHeaders?.length ? setupState.importHeaders : ["OrgGrupp", "Placering", "Lägenhet"],
        identityField: setupState.identityField || setupState.importRules?.identity_field || "OrgGrupp",
        groupsField: setupState.groupsField || setupState.importRules?.groups_field || "Behörighetsgrupp",
        rfidField: setupState.rfidField || setupState.importRules?.rfid_field || "Identitetsid",
        activeField: setupState.activeField || setupState.importRules?.active_field || "Identitetsstatus (0=på 1=av)",
      },
      preview: setupState.importPreview || {
        newCount: 0,
        updatedCount: 0,
        unchangedCount: 0,
        ignoredCount: 0,
        removedCount: 0,
        rows: [],
      },
      onClose: () => setSetupState({ importOpen: false, importStep: 1 }),
      onNext: async () => {
        const next = Math.min(setupState.importStep + 1, 8);
        setSetupState({ importStep: next });
        if (next === 8 && setupState.importCsvText) {
          const rules = buildImportRules(setupState);
          const preview = await previewImport(setupState.importCsvText, rules);
          setSetupState({
            importPreview: {
              newCount: preview.summary.new,
              updatedCount: preview.summary.updated,
              unchangedCount: preview.summary.unchanged,
              ignoredCount: preview.summary.ignored || 0,
              removedCount: preview.summary.removed,
              rows: preview.rows.map((row) => ({
                identity: row.identity,
                apartmentId: row.apartment_id,
                house: row.house,
                status: row.status,
                statusClass:
                  row.status === "Ny"
                    ? "preview-new"
                    : row.status === "Uppdateras"
                      ? "preview-updated"
                      : row.status === "Ignorerad"
                        ? "preview-ignored"
                      : row.status === "Tas bort"
                        ? "preview-removed"
                        : "preview-unchanged",
                admin: row.admin,
                rfidStatus: row.rfid_status || "Oförändrad",
              })),
            },
            importHeaders: preview.headers,
          });
        }
      },
      onPrev: () => setSetupState((prev) => ({ importStep: Math.max(prev.importStep - 1, 1) })),
      onImport: async () => {
        setSetupState({ importStep: 8, importProgress: 0, isImporting: true });
        const rules = buildImportRules(setupState);
        try {
          await saveImportRules(rules);
        } catch (error) {
          // Non-blocking: import should still run even if persisting rules fails.
          console.warn("Kunde inte spara importregler, fortsätter med import.", error);
        }
        const actions = {
          add_new: setupState.addNew !== false,
          update_existing: setupState.updateChanged !== false,
          remove_missing: setupState.removeMissing === true,
        };
        let offset = 0;
        const limit = 100;
        while (true) {
          const result = await applyImport(setupState.importCsvText, rules, actions, { offset, limit });
          const processed = result?.progress?.processed || 0;
          const total = result?.progress?.total || 0;
          const done = Boolean(result?.progress?.done);
          const percent = total > 0 ? Math.min(99, Math.round((processed / total) * 100)) : 99;
          setSetupState({ importProgress: percent });
          if (done) {
            break;
          }
          offset = processed;
        }
        setSetupState({ importProgress: 100, isImporting: false, importOpen: false, importStep: 1 });
        void loadSetupLists();
      },
      onChange: (field, value) =>
        setSetupState((prev) => {
          switch (field) {
            case "fileName":
              return { importFileName: value };
            case "file":
              if (value) {
                readCsvFile(value).then(({ text, encoding, encodingWarning }) => {
                  const csvGroups = extractCsvGroups(text, prev.groupsField, prev.groupSeparator);
                  const sampleUpdate = updateImportSamples(prev, { importCsvText: text });
                  setSetupState({
                    importCsvText: text,
                    importRowCount: text.split("\n").length,
                    csvGroups,
                    ...sampleUpdate,
                    importEncoding: encoding,
                    importEncodingWarning: encodingWarning,
                  });
                  const rules = buildImportRules(setupState);
                  previewImport(text, rules).then((preview) =>
                    setSetupState({
                      importHeaders: preview.headers,
                      importPreview: {
                        newCount: preview.summary.new,
                        updatedCount: preview.summary.updated,
                        unchangedCount: preview.summary.unchanged,
                        ignoredCount: preview.summary.ignored || 0,
                        removedCount: preview.summary.removed,
                        rows: preview.rows.map((row) => ({
                          identity: row.identity,
                          apartmentId: row.apartment_id,
                          house: row.house,
                          status: row.status,
                          statusClass:
                            row.status === "Ny"
                              ? "preview-new"
                              : row.status === "Uppdateras"
                                ? "preview-updated"
                                : row.status === "Ignorerad"
                                  ? "preview-ignored"
                                : row.status === "Tas bort"
                                  ? "preview-removed"
                                  : "preview-unchanged",
                          admin: row.admin,
                          rfidStatus: row.rfid_status || "Oförändrad",
                        })),
                      },
                    })
                  );
                });
              }
              return {};
            case "groupsField": {
              const csvGroups = extractCsvGroups(prev.importCsvText, value, prev.groupSeparator);
              return { groupsField: value, csvGroups, ...updateImportSamples(prev, { groupsField: value }) };
            }
            case "groupSeparator": {
              const csvGroups = extractCsvGroups(prev.importCsvText, prev.groupsField, value);
              return { groupSeparator: value, csvGroups, ...updateImportSamples(prev, { groupSeparator: value }) };
            }
            case "houseField":
              return { houseField: value, ...updateImportSamples(prev, { houseField: value }) };
            case "apartmentField":
              return { apartmentField: value, ...updateImportSamples(prev, { apartmentField: value }) };
            case "importFocus":
            case "importFocusStart":
            case "importFocusEnd":
            case "apartmentRegexOpen":
            case "houseRegexOpen":
            case "houseRegex":
            case "apartmentRegex":
            case "addNew":
            case "updateChanged":
            case "removeMissing":
            case "adminGroups":
            case "adminSelectorOpen":
            case "adminSelectorScrollTop":
            case "identityField":
            case "rfidField":
            case "activeField":
              return { [field]: value };
            default:
              return prev;
          }
        }),
    });

    app.append(page);
    if (bookingModal) app.append(bookingModal);
    if (editUserModal) app.append(editUserModal);
    if (confirmModal) app.append(confirmModal);
    if (importModal) app.append(importModal);

    if (setupState.bookingModalOpen) {
      const bookingScroll = app.querySelector(".booking-object-modal-scroll");
      if (bookingScroll) {
        bookingScroll.scrollTop = setupBookingObjectModalScrollTop || 0;
      }
    }

    if (
      setupEditUserFocusSnapshot &&
      !setupState.userRfidModalOpen &&
      !setupState.userGroupModalOpen &&
      !setupState.userSelectorOpen &&
      !setupState.importOpen
    ) {
      const target = app.querySelector(`[data-focus-key="${setupEditUserFocusSnapshot.key}"]`);
      if (target) {
        target.focus();
        if (
          typeof setupEditUserFocusSnapshot.start === "number" &&
          typeof setupEditUserFocusSnapshot.end === "number" &&
          typeof target.setSelectionRange === "function"
        ) {
          target.setSelectionRange(setupEditUserFocusSnapshot.start, setupEditUserFocusSnapshot.end);
        }
      }
    }

    if (setupState.importOpen && setupState.importFocus) {
      const input = app.querySelector(`[data-autofocus="${setupState.importFocus}"]`);
      if (input) {
        input.focus();
        const start =
          typeof setupState.importFocusStart === "number" ? setupState.importFocusStart : input.value.length;
        const end =
          typeof setupState.importFocusEnd === "number" ? setupState.importFocusEnd : input.value.length;
        input.setSelectionRange?.(start, end);
      }
    }

    if (setupState.userRfidModalOpen) {
      const input = app.querySelector('[data-autofocus="edit-user-rfid"]');
      if (input) {
        input.focus();
        input.setSelectionRange?.(input.value.length, input.value.length);
      }
    }

    if (setupState.userGroupModalOpen) {
      const input = app.querySelector('[data-autofocus="edit-user-group"]');
      if (input) {
        input.focus();
        input.setSelectionRange?.(input.value.length, input.value.length);
      }
    }

    if (setupState.importOpen && setupState.adminSelectorOpen) {
      const list = app.querySelector(".import-modal .selector-list");
      if (list) {
        list.scrollTop = setupState.adminSelectorScrollTop || 0;
      }
    }

    if (setupState.bookingModalOpen && setupState.selectorOpenKey) {
      const list = app.querySelector(".booking-object-modal + .modal-overlay .selector-list");
      if (list) {
        list.scrollTop = setupState.bookingSelectorScrollTop || 0;
      }
    }

    if (setupState.editUserOpen) {
      const editUserScroll = app.querySelector(".edit-user-modal-scroll");
      if (editUserScroll) {
        editUserScroll.scrollTop = savedSetupEditUserModalScrollTop;
      }
    }

    window.scrollTo(docScrollX, docScrollY);
  };

  renderSetup();
  loadSetupData();
} else {
  let turnstileSiteKey = "";
  const createBrfState = {
    open: false,
    step: 1,
    name: "",
    email: "",
    errors: {},
    isSubmitting: false,
    submitError: "",
    setupUrl: "",
    turnstileSiteKey,
    turnstileContainerId: "create-brf-turnstile",
    turnstileToken: "",
    turnstileWidgetId: null,
    turnstileError: "",
    turnstilePaused: false,
  };

  const setCreateBrfState = (next) => {
    const update = typeof next === "function" ? next({ ...createBrfState }) : next;
    Object.assign(createBrfState, update);
    renderLanding();
  };

  const updateCreateBrfField = (field, value) => {
    const hadFieldError = Boolean(createBrfState.errors?.[field]);
    createBrfState[field] = value;
    if (hadFieldError) {
      const nextErrors = { ...createBrfState.errors };
      delete nextErrors[field];
      createBrfState.errors = nextErrors;
      renderLanding();
    }
  };

  const openCreateBrf = () =>
    setCreateBrfState({
      open: true,
      step: 1,
      submitError: "",
      turnstileSiteKey,
      turnstileToken: "",
      turnstileWidgetId: null,
      turnstileError: "",
      turnstilePaused: false,
    });
  const closeCreateBrf = () =>
    setCreateBrfState({
      open: false,
      step: 1,
      name: "",
      email: "",
      errors: {},
      submitError: "",
      setupUrl: "",
      isSubmitting: false,
      turnstileToken: "",
      turnstileWidgetId: null,
      turnstileError: "",
      turnstilePaused: false,
    });
  const nextCreateBrf = () => {
    if ((createBrfState.step || 1) === 1 && !createBrfState.name?.trim()) {
      setCreateBrfState((prev) => ({
        errors: {
          ...(prev.errors || {}),
          name: "Ange föreningens namn.",
        },
      }));
      return;
    }
    setCreateBrfState((prev) => ({ step: Math.min((prev.step || 1) + 1, 3) }));
  };
  const prevCreateBrf = () =>
    setCreateBrfState((prev) => ({ step: Math.max((prev.step || 1) - 1, 1) }));
  const submitCreateBrf = async () => {
    if (createBrfState.isSubmitting) {
      return;
    }
    const errors = {};
    if (!createBrfState.name?.trim()) {
      errors.name = "Ange föreningens namn.";
    }
    if (!createBrfState.email?.trim()) {
      errors.email = "Ange en e-postadress.";
    }
    if (!createBrfState.turnstileToken) {
      errors.turnstile = "Verifiera att du är människa i steg 1.";
    }
    if (Object.keys(errors).length) {
      setCreateBrfState({ errors, submitError: "" });
      return;
    }
    setCreateBrfState({ errors: {}, submitError: "", isSubmitting: true });
    try {
      const response = await registerBrf(
        createBrfState.name.trim(),
        createBrfState.email.trim(),
        createBrfState.turnstileToken
      );
      setCreateBrfState({
        isSubmitting: false,
        setupUrl: response?.setup_url || "",
      });
      nextCreateBrf();
    } catch (error) {
      const message = error?.detail || "Kunde inte skicka mail. Försök igen.";
      setCreateBrfState({
        isSubmitting: false,
        submitError: message,
        turnstileToken: "",
      });
      if (createBrfState.turnstileWidgetId !== null && window.turnstile?.remove) {
        window.turnstile.remove(createBrfState.turnstileWidgetId);
        createBrfState.turnstileWidgetId = null;
      }
    }
  };
  const finishCreateBrf = () => closeCreateBrf();

  const defaultDemoLinks = {
    adminUserPath: "",
    accountOwnerPath: "",
    userPaths: [],
  };
  const landingState = {
    demoLinks: {
      ...defaultDemoLinks,
    },
  };
  const sectionDivider = () =>
    createElement("div", {
      className: "landing-container",
      children: [createElement("hr", { className: "landing-section-divider", attrs: { "aria-hidden": "true" } })],
    });

  const createLandingButton = (text, href, variant = "secondary", onClick) =>
    createElement(onClick ? "button" : "a", {
      className: `landing-button landing-button-${variant}`,
      text,
      attrs: onClick ? { type: "button" } : { href },
      onClick,
    });

  const initLanding = async () => {
    const [demoLinksResult, publicConfigResult] = await Promise.allSettled([
      getDemoLinks(),
      getPublicConfig(),
    ]);

    if (publicConfigResult.status === "fulfilled") {
      turnstileSiteKey = String(publicConfigResult.value?.turnstile_site_key || "").trim();
      createBrfState.turnstileSiteKey = turnstileSiteKey;
    } else {
      turnstileSiteKey = "";
      createBrfState.turnstileSiteKey = "";
    }

    if (demoLinksResult.status === "fulfilled") {
      const adminUserPath =
        typeof demoLinksResult.value?.links?.admin_user?.path === "string"
          ? demoLinksResult.value.links.admin_user.path
          : "";
      const accountOwnerPath =
        typeof demoLinksResult.value?.links?.account_owner?.path === "string"
          ? demoLinksResult.value.links.account_owner.path
          : "";
      const userPaths = Array.isArray(demoLinksResult.value?.links?.users)
        ? demoLinksResult.value.links.users
            .map((link) => link?.path)
            .filter((pathValue) => typeof pathValue === "string")
            .slice(0, 2)
        : [];
      landingState.demoLinks = {
        adminUserPath,
        accountOwnerPath,
        userPaths,
      };
    } else {
      landingState.demoLinks = {
        ...defaultDemoLinks,
      };
    }

    renderLanding();
  };

  const renderLanding = () => {
    const activeElement = createBrfState.open ? document.activeElement : null;
    const createBrfFocusSnapshot =
      activeElement && activeElement.getAttribute?.("data-focus-key")
        ? {
            key: activeElement.getAttribute("data-focus-key"),
            start:
              typeof activeElement.selectionStart === "number"
                ? activeElement.selectionStart
                : null,
            end:
              typeof activeElement.selectionEnd === "number"
                ? activeElement.selectionEnd
                : null,
          }
        : null;
    clearElement(app);
    const userOnePath = landingState.demoLinks.userPaths[0] || "";
    const userTwoPath = landingState.demoLinks.userPaths[1] || "";
    const adminUserPath = landingState.demoLinks.adminUserPath || "";
    const accountOwnerPath = landingState.demoLinks.accountOwnerPath || "";
    const userOneDemoUrl = userOnePath ? `${window.location.origin}${userOnePath}` : "";
    const userOneDemoQrImageUrl = userOneDemoUrl ? buildQrImageUrl(userOneDemoUrl, 320) : "";
    const demoCards = [];
    if (userOnePath) {
      demoCards.push(
        createElement("article", {
          className: "landing-demo-card",
          children: [
            createElement("h3", { className: "landing-card-title", text: "Boende - användare 1" }),
            createElement("p", {
              className: "landing-card-text",
              text: "Se hur en boende bokar tvättstuga eller lokal.",
            }),
            createLandingButton("Logga in som användare 1", userOnePath, "secondary"),
          ],
        })
      );
    }
    if (userTwoPath) {
      demoCards.push(
        createElement("article", {
          className: "landing-demo-card",
          children: [
            createElement("h3", { className: "landing-card-title", text: "Boende - användare 2" }),
            createElement("p", {
              className: "landing-card-text",
              text: "Testa flera användare och se bokningar i praktiken.",
            }),
            createLandingButton("Logga in som användare 2", userTwoPath, "secondary"),
          ],
        })
      );
    }
    if (adminUserPath) {
      demoCards.push(
        createElement("article", {
          className: "landing-demo-card",
          children: [
            createElement("h3", { className: "landing-card-title", text: "Administratör" }),
            createElement("p", {
              className: "landing-card-text",
              text: "En styrelsemedlem eller annan administratör kan boka åt andra eller blockera dagar och tider.",
            }),
            createLandingButton("Logga in som Administratör", adminUserPath, "secondary"),
          ],
        })
      );
    }
    if (accountOwnerPath) {
      demoCards.push(
        createElement("article", {
          className: "landing-demo-card",
          children: [
            createElement("h3", { className: "landing-card-title", text: "Kontoägare" }),
            createElement("p", {
              className: "landing-card-text",
              text: "Kontoägaren lägger till eller tar bort användare och bokningsobjekt.",
            }),
            createLandingButton("Logga in som Kontoägare", accountOwnerPath, "secondary"),
          ],
        })
      );
    }
    const landing = createElement("div", {
      className: "landing-page",
      children: [
      createElement("div", {
        className: "landing-top-banner",
        children: [
          createElement("div", {
            className: "landing-container landing-banner-inner",
            children: [
              createElement("span", { className: "landing-banner-icon", text: "⌁" }),
              createElement("div", {
                className: "landing-banner-copy",
                children: [
                  createElement("div", {
                    className: "landing-banner-title",
                    text: "Är du boende? Bokning sker via din personliga QR-kod.",
                  }),
                  createElement("div", {
                    className: "landing-banner-note",
                    text: "QR-koden får du från styrelsen eller via bokningstavlan.",
                  }),
                ],
              }),
            ],
          }),
        ],
      }),

      createElement("section", {
        className: "landing-hero",
        children: [
          createElement("div", {
            className: "landing-container landing-hero-copy",
            children: [
              createElement("h1", {
                className: "landing-title",
                text: "Gratis bokningssystem för BRF - klart på 2 minuter",
              }),
              createElement("p", {
                className: "landing-subtitle",
                text:
                  "Open source. Ingen bindningstid. Fungerar på mobil, dator eller bokningsskärm i trapphuset.",
              }),
              createElement("div", {
                className: "landing-actions",
                children: [
                  createLandingButton("Skapa er bokningssida", null, "primary", openCreateBrf),
                  createLandingButton("Testa demo direkt", "#demo", "secondary"),
                ],
              }),
              createElement("div", {
                className: "landing-inline-note",
                text: "",
              }),
            ],
          }),
        ],
      }),
      createElement("section", {
        className: "landing-section",
        attrs: { id: "demo" },
        children: [
          createElement("div", {
            className: "landing-container",
            children: [
              createElement("h2", { className: "landing-section-title", text: "Testa systemet direkt" }),
              createElement("p", {
                className: "landing-section-subtitle",
                text: "Utforska bokningssystemet som boende eller administratör - utan att skapa konto. Klicka på de olika profilerna nedan för att se hur det ser ut.",
              }),
              createElement("div", {
                className: "landing-demo-grid",
                children: demoCards,
              }),
              createElement("div", {
                className: "landing-inline-note",
                text: "",
              }),
            ],
          }),
        ],
      }),
      sectionDivider(),
      createElement("section", {
        className: "landing-section",
        children: [
          createElement("div", {
            className: "landing-container landing-screen-layout",
            children: [
              createElement("div", {
                className: "landing-screen-copy",
                children: [
                  createElement("h2", {
                    className: "landing-section-title",
                    text: "Bokningsskärm med touch till tvättstugan",
                  }),
                  createElement("p", {
                    className: "landing-section-subtitle",
                    text:
                      "Installera en surfplatta med extern RFID-läsare vid tvättstugan - eller köp vår touchskärm med inbyggd RFID.",
                  }),
                  createElement("ul", {
                    className: "landing-list",
                    children: [
                      createElement("li", { text: "Stor 18\" skärm" }),
                      createElement("li", { text: "Både MiFare och RFID/EM" }),
                      createElement("li", { text: "Power over Ethernet eller separat strömsladd" }),
                      createElement("li", { text: "WiFi, ethernet eller 4G" }),
                      createElement("li", { text: "Från 6,000:- inklusive moms med väggfäste" }),
                    ],
                  }),
                  createElement("div", {
                    className: "landing-inline-note",
                    text: "",
                  }),
                ],
              }),
              createElement("div", {
                className: "landing-photo-placeholder",
                children: [
                  createElement("div", {
                    className: "landing-photo-placeholder-copy",
                    children: [
                      createElement("img", {
                        className: "landing-qr-image",
                        attrs: {
                          src: landingScreenUrl,
                          alt: "Digital bokningstavla",
                          loading: "lazy",
                        },
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
      sectionDivider(),
      createElement("section", {
        className: "landing-section",
        children: [
          createElement("div", {
            className: "landing-container",
            children: [
              createElement("h2", { className: "landing-section-title", text: "Funktioner" }),
              createElement("div", {
                className: "landing-features-grid",
                children: [
                  createElement("div", { className: "landing-feature", text: "Bokningskalender" }),
                  createElement("div", { className: "landing-feature", text: "Heldagsbokningar, eller timpass" }),
                  createElement("div", { className: "landing-feature", text: "Webbaserat - för mobil eller dator" }),
                  createElement("div", { className: "landing-feature", text: "Snabb uppstart utan teknisk kunskap" }),
                  createElement("div", { className: "landing-feature", text: "Webbtjänsten tillgänglig under AGPL (öppen och fri källkod)" }),
                ],
              }),
            ],
          }),
        ],
      }),
      sectionDivider(),
      createElement("section", {
        className: "landing-section",
        children: [
          createElement("div", {
            className: "landing-container landing-screen-layout",
            children: [
              createElement("div", {
                className: "landing-screen-copy",
                children: [
                  createElement("h2", {
                    className: "landing-section-title",
                    text: "Minimal administration",
                  }),
                  createElement("p", {
                    className: "landing-section-subtitle",
                    text:
                      "Boende loggar in med hjälp av en unik QR-kod. Denna distribueras antingen manuellt till alla boende - eller om man använder en digital bokningstavla så kan varje boende själv administrera sitt konto genom att logga in med sin RFID-tagg.",
                  }),
                  createElement("div", {
                    className: "landing-inline-note",
                    text: "QR-koden intill är till ett demo-konto",
                  }),
                ],
              }),
              createElement("div", {
                className: "landing-photo-placeholder",
                children: [
                  createElement("div", {
                    className: "landing-photo-placeholder-copy",
                    children: [
                      createElement("img", {
                        className: "landing-qr-image",
                        attrs: {
                          src: userOneDemoQrImageUrl,
                          alt: "QR-kod till demo-användare 1",
                          loading: "lazy",
                        },
                      }),
                    ],
                  }),
                ]
              }),
            ],
          }),
        ],
      }),
      sectionDivider(),
      createElement("section", {
        className: "landing-section",
        attrs: { id: "kom-igang" },
        children: [
          createElement("div", {
            className: "landing-container",
            children: [
              createElement("div", {
                className: "landing-final-cta",
                children: [
                  createElement("h2", { className: "landing-section-title", text: "Kom igång på 2 minuter" }),
                  createElement("p", {
                    className: "landing-section-subtitle",
                    text: "Skapa er bokningssida och börja boka direkt",
                  }),
                  createElement("div", {
                    className: "landing-actions landing-actions-center",
                    children: [
                      createLandingButton("Skapa er bokningssida", null, "primary", openCreateBrf),
                      createLandingButton("Testa demo direkt", "#demo", "secondary"),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
      ],
    });
    app.append(landing);

    const modal = CreateBrfModal({
      open: createBrfState.open,
      step: createBrfState.step,
      form: createBrfState,
      onClose: closeCreateBrf,
      onNext: nextCreateBrf,
      onPrev: prevCreateBrf,
      onSubmit: submitCreateBrf,
      onFinish: finishCreateBrf,
      onChange: updateCreateBrfField,
    });
    if (modal) {
      app.append(modal);
    }
    if (createBrfFocusSnapshot && createBrfState.open) {
      const target = app.querySelector(`[data-focus-key="${createBrfFocusSnapshot.key}"]`);
      if (target) {
        target.focus();
        if (
          typeof createBrfFocusSnapshot.start === "number" &&
          typeof createBrfFocusSnapshot.end === "number" &&
          typeof target.setSelectionRange === "function"
        ) {
          target.setSelectionRange(createBrfFocusSnapshot.start, createBrfFocusSnapshot.end);
        }
      }
    }

    if (
      createBrfState.open &&
      createBrfState.step === 1 &&
      createBrfState.turnstileSiteKey &&
      !createBrfState.turnstilePaused
    ) {
      const target = document.getElementById(createBrfState.turnstileContainerId);
      if (target && target.childElementCount === 0) {
        ensureTurnstileScript()
          .then((turnstile) => {
            if (!turnstile || !document.getElementById(createBrfState.turnstileContainerId)) {
              return;
            }
            if (createBrfState.turnstileWidgetId !== null && turnstile.remove) {
              turnstile.remove(createBrfState.turnstileWidgetId);
            }
            const widgetId = turnstile.render(`#${createBrfState.turnstileContainerId}`, {
              sitekey: createBrfState.turnstileSiteKey,
              callback: (token) => {
                createBrfState.turnstileToken = token;
                createBrfState.turnstileError = "";
                if (createBrfState.errors?.turnstile) {
                  const nextErrors = { ...createBrfState.errors };
                  delete nextErrors.turnstile;
                  createBrfState.errors = nextErrors;
                }
              },
              "expired-callback": () => {
                setCreateBrfState({
                  turnstileToken: "",
                  turnstileError: "Verifieringen har gått ut. Försök igen.",
                  turnstilePaused: true,
                });
              },
              "error-callback": (errorCode) => {
                const normalizedCode = String(errorCode || "").trim();
                const message =
                  normalizedCode === "110200"
                    ? "Turnstile-domain ej tillåten. Lägg till aktuell Pages-domän i Turnstile-widgetens hostnames."
                    : "Turnstile kunde inte laddas. Ladda om sidan.";
                setCreateBrfState({ turnstileToken: "", turnstileError: message, turnstilePaused: true });
              },
            });
            createBrfState.turnstileWidgetId = widgetId;
          })
          .catch(() => {
            setCreateBrfState({ turnstileError: "Turnstile-script kunde inte laddas.", turnstilePaused: true });
          });
      }
    }
  };

  renderLanding();
  void initLanding();
}
