/**
 * Buchfaltstudio - Main Application
 * Orimoto book folding pattern generator
 */

import { analyzeImage } from './js/analysis.js';
import { createPdfDocument, buildPdfFileName } from './js/pdf.js';
import { createTextArtworkUrl, clampNumber } from './js/textRenderer.js';
import { normalizeFontName, buildGoogleFontsShareUrl } from './js/fonts.js';
import { renderBookPreview } from './js/preview.js';

// Application State
const state = {
  columns: [],
  meta: null,
  previewPending: false,
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
let previewUrlRevocable = false;
let pdfPreviewUrl = null;
let textRenderTimeout = null;
let textRenderJobId = 0;
let analysisTimeout = null;

// ============================================================================
// Mode Switching
// ============================================================================

elements.textModeBtn?.addEventListener("click", () => {
  elements.textModeBtn.classList.add("active");
  elements.imageModeBtn.classList.remove("active");
  elements.textMode.style.display = "block";
  elements.imageMode.style.display = "none";
  triggerAutoAnalysis();
});

elements.imageModeBtn?.addEventListener("click", () => {
  elements.imageModeBtn.classList.add("active");
  elements.textModeBtn.classList.remove("active");
  elements.imageMode.style.display = "block";
  elements.textMode.style.display = "none";
  triggerAutoAnalysis();
});

// ============================================================================
// Auto-Analysis Triggers
// ============================================================================

function triggerAutoAnalysis(delay = CONFIG.DEBOUNCE.AUTO_ANALYSIS) {
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
  const [file] = elements.svgInput.files || [];
  if (!file) {
    if (state.textArtUrl) {
      elements.fileName.textContent = state.textArtLabel || "Text artwork ready";
      setPreviewSource(state.textArtUrl, { revocable: true });
    } else {
      elements.fileName.textContent = "No artwork selected yet";
      setPreviewSource(null);
    }
    return;
  }

  clearTextArtSource();
  const url = URL.createObjectURL(file);
  setPreviewSource(url, { revocable: true });
  elements.fileName.textContent = file.name;
  triggerAutoAnalysis();
}

// ============================================================================
// Form Submission & Analysis
// ============================================================================

elements.plannerForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  state.previewPending = false;

  const source = resolveArtworkSource();
  if (!source) {
    elements.summaryLine.textContent = "Lade zuerst eine SVG hoch oder rendere Textgrafiken.";
    return;
  }

  const columns = Number(elements.columnInput.value);
  const bookHeight = Number(elements.heightInput.value);
  const darkThreshold = Number(elements.thresholdInput.value);
  const alphaThreshold = Number(elements.alphaInput.value);

  if (!Number.isFinite(columns) || columns <= 0) {
    elements.summaryLine.textContent = "Die Anzahl der Spalten muss eine positive Zahl sein.";
    return;
  }

  elements.summaryLine.textContent = "Analysiere Grafik...";
  elements.foldList.innerHTML = "";
  state.previewPending = true;

  const img = new Image();
  img.onload = () => {
    try {
      const result = analyzeImage(img, { columns, bookHeight, darkThreshold, alphaThreshold });
      state.columns = result.columns;
      state.meta = result.meta;
      renderResults();
      maybeAutoPreview();
    } catch (error) {
      console.error(error);
      elements.summaryLine.textContent = "Verarbeitung fehlgeschlagen. Siehe Konsole für Details.";
      state.previewPending = false;
    } finally {
      if (source.revoke) {
        URL.revokeObjectURL(source.url);
      }
    }
  };
  img.onerror = () => {
    elements.summaryLine.textContent = "SVG konnte nicht gelesen werden. Bitte versuche eine andere Datei.";
    state.previewPending = false;
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
  
  if (requestedBookHeightMm && bookHeightMm < requestedBookHeightMm) {
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
      elements.previewStatus.textContent = state.textArtLabel 
        ? `Vorschau ${state.textArtLabel}` 
        : "Vorschau der Falzdichte";
    }
  }
}

function maybeAutoPreview() {
  if (!state.previewPending) return;
  
  state.previewPending = false;
  const hasSegments = state.columns.some((col) => col.segments.length);
  
  if (!hasSegments) return;
  
  try {
    const doc = createPdfDocument(state);
    if (doc) {
      previewPdf(doc);
    }
  } catch (error) {
    console.error("Auto-preview error:", error);
  }
}

// ============================================================================
// Text Artwork Rendering
// ============================================================================

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
  const text = (elements.textInput?.value || "").trim();
  if (!text) {
    clearTextArtSource();
    const [file] = elements.svgInput?.files || [];
    if (file) {
      elements.fileName.textContent = file.name;
      const fallbackUrl = URL.createObjectURL(file);
      setPreviewSource(fallbackUrl, { revocable: true });
    } else {
      elements.fileName.textContent = "Noch keine Grafik ausgewählt";
      setPreviewSource(null);
    }
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
  
  const jobId = ++textRenderJobId;

  if (elements.textStatus) {
    elements.textStatus.textContent = "Textgrafik wird gerendert...";
  }

  try {
    const url = await createTextArtworkUrl({ text, fontFamily, fontSize, paddingPercent });
    
    if (jobId !== textRenderJobId) {
      URL.revokeObjectURL(url);
      return;
    }
    
    const previousUrl = state.textArtUrl;
    state.textArtUrl = url;
    state.textArtLabel = `Textgrafik: "${text}" · ${fontFamily}`;
    elements.svgInput.value = "";
    setPreviewSource(url, { revocable: true });
    elements.fileName.textContent = state.textArtLabel;
    
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
      elements.textStatus.textContent = "Text konnte nicht gerendert werden. Versuche kürzeren Text oder eine kleinere Schriftgröße.";
    }
  }
}

function clearTextArtSource() {
  if (state.textArtUrl) {
    if (state.textArtUrl !== previewUrl) {
      URL.revokeObjectURL(state.textArtUrl);
    }
    state.textArtUrl = null;
    state.textArtLabel = "";
  }
  if (elements.textStatus) {
    elements.textStatus.textContent = "Tippe Text ein, um automatisch ein faltbares Wortzeichen zu erstellen.";
  }
}

// ============================================================================
// Preview Management
// ============================================================================

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
  
  if (!elements.artworkPreview) return;
  
  if (nextUrl) {
    elements.artworkPreview.src = nextUrl;
  } else {
    elements.artworkPreview.removeAttribute("src");
  }
}

function resolveArtworkSource() {
  if (state.textArtUrl) {
    return { url: state.textArtUrl, revoke: false };
  }
  
  const [file] = elements.svgInput?.files || [];
  if (!file) {
    return null;
  }
  
  return { url: URL.createObjectURL(file), revoke: true };
}

// ============================================================================
// PDF Management
// ============================================================================

elements.pdfDownloadLink?.addEventListener("click", (e) => {
  if (elements.pdfDownloadLink.classList.contains("disabled-link")) {
    e.preventDefault();
    return;
  }
  
  // If no PDF exists yet, generate it
  if (!pdfPreviewUrl && state.columns.length) {
    e.preventDefault();
    try {
      const doc = createPdfDocument(state);
      if (doc) {
        previewPdf(doc);
        // Trigger download after generation
        setTimeout(() => {
          if (elements.pdfDownloadLink.href && elements.pdfDownloadLink.href !== "#") {
            elements.pdfDownloadLink.click();
          }
        }, 100);
      }
    } catch (error) {
      console.error("PDF generation error:", error);
      if (elements.pdfStatus) {
        elements.pdfStatus.textContent = error.message;
      }
    }
  }
});

function previewPdf(doc) {
  try {
    const blob = doc.output("blob");
    const blobUrl = URL.createObjectURL(blob);
    attachPdfPreview(blobUrl);
  } catch (error) {
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
  
  if (elements.pdfDownloadLink) {
    elements.pdfDownloadLink.href = blobUrl;
    elements.pdfDownloadLink.classList.remove("disabled-link");
    elements.pdfDownloadLink.removeAttribute("aria-disabled");
    elements.pdfDownloadLink.removeAttribute("tabindex");
    elements.pdfDownloadLink.download = buildPdfFileName(state.textArtLabel);
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

// ============================================================================
// Initialization
// ============================================================================

updateBookPreview();
resetPdfPreview();
