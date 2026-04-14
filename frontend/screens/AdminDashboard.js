// Copyright (C) 2026 embsign AB
// SPDX-License-Identifier: AGPL-3.0-only

import { createElement } from "../hooks/dom.js";
import { BookingObjectsTable } from "../components/BookingObjectsTable.js";
import { BookingScreensSection } from "../components/BookingScreensSection.js";
import { UserList } from "../components/UserList.js";

const sectionCard = ({ title, description, actions, content }) =>
  createElement("div", {
    className: "admin-section card",
    children: [
      createElement("div", {
        className: "admin-section-header",
        children: [
          createElement("div", {
            children: [
              createElement("div", { className: "admin-section-title", text: title }),
              description
                ? createElement("div", { className: "admin-section-desc", text: description })
                : null,
            ].filter(Boolean),
          }),
          createElement("div", {
            className: "admin-section-actions",
            children: actions,
          }),
        ],
      }),
      content || null,
    ].filter(Boolean),
  });

export const AdminDashboard = ({
  adminUser,
  users,
  userQuery,
  userListError,
  bookingObjects,
  bookingScreens,
  onAdd,
  onCopy,
  onEdit,
  onAddUser,
  onImportUsers,
  onDownloadAllQrPdf,
  allQrPdfLoading,
  onEditUser,
  onDeleteUser,
  onUserQueryChange,
  onCreateReport,
  onOpenOrderScreens,
  onOpenPairScreen,
  onCloseOrderScreens,
  onConfirmOrderScreens,
  onClosePairScreen,
  onConfirmPairScreen,
  onPairCodeInput,
  onPairNameInput,
  onEditScreen,
  onDeleteScreen,
  onCloseEditScreen,
  onConfirmEditScreen,
  onEditScreenNameInput,
  orderScreensModalOpen,
  pairScreenModalOpen,
  editScreenModalOpen,
  pairScreenCode,
  pairScreenName,
  editScreenName,
  modal,
  importModal,
  editUserModal,
  reportModal,
  confirmModal,
}) => {
  const userSection = sectionCard({
    title: "Lägenheter",
    description: "Hantera lägenheter och behörigheter.",
    actions: [
      createElement("button", {
        className: "secondary-button admin-btn-add",
        text: "Lägg till",
        onClick: onAddUser,
      }),
      createElement("button", {
        className: "secondary-button admin-btn-add",
        text: "Importera",
        onClick: onImportUsers,
      }),
      createElement("button", {
        className: "secondary-button admin-btn-add",
        text: allQrPdfLoading ? "Laddar PDF…" : "Alla QR-koder (PDF)",
        attrs: { disabled: allQrPdfLoading ? "disabled" : null },
        onClick: onDownloadAllQrPdf,
      }),
    ],
    content: createElement("div", {
      className: "admin-section-content",
      children: [
        userListError ? createElement("div", { className: "form-error", text: userListError }) : null,
        UserList({
          users: users || [],
          query: userQuery || "",
          onQueryChange: onUserQueryChange,
          onPrimaryAction: onEditUser,
          primaryLabel: "Redigera",
          onDelete: onDeleteUser,
          emptyText: "Inga användare ännu.",
        }),
      ].filter(Boolean),
    }),
  });

  const bookingTable = BookingObjectsTable({
    bookingObjects,
    onEdit,
    onCopy,
  });

  const bookingSection = sectionCard({
    title: "Bokningsobjekt",
    description: "Skapa och hantera resurser som kan bokas.",
    actions: [
      createElement("button", {
        className: "secondary-button admin-btn-add",
        text: "Lägg till",
        onClick: () => onAdd(),
      }),
    ],
    content: bookingTable,
  });

  const reportsSection = sectionCard({
    title: "Debiteringsunderlag / Rapporter",
    description: "Export och sammanställningar för debitering.",
    actions: [
      createElement("button", {
        className: "secondary-button admin-btn-add",
        text: "Skapa rapport",
        onClick: onCreateReport,
      }),
    ],
  });

  const bookingScreensSection = BookingScreensSection({
    bookingScreens,
    orderModalOpen: orderScreensModalOpen,
    pairModalOpen: pairScreenModalOpen,
    editModalOpen: editScreenModalOpen,
    pairingCode: pairScreenCode,
    pairName: pairScreenName,
    editName: editScreenName,
    onOpenOrder: onOpenOrderScreens,
    onOpenPair: onOpenPairScreen,
    onCloseOrder: onCloseOrderScreens,
    onConfirmOrder: onConfirmOrderScreens,
    onClosePair: onClosePairScreen,
    onConfirmPair: onConfirmPairScreen,
    onPairCodeInput: onPairCodeInput,
    onPairNameInput: onPairNameInput,
    onEdit: onEditScreen,
    onDelete: onDeleteScreen,
    onCloseEdit: onCloseEditScreen,
    onConfirmEdit: onConfirmEditScreen,
    onEditNameInput: onEditScreenNameInput,
  });

  return createElement("section", {
    className: "admin-dashboard",
    children: [
      createElement("div", {
        className: "admin-welcome",
        children: [
          createElement("div", { className: "screen-title", text: "Admin Dashboard" }),
          createElement("div", {
            className: "screen-subtitle",
            text: `${adminUser.association} • ${adminUser.name}`,
          }),
        ],
      }),
      createElement("div", {
        className: "admin-grid",
        children: [userSection, bookingSection, bookingScreensSection, reportsSection],
      }),
      modal,
      importModal,
      editUserModal,
      reportModal,
      confirmModal,
    ],
  });
};
