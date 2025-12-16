/**
 * PDF Generation Module
 * Handles PDF document creation and rendering
 */

export function createPdfDocument(state) {
  const factory = window.jspdf?.jsPDF;
  if (!factory) {
    throw new Error("PDF-Engine wird noch geladen. Bitte versuche es erneut.");
  }
  
  if (!state.meta || !state.columns.length) {
    throw new Error("Generiere Falzdaten, bevor du sie als PDF exportierst.");
  }

  const { widthPx, heightPx, bookHeightMm } = state.meta;
  if (!bookHeightMm) {
    throw new Error("Die Buchhöhe muss größer als null sein, um Falze zu skalieren.");
  }

  const timestamp = new Date().toLocaleString();

  // Use landscape when the book height can be rendered 1:1 within the available
  // vertical track area on an A4 landscape page.
  // A4 landscape height is 210mm; with marginY=10 and headerHeight=18 we get 172mm.
  const marginY = 10;
  const headerHeight = 18;
  const trackTop = marginY + headerHeight;
  const a4LandscapeHeightMm = 210;
  const landscapeMaxTrackHeightMm = a4LandscapeHeightMm - marginY - trackTop;
  const orientation = bookHeightMm <= landscapeMaxTrackHeightMm ? "landscape" : "portrait";

  const doc = new factory({ unit: "mm", format: "a4", orientation });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const printableColumns = explodeColumns(state.columns);
  
  const layout = createPdfLayout({
    pageWidth,
    pageHeight,
    bookHeightMm,
    widthPx,
    heightPx,
    timestamp,
  });

  renderPdfPages(doc, printableColumns, layout);

  return doc;
}

function createPdfLayout(params) {
  const { pageWidth, pageHeight, bookHeightMm, widthPx, heightPx, timestamp } = params;
  
  const layout = {
    marginX: 10,
    marginY: 10,
    headerHeight: 18,
    axisWidth: 12,
    columnWidth: 4.5,
    columnGap: 1.8,
    pageWidth,
    pageHeight,
    bookHeightMm,
    widthPx,
    heightPx,
    timestamp,
  };
  
  layout.trackTop = layout.marginY + layout.headerHeight;
  const maxTrackBottom = pageHeight - layout.marginY;
  const maxTrackHeight = maxTrackBottom - layout.trackTop;

  // True-scale when possible: 1mm in the book equals 1mm on paper.
  // If the requested book height doesn't fit on the page, fall back to fit-to-page scaling.
  if (bookHeightMm <= maxTrackHeight) {
    layout.scale = 1;
    layout.trackHeight = bookHeightMm;
    layout.trackBottom = layout.trackTop + layout.trackHeight;
  } else {
    layout.trackBottom = maxTrackBottom;
    layout.trackHeight = maxTrackHeight;
    layout.scale = layout.trackHeight / layout.bookHeightMm;
  }
  layout.axisX = layout.marginX;
  
  const availableWidth = pageWidth - layout.marginX * 2 - layout.axisWidth;
  layout.columnsPerPage = Math.max(
    1,
    Math.floor((availableWidth + layout.columnGap) / (layout.columnWidth + layout.columnGap))
  );
  
  return layout;
}

function renderPdfPages(doc, printableColumns, layout) {
  if (!printableColumns.length) {
    doc.text("Keine Falze erkannt", layout.marginX, layout.trackTop + 10);
    return;
  }

  startPdfPage(doc, layout, 1);
  let pageNumber = 1;
  let columnOnPage = 0;
  
  printableColumns.forEach((column) => {
    if (columnOnPage === layout.columnsPerPage) {
      doc.addPage();
      pageNumber += 1;
      startPdfPage(doc, layout, pageNumber);
      columnOnPage = 0;
    }
    drawCompactColumn(doc, column, layout, columnOnPage);
    columnOnPage += 1;
  });
}

function startPdfPage(doc, layout, pageNumber) {
  const {
    marginX,
    marginY,
    axisWidth,
    trackTop,
    trackBottom,
    trackHeight,
    pageWidth,
    timestamp,
    widthPx,
    heightPx,
    bookHeightMm,
  } = layout;

  // Header
  doc.setFont("helvetica", "normal");
  doc.setFontSize(14);
  doc.text("Buchfaltstudio", marginX, marginY + 4);
  doc.setFontSize(8);
  doc.text(`Generiert am ${timestamp}`, marginX, marginY + 10);
  doc.text(
    `Artwork ${widthPx}×${heightPx} px abgebildet auf ${bookHeightMm} mm Buchhöhe`,
    marginX,
    marginY + 15
  );
  doc.text(`Seite ${pageNumber}`, pageWidth - marginX - 18, marginY + 4);
  
  // Vertical axis
  const axisCenterX = marginX + axisWidth / 2;
  doc.setDrawColor(60);
  doc.setLineWidth(0.3);
  doc.line(axisCenterX, trackTop, axisCenterX, trackBottom);
  doc.line(axisCenterX - 3, trackTop, axisCenterX + 3, trackTop);
  doc.line(axisCenterX - 3, trackBottom, axisCenterX + 3, trackBottom);
  
  doc.setFontSize(7);
  doc.text("Top (0 mm)", marginX, trackTop - 2);
  doc.text(`${bookHeightMm} mm`, marginX, trackBottom + 4);

  // Horizontal guides (every 10%)
  doc.setDrawColor(210);
  doc.setLineWidth(0.1);
  for (let step = 1; step < 10; step += 1) {
    const y = trackTop + (trackHeight * step) / 10;
    doc.line(marginX, y, pageWidth - marginX, y);
  }
  doc.setLineWidth(0.3);
  doc.setDrawColor(60);
}

function drawCompactColumn(doc, columnEntry, layout, positionIndex) {
  const { axisWidth, marginX, columnWidth, columnGap, trackTop, trackHeight, scale } = layout;

  const xStart = marginX + axisWidth + columnGap + positionIndex * (columnWidth + columnGap);
  
  // Column outline
  doc.setDrawColor(150);
  doc.setLineWidth(0.2);
  doc.rect(xStart, trackTop, columnWidth, trackHeight);
  
  // Column label
  doc.setFontSize(6);
  const labelParts = [`${columnEntry.columnIndex}`];
  if (columnEntry.segmentCount > 1 && columnEntry.segmentIndex) {
    labelParts.push(`Falz ${columnEntry.segmentIndex}/${columnEntry.segmentCount}`);
  }
  doc.text(labelParts.join(" - "), xStart + columnWidth / 2, trackTop - 1, { align: "center" });

  if (!columnEntry.segment) {
    doc.setFontSize(5);
    doc.text("Leer", xStart + columnWidth / 2, trackTop + 4, { align: "center" });
    return;
  }

  // Draw fold segment
  const segment = columnEntry.segment;
  const segY = trackTop + segment.startMm * scale;
  const segHeight = Math.max(0.4, segment.heightMm * scale);
  doc.setFillColor(60);
  doc.rect(xStart + 0.2, segY, columnWidth - 0.4, segHeight, "F");
}

function explodeColumns(columns) {
  const flattened = [];
  columns.forEach((column) => {
    if (!column.segments.length) {
      flattened.push({
        columnIndex: column.columnIndex,
        xStart: column.xStart,
        xEnd: column.xEnd,
        segment: null,
        segmentIndex: null,
        segmentCount: 0,
      });
      return;
    }
    column.segments.forEach((segment, idx) => {
      flattened.push({
        columnIndex: column.columnIndex,
        xStart: column.xStart,
        xEnd: column.xEnd,
        segment,
        segmentIndex: idx + 1,
        segmentCount: column.segments.length,
      });
    });
  });
  return flattened;
}

export function buildPdfFileName(textArtLabel) {
  if (!textArtLabel) {
    return "Faltanleitung.pdf";
  }
  const slug = textArtLabel
    .replace(/"/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return slug ? `Faltanleitung-${slug}.pdf` : "Faltanleitung.pdf";
}
