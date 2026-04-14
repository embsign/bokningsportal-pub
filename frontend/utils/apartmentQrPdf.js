// Copyright (C) 2026 embsign AB
// SPDX-License-Identifier: AGPL-3.0-only

const sanitizeFileSlug = (value, fallback) => {
  const slug = String(value ?? "")
    .trim()
    .replace(/[^\w\-]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return slug || fallback;
};

/**
 * Skapar en PDF med en rad per lägenhet: ID, hus/trapp (om satt), QR för bokningsinloggning.
 * Laddar jsPDF och qrcode via esm.sh först vid anrop (ingen build-steg).
 * Med `filenameStem` blir filnamnet `{stem}.pdf` (sanerat); annars `bokningslankar-{förening}.pdf`.
 */
export const downloadApartmentLoginQrPdf = async ({ tenantName, rows, filenameStem }) => {
  if (!rows?.length) {
    return { ok: false, error: "empty" };
  }

  const { jsPDF } = await import("https://esm.sh/jspdf@2.5.2");
  const QRCode = (await import("https://esm.sh/qrcode@1.5.3")).default;

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const qrMm = 22;
  const textMaxW = pageW - margin * 2 - qrMm - 6;
  let y = margin;

  const qrHelpText =
    "QR-koden öppnar er personliga bokningslänk och fungerar som ert lösenord för att logga in och boka – förvara utskriften och dela den inte i onödan. " +
    "Ni kan själva, eller med hjälp av Administratören, när som helst skapa en ny QR-kod i bokningsportalen; gör ni det slutar den gamla koden och tidigare länkar att fungera.";

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  const title = `Bokningslänkar – ${tenantName || "BRF"}`;
  doc.text(title, margin, y);
  y += 9;

  doc.setFont("helvetica", "normal");

  const lineH11 = 5;
  const lineH10 = 4.5;
  const lineH8 = 3.5;
  const padTop = 6;
  const gapAfterHouse = 2;
  const padBottom = 6;

  for (const row of rows) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    const idChunks = doc.splitTextToSize(`Lägenhets-ID: ${row.apartment_id}`, textMaxW);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const houseLine = row.house ? `Hus / trappuppgång: ${row.house}` : "Hus / trappuppgång: —";
    const houseChunks = row.house ? doc.splitTextToSize(houseLine, textMaxW) : ["Hus / trappuppgång: —"];
    doc.setFontSize(8);
    const helpChunks = doc.splitTextToSize(qrHelpText, textMaxW);
    doc.setFontSize(11);

    const houseBlockH = row.house ? houseChunks.length * lineH10 : lineH10;
    const leftColH =
      padTop +
      idChunks.length * lineH11 +
      houseBlockH +
      gapAfterHouse +
      helpChunks.length * lineH8 +
      padBottom;
    const rowHCalc = Math.max(leftColH, qrMm + padTop) + 4;

    if (y + rowHCalc > pageH - margin) {
      doc.addPage();
      y = margin;
    }

    const rowTop = y;
    let ty = rowTop + padTop;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(idChunks, margin, ty);
    ty += idChunks.length * lineH11;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    if (row.house) {
      doc.text(houseChunks, margin, ty);
      ty += houseChunks.length * lineH10;
    } else {
      doc.setTextColor(100, 100, 100);
      doc.text(houseChunks[0], margin, ty);
      doc.setTextColor(0, 0, 0);
      ty += lineH10;
    }

    ty += gapAfterHouse;
    doc.setFontSize(8);
    doc.setTextColor(62, 62, 62);
    doc.text(helpChunks, margin, ty);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);

    const dataUrl = await QRCode.toDataURL(row.login_url, {
      width: 200,
      margin: 1,
      errorCorrectionLevel: "M",
    });
    doc.addImage(dataUrl, "PNG", pageW - margin - qrMm, rowTop, qrMm, qrMm);

    y = rowTop + rowHCalc;
  }

  const downloadName =
    filenameStem !== undefined
      ? `${sanitizeFileSlug(filenameStem, "lagenhet")}.pdf`
      : `bokningslankar-${sanitizeFileSlug(tenantName || "lagenheter", "lagenheter")}.pdf`;
  doc.save(downloadName);
  return { ok: true };
};
