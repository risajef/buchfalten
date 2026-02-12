function runAnalysis(image, options) {
  const { columns, bookHeight, darkThreshold, alphaThreshold } = options;
  
  // Calculate physical book dimensions
  const bookWidthMm = columns * CONFIG.PAGE_THICKNESS_MM;
  const maxHeightMm = null;
  const constrainedBookHeight = bookHeight;
  
  // Get original image dimensions
  const originalWidth = image.naturalWidth || image.width;
  const originalHeight = image.naturalHeight || image.height;
  const imageAspectRatio = originalWidth / originalHeight;
  const bookAspectRatio = bookWidthMm / constrainedBookHeight;
  
  // Scale image to fit within book dimensions while maintaining aspect ratio
  let scaledWidth, scaledHeight;
  if (imageAspectRatio > bookAspectRatio) {
    // Image is wider than book - width is limiting factor
    scaledWidth = originalWidth;
    scaledHeight = originalWidth / bookAspectRatio;
  } else {
    // Image is taller than book - height is limiting factor
    scaledHeight = originalHeight;
    scaledWidth = originalHeight * bookAspectRatio;
  }
  
  // Draw scaled image to canvas
  const canvas = analysisCanvas;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  canvas.width = scaledWidth;
  canvas.height = scaledHeight;
  ctx.clearRect(0, 0, scaledWidth, scaledHeight);
  
  // Fill with white background, then draw image centered
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, scaledWidth, scaledHeight);
  
  const offsetX = (scaledWidth - originalWidth) / 2;
  const offsetY = (scaledHeight - originalHeight) / 2;
  ctx.drawImage(image, offsetX, offsetY, originalWidth, originalHeight);

  const imageData = ctx.getImageData(0, 0, scaledWidth, scaledHeight);
  const thresholds = { darkThreshold, alphaThreshold };
  const activeRange = computeActiveRange(imageData, thresholds);
  const rawColumns = sliceColumns(imageData, columns, thresholds, activeRange);
  
  const pxToMm = constrainedBookHeight / scaledHeight;
  const enriched = normalizeSegments(rawColumns, pxToMm, scaledHeight);
  const balanced = balanceSegments(enriched);

  state.columns = balanced;
  state.meta = {
    heightPx: scaledHeight,
    widthPx: activeRange?.width || scaledWidth,
    originalWidthPx: scaledWidth,
    originalImageWidth: originalWidth,
    originalImageHeight: originalHeight,
    bookHeightMm: constrainedBookHeight,
    bookWidthMm: bookWidthMm,
    requestedBookHeightMm: bookHeight,
    maxHeightMm: maxHeightMm,
    pxToMm,
    activeRange,
  };

  renderResults();
  maybeAutoPreview();
}

function sliceColumns(imageData, columnCount, thresholds, activeRange) {
  const { data, width, height } = imageData;
  const { darkThreshold, alphaThreshold } = thresholds;
  const range = activeRange || { start: 0, end: width - 1, width };
  const columnWidth = range.width / columnCount;
  const result = [];

  for (let c = 0; c < columnCount; c += 1) {
    const xStart = Math.max(0, Math.floor(range.start + c * columnWidth));
    const rawEnd = Math.floor(range.start + (c + 1) * columnWidth) - 1;
    const xEnd = Math.max(xStart, Math.min(range.end, rawEnd));
    const segments = [];
    let active = false;
    let startY = 0;

    for (let y = 0; y < height; y += 1) {
      let rowHasInk = false;

      for (let x = xStart; x <= xEnd; x += 1) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const a = data[idx + 3];
        if (a < alphaThreshold) {
          continue;
        }
        const brightness = (r + g + b) / 3;
        if (brightness <= darkThreshold) {
          rowHasInk = true;
          break;
        }
      }

      if (rowHasInk && !active) {
        active = true;
        startY = y;
      }

      if (!rowHasInk && active) {
        active = false;
        segments.push({ startPx: startY, endPx: y - 1 });
      }
    }

    if (active) {
      segments.push({ startPx: startY, endPx: height - 1 });
    }

    result.push({
      columnIndex: c + 1,
      xStart,
      xEnd,
      segments,
    });
  }

  return result;
}

function computeActiveRange(imageData, thresholds) {
  const { data, width, height } = imageData;
  const { darkThreshold, alphaThreshold } = thresholds;
  let minX = width;
  let maxX = -1;

  for (let x = 0; x < width; x += 1) {
    let columnHasInk = false;
    for (let y = 0; y < height; y += 1) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];
      if (a < alphaThreshold) {
        continue;
      }
      const brightness = (r + g + b) / 3;
      if (brightness <= darkThreshold) {
        columnHasInk = true;
        break;
      }
    }
    if (columnHasInk) {
      if (x < minX) {
        minX = x;
      }
      if (x > maxX) {
        maxX = x;
      }
    }
  }

  if (maxX === -1) {
    return { start: 0, end: width - 1, width };
  }

  const padding = Math.max(1, Math.round(width * 0.002));
  const start = Math.max(0, minX - padding);
  const end = Math.min(width - 1, maxX + padding);
  return {
    start,
    end,
    width: end - start + 1,
  };
}

function normalizeSegments(columns, pxToMm, heightPx) {
  return columns.map((col) => {
    const mappedSegments = col.segments.map((segment) => {
      const startMm = +(segment.startPx * pxToMm).toFixed(1);
      const endMm = +((segment.endPx + 1) * pxToMm).toFixed(1);
      return {
        ...segment,
        startMm,
        endMm,
        heightMm: +(endMm - startMm).toFixed(1),
        startPercent: +(((segment.startPx / heightPx) * 100).toFixed(2)),
        endPercent: +((((segment.endPx + 1) / heightPx) * 100).toFixed(2)),
      };
    });
    return { ...col, segments: mappedSegments };
  });
}

function balanceSegments(columns) {
  let segmentCursor = 0;
  return columns.map((col) => {
    if (!col.segments.length) {
      return col;
    }

    const index = col.segments.length === 1 ? 0 : Math.floor(segmentCursor) % col.segments.length;
    const selectedSegment = col.segments[index];
    segmentCursor += 1;

    return {
      ...col,
      segments: selectedSegment ? [selectedSegment] : [],
    };
  });
}

function renderResults() {
  const totalFolds = state.columns.reduce(
    (sum, col) => sum + col.segments.length,
    0
  );

  if (!totalFolds) {
    summaryLine.textContent = "Keine festen Farbbänder erkannt. Versuche, die Rauschschwelle zu senken.";
    foldList.innerHTML = "";
    pdfBtn.disabled = true;
    resetPdfPreview();
    renderBookPreview();
    return;
  }

  const { heightPx, widthPx, bookHeightMm, bookWidthMm, originalWidthPx, activeRange, requestedBookHeightMm, maxHeightMm, originalImageWidth, originalImageHeight } = state.meta;
  const dimensionText =
    originalWidthPx && originalWidthPx !== widthPx
      ? `${widthPx}px zugeschnitten von ${originalWidthPx}px Breite × ${heightPx}px Höhe`
      : `${widthPx}×${heightPx} px`;
  let summaryText = `${state.columns.length} Spalten • ${totalFolds} Falze • ${dimensionText} skaliert auf ${bookWidthMm.toFixed(1)}×${bookHeightMm.toFixed(1)} mm Buch`;
  
  if (originalImageWidth && originalImageHeight) {
    summaryText += ` (Original: ${originalImageWidth}×${originalImageHeight}px)`;
  }
  
  // Show warning if height was constrained
  if (
    Number.isFinite(requestedBookHeightMm) &&
    Number.isFinite(bookHeightMm) &&
    bookHeightMm < requestedBookHeightMm &&
    Number.isFinite(maxHeightMm)
  ) {
    summaryText += ` (Höhe auf ${bookHeightMm.toFixed(1)} mm begrenzt, max. ${maxHeightMm.toFixed(1)} mm)`;
  }
  
  if (activeRange && originalWidthPx && originalWidthPx !== widthPx) {
    const croppedLeft = activeRange.start;
    const croppedRight = Math.max(0, originalWidthPx - (activeRange.end + 1));
    summaryText += ` (entfernte ${croppedLeft}px linke / ${croppedRight}px rechte leere Ränder)`;
  }
  summaryLine.textContent = summaryText;

  if (foldList) {
    foldList.innerHTML = `
      <article class="fold-card">
        <p class="micro-copy">Die Faltanweisungen befinden sich in der PDF-Anleitung. Verwende "PDF herunterladen", um eine druckbare Datei zu generieren und herunterzuladen.</p>
      </article>
    `;
  }
  renderBookPreview();
  
  // Auto-generate PDF
  const doc = createPdfDocument();
  if (doc) {
    previewPdf(doc);
  }
}

function maybeAutoPreview() {
  if (!state.previewPending) {
    return;
  }
  state.previewPending = false;
  const hasSegments = state.columns.some((col) => col.segments.length);
  if (!hasSegments) {
    return;
  }
  const doc = createPdfDocument();
  if (doc) {
    previewPdf(doc);
  }
}
const svgInput = document.getElementById("svgInput");
const fileNameEl = document.getElementById("fileName");
const columnInput = document.getElementById("columnInput");
const heightInput = document.getElementById("heightInput");
const thresholdInput = document.getElementById("thresholdInput");
const alphaInput = document.getElementById("alphaInput");
const plannerForm = document.getElementById("plannerForm");
const summaryLine = document.getElementById("summaryLine");
const foldList = document.getElementById("foldList");
const artworkPreview = document.getElementById("artworkPreview");
const analysisCanvas = document.getElementById("analysisCanvas");
const bookPreviewCanvas = document.getElementById("bookPreviewCanvas");
const previewStatus = document.getElementById("previewStatus");
const pdfStatus = document.getElementById("pdfStatus");
const pdfDownloadLink = document.getElementById("pdfDownloadLink");
const textInput = document.getElementById("textInput");
const fontInput = document.getElementById("fontInput");
const fontSizeInput = document.getElementById("fontSizeInput");
const paddingInput = document.getElementById("paddingInput");
const textStatus = document.getElementById("textStatus");
const textModeBtn = document.getElementById("textModeBtn");
const imageModeBtn = document.getElementById("imageModeBtn");
const textMode = document.getElementById("textMode");
const imageMode = document.getElementById("imageMode");

const DEFAULT_FONT_FAMILY = CONFIG.TEXT.DEFAULT_FONT;

const state = {
  columns: [],
  meta: null,
  previewPending: false,
  textArtUrl: null,
  textArtLabel: "",
};

const fontStylesheetPromises = new Map();

let previewUrl;
let previewUrlRevocable = false;
let pdfPreviewUrl = null;
let textRenderTimeout = null;
let textRenderJobId = 0;
let analysisTimeout = null;

// Mode switching
textModeBtn?.addEventListener("click", () => {
  textModeBtn.classList.add("active");
  imageModeBtn.classList.remove("active");
  textMode.style.display = "block";
  imageMode.style.display = "none";
  triggerAutoAnalysis();
});

imageModeBtn?.addEventListener("click", () => {
  imageModeBtn.classList.add("active");
  textModeBtn.classList.remove("active");
  imageMode.style.display = "block";
  textMode.style.display = "none";
  triggerAutoAnalysis();
});

function triggerAutoAnalysis(delay = CONFIG.DEBOUNCE.AUTO_ANALYSIS) {
  if (analysisTimeout) {
    clearTimeout(analysisTimeout);
  }
  analysisTimeout = setTimeout(() => {
    analysisTimeout = null;
    const form = plannerForm;
    if (form) {
      const event = new Event("submit", { cancelable: true, bubbles: true });
      form.dispatchEvent(event);
    }
  }, delay);
}

svgInput?.addEventListener("change", () => {
  const [file] = svgInput.files || [];
  if (!file) {
    if (state.textArtUrl) {
      fileNameEl.textContent = state.textArtLabel || "Text artwork ready";
      setPreviewSource(state.textArtUrl, { revocable: true });
    } else {
      fileNameEl.textContent = "No artwork selected yet";
      setPreviewSource(null);
    }
    return;
  }

  clearTextArtSource();
  const url = URL.createObjectURL(file);
  setPreviewSource(url, { revocable: true });
  fileNameEl.textContent = file.name;
  triggerAutoAnalysis();
});

const autoTextInputs = [
  { el: textInput, event: "input", delay: CONFIG.DEBOUNCE.TEXT_INPUT },
  { el: fontInput, event: "input", delay: 0 },
  { el: fontSizeInput, event: "input", delay: 0 },
  { el: paddingInput, event: "input", delay: 0 },
];

autoTextInputs.forEach(({ el, event, delay }) => {
  if (!el) {
    return;
  }
  el.addEventListener(event, () => scheduleTextArtworkRender(delay));
});

if ((textInput?.value || "").trim()) {
  scheduleTextArtworkRender(0);
}

// Auto-trigger analysis when settings change
columnInput?.addEventListener("input", () => triggerAutoAnalysis());
heightInput?.addEventListener("input", () => triggerAutoAnalysis());

plannerForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  state.previewPending = false;

  const source = resolveArtworkSource();
  if (!source) {
    summaryLine.textContent = "Lade zuerst eine SVG hoch oder rendere Textgrafiken.";
    return;
  }

  const columns = Number(columnInput.value);
  const bookHeight = Number(heightInput.value);
  const darkThreshold = Number(thresholdInput.value);
  const alphaThreshold = Number(alphaInput.value);

  if (!Number.isFinite(columns) || columns <= 0) {
    summaryLine.textContent = "Die Anzahl der Spalten muss eine positive Zahl sein.";
    return;
  }

  summaryLine.textContent = "Analysiere Grafik...";
  foldList.innerHTML = "";
  state.previewPending = true;

  const img = new Image();
  img.onload = () => {
    try {
      runAnalysis(img, { columns, bookHeight, darkThreshold, alphaThreshold });
    } catch (error) {
      console.error(error);
      summaryLine.textContent = "Verarbeitung fehlgeschlagen. Siehe Konsole für Details.";
      state.previewPending = false;
    } finally {
      if (source.revoke) {
        URL.revokeObjectURL(source.url);
      }
    }
  };
  img.onerror = () => {
    summaryLine.textContent = "SVG konnte nicht gelesen werden. Bitte versuche eine andere Datei.";
    state.previewPending = false;
    if (source.revoke) {
      URL.revokeObjectURL(source.url);
    }
  };
  img.src = source.url;
});

pdfDownloadLink?.addEventListener("click", (e) => {
  if (pdfDownloadLink.classList.contains("disabled-link")) {
    e.preventDefault();
    return;
  }
  // If no PDF exists yet, generate it
  if (!pdfPreviewUrl && state.columns.length) {
    e.preventDefault();
    const doc = createPdfDocument();
    if (doc) {
      previewPdf(doc);
      // Trigger download after generation
      setTimeout(() => {
        if (pdfDownloadLink.href && pdfDownloadLink.href !== "#") {
          pdfDownloadLink.click();
        }
      }, 100);
    }
  }
});

function renderBookPreview() {
  if (!bookPreviewCanvas) {
    return;
  }

  const ctx = bookPreviewCanvas.getContext("2d");
  
  // Use actual image dimensions for aspect ratio
  const imageWidthPx = state.meta?.widthPx || 1;
  const imageHeightPx = state.meta?.heightPx || 1;
  const imageAspectRatio = imageWidthPx / imageHeightPx;
  
  // Calculate canvas dimensions to maintain image aspect ratio
  const canvasMaxWidth = CONFIG.CANVAS.BOOK_PREVIEW_WIDTH;
  const canvasMaxHeight = CONFIG.CANVAS.BOOK_PREVIEW_HEIGHT;
  
  let canvasWidth, canvasHeight;
  
  if (imageAspectRatio > canvasMaxWidth / canvasMaxHeight) {
    // Width is the limiting factor
    canvasWidth = canvasMaxWidth;
    canvasHeight = canvasMaxWidth / imageAspectRatio;
  } else {
    // Height is the limiting factor
    canvasHeight = canvasMaxHeight;
    canvasWidth = canvasHeight * imageAspectRatio;
  }
  
  // Update canvas dimensions
  bookPreviewCanvas.width = canvasWidth;
  bookPreviewCanvas.height = canvasHeight;
  
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  drawFlatBook(ctx, canvasWidth, canvasHeight);

  const activeSegments = state.columns
    .map((col) => (col.segments[0] ? { columnIndex: col.columnIndex, segment: col.segments[0] } : null))
    .filter(Boolean);

  if (!activeSegments.length) {
    if (previewStatus) {
      previewStatus.textContent = "Schreibe Text oder lade eine SVG hoch, um Falze vorzuschauen.";
    }
    return;
  }

  if (previewStatus) {
    previewStatus.textContent = state.textArtLabel ? `Vorschau ${state.textArtLabel}` : "Vorschau der Falzdichte";
  }

  const totalColumns = state.columns.length || 1;
  activeSegments.forEach(({ columnIndex, segment }) => {
    const ratio = totalColumns <= 1 ? 0.5 : (columnIndex - 1) / (totalColumns - 1);
    drawFlatFold(ctx, ratio, segment, { width: canvasWidth, height: canvasHeight });
  });
}

function drawFlatBook(ctx, width, height) {
  const margin = 24;
  ctx.fillStyle = "#f4ead2";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#7b0f12";
  ctx.fillRect(margin / 2, margin / 2, width - margin, height - margin);

  const pageWidth = width - margin * 2;
  const pageHeight = height - margin * 2;
  const pageX = margin;
  const pageY = margin;

  const gradient = ctx.createLinearGradient(pageX, pageY, pageX + pageWidth, pageY);
  gradient.addColorStop(0, "#f9f0d7");
  gradient.addColorStop(0.5, "#fdf7df");
  gradient.addColorStop(1, "#f9f0d7");
  ctx.fillStyle = gradient;
  ctx.fillRect(pageX, pageY, pageWidth, pageHeight);

  ctx.strokeStyle = "rgba(120, 83, 45, 0.4)";
  ctx.lineWidth = 1;
  ctx.strokeRect(pageX, pageY, pageWidth, pageHeight);

  const spineX = width / 2;
  ctx.strokeStyle = "rgba(120, 83, 45, 0.5)";
  ctx.beginPath();
  ctx.moveTo(spineX, pageY);
  ctx.lineTo(spineX, pageY + pageHeight);
  ctx.stroke();
}

function drawFlatFold(ctx, ratio, segment, viewport) {
  const { width, height } = viewport;
  const margin = 30;
  const pageWidth = width - margin * 2;
  const pageHeight = height - margin * 2;
  const columnX = margin + ratio * pageWidth;

  const startY = margin + clamp01(segment.startPercent / 100) * pageHeight;
  const endY = margin + clamp01(segment.endPercent / 100) * pageHeight;
  const foldWidth = Math.max(1, pageWidth * 0.004);

  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.fillRect(columnX - foldWidth / 2, startY, foldWidth, endY - startY);
  ctx.strokeStyle = "rgba(120, 83, 45, 0.35)";
  ctx.lineWidth = 1;
  ctx.strokeRect(columnX - foldWidth / 2, startY, foldWidth, endY - startY);
}

function setPreviewSource(url, options = {}) {
  const nextUrl = url || null;
  const shouldRevoke = previewUrl && previewUrlRevocable && previewUrl !== nextUrl;
  if (shouldRevoke) {
    try {
      URL.revokeObjectURL(previewUrl);
    } catch (error) {
      console.warn("Unable to revoke preview URL", error);
    }
  }
  previewUrl = nextUrl;
  previewUrlRevocable = Boolean(options.revocable);
  if (!artworkPreview) {
    return;
  }
  if (nextUrl) {
    artworkPreview.src = nextUrl;
  } else {
    artworkPreview.removeAttribute("src");
  }
}

function resolveArtworkSource() {
  if (state.textArtUrl) {
    return { url: state.textArtUrl, revoke: false };
  }
  const [file] = svgInput?.files || [];
  if (!file) {
    return null;
  }
  return { url: URL.createObjectURL(file), revoke: true };
}

function clearTextArtSource() {
  if (state.textArtUrl) {
    if (state.textArtUrl !== previewUrl) {
      URL.revokeObjectURL(state.textArtUrl);
    }
    state.textArtUrl = null;
    state.textArtLabel = "";
  }
  if (textStatus) {
    textStatus.textContent = "Tippe Text ein, um automatisch ein faltbares Wortzeichen zu erstellen.";
  }
}

function scheduleTextArtworkRender(delay = 300) {
  const wait = Math.max(0, Number.isFinite(delay) ? delay : 300);
  if (textRenderTimeout) {
    clearTimeout(textRenderTimeout);
  }
  textRenderTimeout = setTimeout(() => {
    textRenderTimeout = null;
    performTextArtworkRender();
  }, wait);
}

async function performTextArtworkRender() {
  const text = (textInput?.value || "").trim();
  if (!text) {
    clearTextArtSource();
    const [file] = svgInput?.files || [];
    if (file) {
      fileNameEl.textContent = file.name;
      const fallbackUrl = URL.createObjectURL(file);
      setPreviewSource(fallbackUrl, { revocable: true });
    } else {
      fileNameEl.textContent = "Noch keine Grafik ausgewählt";
      setPreviewSource(null);
    }
    return;
  }

  const fontFamily = normalizeFontName(fontInput?.value) || DEFAULT_FONT_FAMILY;
  const fontSize = clampNumber(Number(fontSizeInput?.value) || CONFIG.TEXT.FONT_SIZE.DEFAULT, CONFIG.TEXT.FONT_SIZE.MIN, CONFIG.TEXT.FONT_SIZE.MAX);
  const paddingPercent = clampNumber(Number(paddingInput?.value) || CONFIG.TEXT.PADDING_PERCENT.DEFAULT, CONFIG.TEXT.PADDING_PERCENT.MIN, CONFIG.TEXT.PADDING_PERCENT.MAX);
  const jobId = ++textRenderJobId;

  if (textStatus) {
    textStatus.textContent = "Textgrafik wird gerendert...";
  }

  try {
    await ensureFontLoaded(fontFamily, fontSize);
    const url = await createTextArtworkUrl({ text, fontFamily, fontSize, paddingPercent });
    if (jobId !== textRenderJobId) {
      URL.revokeObjectURL(url);
      return;
    }
    const previousUrl = state.textArtUrl;
    state.textArtUrl = url;
    state.textArtLabel = `Textgrafik: "${text}" · ${fontFamily}`;
    svgInput.value = "";
    setPreviewSource(url, { revocable: true });
    fileNameEl.textContent = state.textArtLabel;
    if (previousUrl && previousUrl !== url) {
      URL.revokeObjectURL(previousUrl);
    }
    if (textStatus) {
      const shareUrl = buildGoogleFontsShareUrl(fontFamily);
      textStatus.textContent = `Textgrafik fertig. Schrift "${fontFamily}" (Google Fonts: ${shareUrl})`;
    }
    triggerAutoAnalysis();
  } catch (error) {
    console.error(error);
    if (jobId !== textRenderJobId) {
      return;
    }
    if (textStatus) {
      textStatus.textContent = "Text konnte nicht gerendert werden. Versuche kürzeren Text oder eine kleinere Schriftgrösse.";
    }
  }
}

function createPdfDocument() {
  const factory = window.jspdf?.jsPDF;
  if (!factory) {
    summaryLine.textContent = "PDF-Engine wird noch geladen. Bitte versuche es erneut.";
    return null;
  }
  if (!state.meta || !state.columns.length) {
    summaryLine.textContent = "Generiere Falzdaten, bevor du sie als PDF exportierst.";
    return null;
  }

  const { widthPx, heightPx, bookHeightMm } = state.meta;
  if (!bookHeightMm) {
    summaryLine.textContent = "Die Buchhöhe muss grösser als null sein, um Falze zu skalieren.";
    return null;
  }

  const timestamp = new Date().toLocaleString();
  const doc = new factory({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const printableColumns = explodeColumns(state.columns);
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
  layout.trackBottom = pageHeight - layout.marginY;
  layout.trackHeight = layout.trackBottom - layout.trackTop;
  layout.axisX = layout.marginX;
  layout.scale = layout.trackHeight / layout.bookHeightMm;
  const availableWidth = pageWidth - layout.marginX * 2 - layout.axisWidth;
  layout.columnsPerPage = Math.max(
    1,
    Math.floor((availableWidth + layout.columnGap) / (layout.columnWidth + layout.columnGap))
  );

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

  if (!printableColumns.length) {
    doc.text("Keine Falze erkannt", layout.marginX, layout.trackTop + 10);
  }

  return doc;
}

function startPdfPage(doc, layout, pageNumber) {
  const {
    marginX,
    marginY,
    headerHeight,
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
  const axisCenterX = marginX + axisWidth / 2;
  doc.setDrawColor(60);
  doc.setLineWidth(0.3);
  doc.line(axisCenterX, trackTop, axisCenterX, trackBottom);
  doc.line(axisCenterX - 3, trackTop, axisCenterX + 3, trackTop);
  doc.line(axisCenterX - 3, trackBottom, axisCenterX + 3, trackBottom);
  doc.setFontSize(7);
  doc.text("Top (0 mm)", marginX, trackTop - 2);
  doc.text(`${bookHeightMm} mm`, marginX, trackBottom + 4);

  // horizontal guides for alignment (every 10%)
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
  doc.setDrawColor(150);
  doc.setLineWidth(0.2);
  doc.rect(xStart, trackTop, columnWidth, trackHeight);
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

  const segment = columnEntry.segment;
  const segY = trackTop + segment.startMm * scale;
  const segHeight = Math.max(0.4, segment.heightMm * scale);
  doc.setFillColor(60);
  doc.rect(xStart + 0.2, segY, columnWidth - 0.4, segHeight, "F");

//   doc.setFontSize(5);
//   doc.text(
//     `${formatMm(segment.startMm)}-${formatMm(segment.endMm)} mm`,
//     xStart + columnWidth / 2,
//     Math.min(segY + segHeight + 3, trackTop + trackHeight - 1),
//     { align: "center" }
//   );
}

function formatMm(value) {
  return Number(value).toFixed(1);
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

async function ensureFontLoaded(fontFamily, fontSize) {
  const normalized = normalizeFontName(fontFamily);
  if (!normalized) {
    return;
  }
  await ensureGoogleFontStylesheet(normalized);
  await loadFontViaFontFaceSet(normalized, fontSize);
  await waitForFontWidthChange(normalized);
}

async function loadFontViaFontFaceSet(fontFamily, fontSize) {
  if (!document.fonts || typeof document.fonts.load !== "function") {
    return;
  }
  const primaryDescriptor = buildFontLoadingDescriptor(fontFamily, fontSize);
  const fallbackDescriptor = `1em "${fontFamily}"`;
  try {
    await document.fonts.load(primaryDescriptor);
    await document.fonts.load(fallbackDescriptor);
    if (document.fonts.ready && typeof document.fonts.ready.then === "function") {
      await document.fonts.ready;
    }
  } catch (error) {
    console.warn("Font load warning", error);
  }
}

function waitForFontWidthChange(fontFamily, timeout = CONFIG.FONT.LOAD_TIMEOUT) {
  if (!document.body) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const probe = document.createElement("span");
    probe.textContent = CONFIG.FONT.PROBE_TEXT;
    probe.style.position = "absolute";
    probe.style.left = "-9999px";
    probe.style.top = "0";
    probe.style.visibility = "hidden";
    probe.style.fontSize = "48px";
    probe.style.fontFamily = "sans-serif";
    document.body.appendChild(probe);
    const fallbackWidth = probe.offsetWidth;
    probe.style.fontFamily = `"${fontFamily}", sans-serif`;

    if (probe.offsetWidth !== fallbackWidth) {
      probe.remove();
      resolve();
      return;
    }

    const start = performance.now();

    function cleanup() {
      probe.remove();
    }

    function check() {
      if (probe.offsetWidth !== fallbackWidth) {
        cleanup();
        resolve();
        return;
      }
      if (performance.now() - start >= timeout) {
        console.warn(`Font "${fontFamily}" timed out while waiting for load.`);
        cleanup();
        resolve();
        return;
      }
      requestAnimationFrame(check);
    }

    requestAnimationFrame(check);
  });
}

function ensureGoogleFontStylesheet(fontFamily) {
  const normalized = normalizeFontName(fontFamily);
  if (!normalized) {
    return Promise.resolve();
  }
  if (fontStylesheetPromises.has(normalized)) {
    return fontStylesheetPromises.get(normalized);
  }
  const cssUrl = buildGoogleFontsCssUrl(normalized);
  const existingLink = document.querySelector(`link[data-font-family="${normalized}"]`);
  if (existingLink) {
    const ready = Promise.resolve();
    fontStylesheetPromises.set(normalized, ready);
    return ready;
  }
  const promise = new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = cssUrl;
    link.dataset.fontFamily = normalized;
    link.onload = () => resolve();
    link.onerror = () => {
      fontStylesheetPromises.delete(normalized);
      reject(new Error(`Unable to load Google Font stylesheet for ${normalized}`));
    };
    document.head.appendChild(link);
  });
  fontStylesheetPromises.set(normalized, promise);
  return promise;
}

function buildGoogleFontsCssUrl(fontFamily) {
  return `https://fonts.googleapis.com/css2?family=${encodeFontFamilyForUrl(fontFamily)}&display=swap`;
}

function buildGoogleFontsShareUrl(fontFamily) {
  return `https://fonts.google.com/share?selection.family=${encodeFontFamilyForUrl(fontFamily)}`;
}

function encodeFontFamilyForUrl(fontFamily) {
  const normalized = normalizeFontName(fontFamily);
  return normalized ? normalized.replace(/\s+/g, "+") : "";
}

function normalizeFontName(name) {
  if (!name) {
    return "";
  }
  return name.trim().replace(/\s+/g, " ");
}

function buildFontLoadingDescriptor(fontFamily, fontSize) {
  const safeSize = clampNumber(fontSize || 16, 8, 512);
  return `normal 400 ${safeSize}px "${fontFamily}"`;
}

function buildCanvasFontValue(fontFamily, fontSize) {
  return `${buildFontLoadingDescriptor(fontFamily, fontSize)}, sans-serif`;
}

async function createTextArtworkUrl(config) {
  const { text, fontFamily, fontSize, paddingPercent } = config;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const fontDeclaration = buildCanvasFontValue(fontFamily, fontSize);
  ctx.font = fontDeclaration;
  const metrics = ctx.measureText(text);
  const ascent = metrics.actualBoundingBoxAscent || fontSize * 0.8;
  const descent = metrics.actualBoundingBoxDescent || fontSize * 0.2;
  const textWidth = Math.max(10, metrics.width);
  const padding = (paddingPercent / 100) * fontSize;
  const width = Math.ceil(textWidth + padding * 2);
  const height = Math.ceil(ascent + descent + padding * 2);
  canvas.width = width;
  canvas.height = height;

  const drawCtx = canvas.getContext("2d");
  drawCtx.fillStyle = "#fff";
  drawCtx.fillRect(0, 0, width, height);
  drawCtx.fillStyle = "#000";
  drawCtx.font = fontDeclaration;
  drawCtx.textAlign = "center";
  drawCtx.textBaseline = "alphabetic";
  drawCtx.fillText(text, width / 2, padding + ascent);

  return await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Unable to create artwork blob"));
        return;
      }
      resolve(URL.createObjectURL(blob));
    }, "image/png");
  });
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpPoint(a, b, t) {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

renderBookPreview();
resetPdfPreview();

function previewPdf(doc) {
  try {
    const blob = doc.output("blob");
    const blobUrl = URL.createObjectURL(blob);
    attachPdfPreview(blobUrl);
  } catch (error) {
    console.error(error);
    summaryLine.textContent = "Konnte die PDF-Vorschau nicht anzeigen. Siehe Konsole für Details.";
    if (pdfStatus) {
        pdfStatus.textContent = "PDF-Generierung fehlgeschlagen. Siehe Konsolenprotokolle.";
    }
  }
}

function attachPdfPreview(blobUrl) {
  if (pdfPreviewUrl) {
    URL.revokeObjectURL(pdfPreviewUrl);
  }
  pdfPreviewUrl = blobUrl;
  if (pdfDownloadLink) {
    pdfDownloadLink.href = blobUrl;
    pdfDownloadLink.classList.remove("disabled-link");
    pdfDownloadLink.removeAttribute("aria-disabled");
    pdfDownloadLink.removeAttribute("tabindex");
    pdfDownloadLink.download = buildPdfFileName();
  }
  if (pdfStatus) {
    pdfStatus.textContent = `PDF aktualisiert ${new Date().toLocaleTimeString()}. Verwende "PDF herunterladen", um es anzusehen oder zu drucken.`;
  }
}

function resetPdfPreview() {
  if (pdfPreviewUrl) {
    URL.revokeObjectURL(pdfPreviewUrl);
    pdfPreviewUrl = null;
  }
  if (pdfDownloadLink) {
    pdfDownloadLink.href = "#";
    pdfDownloadLink.classList.add("disabled-link");
    pdfDownloadLink.setAttribute("aria-disabled", "true");
    pdfDownloadLink.setAttribute("tabindex", "-1");
    pdfDownloadLink.removeAttribute("download");
  }
  if (pdfStatus) {
    pdfStatus.textContent = "Generiere Falze, um den PDF-Download zu aktivieren.";
  }
}

function buildPdfFileName() {
  if (!state.textArtLabel) {
    return "orimoto-fold-guide.pdf";
  }
  const slug = state.textArtLabel
    .replace(/"/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return slug ? `orimoto-${slug}.pdf` : "orimoto-fold-guide.pdf";
}
