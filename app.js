/**
 * Buchfaltstudio - Main Application
 * Book folding pattern generator
 */

import { validateAnalysisOptions, validateImageFile } from './js/validation.js';
import { analyzeImage } from './js/analysis.js';
import { createPdfDocument, buildPdfFileName } from './js/pdf.js';
import { createTextArtworkUrl, clampNumber } from './js/textRenderer.js';
import { normalizeFontName, buildGoogleFontsShareUrl } from './js/fonts.js';
import { renderBookPreview } from './js/preview.js';

// Application State
const state = {
  mode: "text",
  imageFile: null,
  imageArtUrl: null,
  textArtMeta: null,
  columns: [],
  meta: null,
  textArtUrl: null,
  textArtLabel: "",
};

// DOM Elements
const elements = {
  svgInput: document.getElementById("svgInput"),
  fileName: document.getElementById("fileName"),
  columnInput: document.getElementById("columnInput"),
  heightInput: document.getElementById("heightInput"),
  thresholdInput: document.getElementById("thresholdInput"),
  alphaInput: document.getElementById("alphaInput"),
  plannerForm: document.getElementById("plannerForm"),
  summaryLine: document.getElementById("summaryLine"),
  foldList: document.getElementById("foldList"),
  artworkPreview: document.getElementById("artworkPreview"),
  bookPreviewCanvas: document.getElementById("bookPreviewCanvas"),
  previewStatus: document.getElementById("previewStatus"),
  pdfStatus: document.getElementById("pdfStatus"),
  pdfDownloadLink: document.getElementById("pdfDownloadLink"),
  textInput: document.getElementById("textInput"),
  fontInput: document.getElementById("fontInput"),
  fontSizeInput: document.getElementById("fontSizeInput"),
  paddingInput: document.getElementById("paddingInput"),
  textStatus: document.getElementById("textStatus"),
  textModeBtn: document.getElementById("textModeBtn"),
  imageModeBtn: document.getElementById("imageModeBtn"),
  textMode: document.getElementById("textMode"),
  imageMode: document.getElementById("imageMode"),
};

const DEFAULT_FONT_FAMILY = CONFIG.TEXT.DEFAULT_FONT;

let previewUrl;
let pdfPreviewUrl = null;
let textRenderTimeout = null;
let textRenderJobId = 0;
let analysisTimeout = null;
let analysisJobId = 0;

// ============================================================================
// Mode Switching
// ============================================================================

function setMode(mode) {
  state.mode = mode;
  invalidateTextRender();
  elements.textModeBtn.classList[mode === "text" ? "add" : "remove"]("active");
  elements.imageModeBtn.classList[mode === "image" ? "add" : "remove"]("active");
  elements.textMode.style.display = mode === "text" ? "block" : "none";
  elements.imageMode.style.display = mode === "image" ? "block" : "none";
  if (mode === "text") {
    setPreviewSource(state.textArtUrl);
    scheduleTextArtworkRender(0);
  } else {
    setPreviewSource(state.imageArtUrl);
    triggerAutoAnalysis();
  }
}

elements.textModeBtn?.addEventListener("click", () => setMode("text"));
elements.imageModeBtn?.addEventListener("click", () => setMode("image"));

// ============================================================================
// Auto-Analysis Triggers
// ============================================================================

function triggerAutoAnalysis(delay = CONFIG.DEBOUNCE.AUTO_ANALYSIS) {
  invalidateResults();
  if (analysisTimeout) {
    clearTimeout(analysisTimeout);
  }
  analysisTimeout = setTimeout(() => {
    analysisTimeout = null;
    const form = elements.plannerForm;
    if (form) {
      const event = new Event("submit", { cancelable: true, bubbles: true });
      form.dispatchEvent(event);
    }
  }, delay);
}

elements.svgInput?.addEventListener("change", handleFileInputChange);
elements.columnInput?.addEventListener("input", () => triggerAutoAnalysis());
elements.heightInput?.addEventListener("input", () => triggerAutoAnalysis());

// Auto-trigger text rendering
const autoTextInputs = [
  { el: elements.textInput, delay: CONFIG.DEBOUNCE.TEXT_INPUT },
  { el: elements.fontInput, delay: 0 },
  { el: elements.fontSizeInput, delay: 0 },
  { el: elements.paddingInput, delay: 0 },
];

autoTextInputs.forEach(({ el, delay }) => {
  if (!el) return;
  el.addEventListener("input", () => scheduleTextArtworkRender(delay));
});

// Initial text render if text present
if ((elements.textInput?.value || "").trim()) {
  scheduleTextArtworkRender(0);
}

// ============================================================================
// File Input Handling
// ============================================================================

function handleFileInputChange() {
  invalidateResults();
  invalidateTextRender();
  const [file] = elements.svgInput.files || [];
  if (state.imageArtUrl) URL.revokeObjectURL(state.imageArtUrl);
  state.imageFile = null;
  state.imageArtUrl = null;
  if (file) {
    try { validateImageFile(file); }
    catch (error) {
      setPreviewSource(null);
      elements.fileName.textContent = error.message;
      elements.summaryLine.textContent = error.message;
      setResultStatus("error");
      return;
    }
  }
  state.imageFile = file || null;
  state.imageArtUrl = file ? URL.createObjectURL(file) : null;
  elements.fileName.textContent = file?.name || "Noch keine Datei ausgewählt";
  if (state.mode === "image") {
    setPreviewSource(state.imageArtUrl);
    triggerAutoAnalysis();
  }
}

// ============================================================================
// Form Submission & Analysis
// ============================================================================

elements.plannerForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  invalidateResults();
  const jobId = analysisJobId;

  const columns = Number(elements.columnInput.value);
  const bookHeight = Number(elements.heightInput.value);
  const darkThreshold = Number(elements.thresholdInput.value);
  const alphaThreshold = Number(elements.alphaInput.value);

  try { validateAnalysisOptions({ columns, bookHeight, darkThreshold, alphaThreshold }); }
  catch (error) {
    elements.summaryLine.textContent = error.message;
    setResultStatus("error");
    return;
  }
  const source = resolveArtworkSource();
  if (!source) {
    elements.summaryLine.textContent = "Gib Text ein oder wähle im Bildmodus eine Bilddatei.";
    return;
  }

  setResultStatus("processing");
  elements.summaryLine.textContent = "Analysiere Grafik...";
  elements.foldList.innerHTML = "";

  const metadata = source.metadata;
  const img = new Image();
  img.onload = () => {
    try {
      if (jobId !== analysisJobId) return;
      const result = analyzeImage(img, { columns, bookHeight, darkThreshold, alphaThreshold });
      state.columns = result.columns;
      state.meta = result.meta;
      Object.assign(state.meta, metadata);
      renderResults();
    } catch (error) {
      console.error(error);
      elements.summaryLine.textContent = error.message || "Verarbeitung fehlgeschlagen.";
      invalidateResults("error");
    } finally {
      if (source.revoke) {
        URL.revokeObjectURL(source.url);
      }
    }
  };
  img.onerror = () => {
    if (jobId === analysisJobId) {
      elements.summaryLine.textContent = "SVG konnte nicht gelesen werden. Bitte versuche eine andere Datei.";
      invalidateResults("error");
    }
    if (source.revoke) {
      URL.revokeObjectURL(source.url);
    }
  };
  img.src = source.url;
});

// ============================================================================
// Results Rendering
// ============================================================================

function renderResults() {
  const totalFolds = state.columns.reduce((sum, col) => sum + col.segments.length, 0);

  if (!totalFolds) {
    elements.summaryLine.textContent = "Keine festen Farbbänder erkannt. Versuche, die Rauschschwelle zu senken.";
    elements.foldList.innerHTML = "";
    resetPdfPreview();
    updateBookPreview();
    return;
  }

  updateSummaryText(totalFolds);
  updateFoldList();
  updateBookPreview();
  
  // Auto-generate PDF
  try {
    const doc = createPdfDocument(state);
    if (doc) {
      previewPdf(doc);
    }
  } catch (error) {
    resetPdfPreview();
    setResultStatus("error");
    console.error("PDF generation error:", error);
    if (elements.pdfStatus) {
      elements.pdfStatus.textContent = error.message;
    }
  }
}

function updateSummaryText(totalFolds) {
  const { heightPx, widthPx, bookHeightMm, bookWidthMm, originalWidthPx, activeRange, 
          requestedBookHeightMm, maxHeightMm, originalImageWidth, originalImageHeight } = state.meta;
  
  const dimensionText = originalWidthPx && originalWidthPx !== widthPx
    ? `${widthPx}px zugeschnitten von ${originalWidthPx}px Breite × ${heightPx}px Höhe`
    : `${widthPx}×${heightPx} px`;
    
  let summaryText = `${state.columns.length} Spalten • ${totalFolds} Falze • ${dimensionText} skaliert auf ${bookWidthMm.toFixed(1)}×${bookHeightMm.toFixed(1)} mm Buch`;
  
  if (originalImageWidth && originalImageHeight) {
    summaryText += ` (Original: ${originalImageWidth}×${originalImageHeight}px)`;
  }
  
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
  
  elements.summaryLine.textContent = summaryText;
}

function updateFoldList() {
  if (elements.foldList) {
    elements.foldList.innerHTML = `
      <article class="fold-card">
        <p class="micro-copy">Die Faltanweisungen befinden sich in der PDF-Anleitung. Verwende "PDF herunterladen", um eine druckbare Datei zu generieren und herunterzuladen.</p>
      </article>
    `;
  }
}

function updateBookPreview() {
  const segmentCount = renderBookPreview(elements.bookPreviewCanvas, state);
  
  if (elements.previewStatus) {
    if (segmentCount === null || segmentCount === 0) {
      elements.previewStatus.textContent = "Schreibe Text oder lade eine SVG hoch, um Falze vorzuschauen.";
    } else {
      elements.previewStatus.textContent = state.mode === "text" && state.textArtLabel
        ? `Vorschau ${state.textArtLabel}` 
        : "Vorschau der Falzdichte";
    }
  }
}

// ============================================================================
// Text Artwork Rendering
// ============================================================================

function invalidateTextRender() {
  textRenderJobId += 1;
  if (textRenderTimeout) {
    clearTimeout(textRenderTimeout);
    textRenderTimeout = null;
  }
}

function scheduleTextArtworkRender(delay = 300) {
  invalidateResults();
  invalidateTextRender();
  clearTextArtSource();
  if (state.mode === "text") setPreviewSource(null);
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
  const jobId = ++textRenderJobId;
  const text = (elements.textInput?.value || "").trim();
  if (!text) {
    clearTextArtSource();
    if (state.mode === "text") setPreviewSource(null);
    return;
  }

  if ([...text].length > CONFIG.TEXT.MAX_LENGTH) {
    elements.textStatus.textContent = `Höchstens ${CONFIG.TEXT.MAX_LENGTH} Zeichen erlaubt.`;
    setResultStatus("error");
    return;
  }
  const fontFamily = normalizeFontName(elements.fontInput?.value) || DEFAULT_FONT_FAMILY;
  const fontSize = clampNumber(
    Number(elements.fontSizeInput?.value) || CONFIG.TEXT.FONT_SIZE.DEFAULT,
    CONFIG.TEXT.FONT_SIZE.MIN,
    CONFIG.TEXT.FONT_SIZE.MAX
  );
  const paddingPercent = clampNumber(
    Number(elements.paddingInput?.value) || CONFIG.TEXT.PADDING_PERCENT.DEFAULT,
    CONFIG.TEXT.PADDING_PERCENT.MIN,
    CONFIG.TEXT.PADDING_PERCENT.MAX
  );
  
  if (elements.textStatus) {
    elements.textStatus.textContent = "Textgrafik wird gerendert...";
  }

  try {
    const url = await createTextArtworkUrl({ text, fontFamily, fontSize, paddingPercent });
    
    if (jobId !== textRenderJobId || state.mode !== "text") {
      URL.revokeObjectURL(url);
      return;
    }
    
    const previousUrl = state.textArtUrl;
    state.textArtUrl = url;
    state.textArtLabel = `Textgrafik: "${text}" · ${fontFamily}`;
    state.textArtMeta = Object.freeze({ text, fontFamily, fontSize, imageFileName: null });
    setPreviewSource(url, { revocable: true });
    
    if (previousUrl && previousUrl !== url) {
      URL.revokeObjectURL(previousUrl);
    }
    
    if (elements.textStatus) {
      const shareUrl = buildGoogleFontsShareUrl(fontFamily);
      elements.textStatus.textContent = `Textgrafik fertig. Schrift "${fontFamily}" (Google Fonts: ${shareUrl})`;
    }
    
    triggerAutoAnalysis();
  } catch (error) {
    console.error(error);
    if (jobId !== textRenderJobId) return;
    
    if (elements.textStatus) {
      elements.textStatus.textContent = "Text konnte nicht gerendert werden. Versuche kürzeren Text oder eine kleinere Schriftgrösse.";
    }
  }
}

function clearTextArtSource() {
  if (state.textArtUrl) {
    URL.revokeObjectURL(state.textArtUrl);
    state.textArtUrl = null;
    state.textArtLabel = "";
    state.textArtMeta = null;
  }
  if (elements.textStatus) {
    elements.textStatus.textContent = "Tippe Text ein, um automatisch ein faltbares Wortzeichen zu erstellen.";
  }
}

// ============================================================================
// Preview Management
// ============================================================================

// Sources own their object URLs; displaying another mode must not revoke them.
function setPreviewSource(url) {
  previewUrl = url || null;
  if (!elements.artworkPreview) return;
  if (previewUrl) elements.artworkPreview.src = previewUrl;
  else elements.artworkPreview.removeAttribute("src");
}

function resolveArtworkSource() {
  if (state.mode === "text") {
    return state.textArtUrl && state.textArtMeta ? {
      url: state.textArtUrl, revoke: false, metadata: state.textArtMeta,
    } : null;
  }
  return state.imageFile ? {
    url: URL.createObjectURL(state.imageFile), revoke: true,
    metadata: Object.freeze({ text: "", fontFamily: "", fontSize: null, imageFileName: state.imageFile.name }),
  } : null;
}

// ============================================================================
// PDF Management
// ============================================================================

elements.pdfDownloadLink?.addEventListener("click", (event) => {
  if (!pdfPreviewUrl || state.status !== "ready") event.preventDefault();
});

function previewPdf(doc) {
  try {
    const blob = doc.output("blob");
    const blobUrl = URL.createObjectURL(blob);
    attachPdfPreview(blobUrl);
  } catch (error) {
    resetPdfPreview();
    setResultStatus("error");
    console.error(error);
    elements.summaryLine.textContent = "Konnte die PDF-Vorschau nicht anzeigen. Siehe Konsole für Details.";
    if (elements.pdfStatus) {
      elements.pdfStatus.textContent = "PDF-Generierung fehlgeschlagen. Siehe Konsolenprotokolle.";
    }
  }
}

function attachPdfPreview(blobUrl) {
  if (pdfPreviewUrl) {
    URL.revokeObjectURL(pdfPreviewUrl);
  }
  pdfPreviewUrl = blobUrl;
  setResultStatus("ready");
  
  if (elements.pdfDownloadLink) {
    elements.pdfDownloadLink.href = blobUrl;
    elements.pdfDownloadLink.classList.remove("disabled-link");
    elements.pdfDownloadLink.removeAttribute("aria-disabled");
    elements.pdfDownloadLink.removeAttribute("tabindex");
    elements.pdfDownloadLink.download = buildPdfFileName(state.mode === "text" ? state.textArtLabel : "");
  }
  
  if (elements.pdfStatus) {
    elements.pdfStatus.textContent = `PDF aktualisiert ${new Date().toLocaleTimeString()}. Verwende "PDF herunterladen", um es anzusehen oder zu drucken.`;
  }
}

function resetPdfPreview() {
  if (pdfPreviewUrl) {
    URL.revokeObjectURL(pdfPreviewUrl);
    pdfPreviewUrl = null;
  }
  
  if (elements.pdfDownloadLink) {
    elements.pdfDownloadLink.href = "#";
    elements.pdfDownloadLink.classList.add("disabled-link");
    elements.pdfDownloadLink.setAttribute("aria-disabled", "true");
    elements.pdfDownloadLink.setAttribute("tabindex", "-1");
    elements.pdfDownloadLink.removeAttribute("download");
  }
  
  if (elements.pdfStatus) {
    elements.pdfStatus.textContent = "Generiere Falze, um den PDF-Download zu aktivieren.";
  }
}

function setResultStatus(status) {
  state.status = status;
  elements.plannerForm.dataset.status = status;
  elements.plannerForm.setAttribute("aria-busy", String(status === "processing"));
}

function invalidateResults(status = "empty") {
  analysisJobId += 1;
  state.columns = [];
  state.meta = null;
  resetPdfPreview();
  elements.foldList.innerHTML = "";
  updateBookPreview();
  setResultStatus(status);
}

// ============================================================================
// Initialization
// ============================================================================

invalidateResults();
