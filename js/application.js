import { CONFIG } from "./config.js";
import { clampNumber } from "./utils.js";
/**
 * Buchfaltstudio - Main Application
 * Book folding pattern generator
 */

import { validateAnalysisOptions, validateImageFile } from './validation.js';
import { analyzeImage } from './analysis.js';
import { createPdfDocument, buildPdfFileName } from './pdf.js';
import { createTextArtworkUrl } from './textRenderer.js';
import { normalizeFontName, buildGoogleFontsShareUrl } from './fonts.js';
import { renderBookPreview } from './preview.js';

const mounts = new WeakMap();

/** Mount one independent instance; mounting again disposes the old instance. */
export function mountBuchfaltstudio(root, {
  document: doc = root.ownerDocument || root,
  Image: ImageClass = globalThis.Image,
  URL: urlApi = globalThis.URL,
  setTimeout: setTimer = globalThis.setTimeout,
  clearTimeout: clearTimer = globalThis.clearTimeout,
  pdfFactory = () => undefined,
} = {}) {
  mounts.get(root)?.destroy();
  const cleanups = [];
  const pendingImages = new Map();
  const analysisCanvas = doc.createElement("canvas");
  let destroyed = false;
  function listen(element, type, handler) {
    if (!element) return;
    element.addEventListener(type, handler);
    cleanups.push(() => element.removeEventListener(type, handler));
  }
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
    svgInput: root.querySelector("#svgInput"),
    fileName: root.querySelector("#fileName"),
    columnInput: root.querySelector("#columnInput"),
    heightInput: root.querySelector("#heightInput"),
    thicknessInput: root.querySelector("#thicknessInput"),
    segmentPolicyInput: root.querySelector("#segmentPolicyInput"),
    thresholdInput: root.querySelector("#thresholdInput"),
    alphaInput: root.querySelector("#alphaInput"),
    plannerForm: root.querySelector("#plannerForm"),
    summaryLine: root.querySelector("#summaryLine"),
    foldList: root.querySelector("#foldList"),
    artworkPreview: root.querySelector("#artworkPreview"),
    bookPreviewCanvas: root.querySelector("#bookPreviewCanvas"),
    previewStatus: root.querySelector("#previewStatus"),
    pdfStatus: root.querySelector("#pdfStatus"),
    pdfDownloadLink: root.querySelector("#pdfDownloadLink"),
    textInput: root.querySelector("#textInput"),
    fontInput: root.querySelector("#fontInput"),
    fontSizeInput: root.querySelector("#fontSizeInput"),
    paddingInput: root.querySelector("#paddingInput"),
    textStatus: root.querySelector("#textStatus"),
    textModeBtn: root.querySelector("#textModeBtn"),
    imageModeBtn: root.querySelector("#imageModeBtn"),
    textMode: root.querySelector("#textMode"),
    imageMode: root.querySelector("#imageMode"),
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

  listen(elements.textModeBtn, "click", () => setMode("text"));
  listen(elements.imageModeBtn, "click", () => setMode("image"));

  // ============================================================================
  // Auto-Analysis Triggers
  // ============================================================================

  function triggerAutoAnalysis(delay = CONFIG.DEBOUNCE.AUTO_ANALYSIS) {
    invalidateResults();
    if (analysisTimeout) {
      clearTimer(analysisTimeout);
    }
    analysisTimeout = setTimer(() => {
      analysisTimeout = null;
      const form = elements.plannerForm;
      if (form) {
        const event = new Event("submit", { cancelable: true, bubbles: true });
        form.dispatchEvent(event);
      }
    }, delay);
  }

  listen(elements.svgInput, "change", handleFileInputChange);
  listen(elements.columnInput, "input", () => triggerAutoAnalysis());
  listen(elements.heightInput, "input", () => triggerAutoAnalysis());
  listen(elements.thicknessInput, "input", () => triggerAutoAnalysis());
  listen(elements.segmentPolicyInput, "change", () => triggerAutoAnalysis());

  // Auto-trigger text rendering
  const autoTextInputs = [
    { el: elements.textInput, delay: CONFIG.DEBOUNCE.TEXT_INPUT },
    { el: elements.fontInput, delay: 0 },
    { el: elements.fontSizeInput, delay: 0 },
    { el: elements.paddingInput, delay: 0 },
  ];

  autoTextInputs.forEach(({ el, delay }) => {
    if (!el) return;
    listen(el, "input", () => scheduleTextArtworkRender(delay));
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
    if (state.imageArtUrl) urlApi.revokeObjectURL(state.imageArtUrl);
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
    state.imageArtUrl = file ? urlApi.createObjectURL(file) : null;
    elements.fileName.textContent = file?.name || "Noch keine Datei ausgewählt";
    if (state.mode === "image") {
      setPreviewSource(state.imageArtUrl);
      triggerAutoAnalysis();
    }
  }

  // ============================================================================
  // Form Submission & Analysis
  // ============================================================================

  listen(elements.plannerForm, "submit", async (event) => {
    event.preventDefault();
    invalidateResults();
    const jobId = analysisJobId;

    const columns = Number(elements.columnInput.value);
    const bookHeight = Number(elements.heightInput.value);
    const darkThreshold = Number(elements.thresholdInput.value);
    const alphaThreshold = Number(elements.alphaInput.value);
    const pageThicknessMm = Number(elements.thicknessInput.value);
    const segmentPolicy = elements.segmentPolicyInput.value;
    const options = Object.freeze({ columns, bookHeight, darkThreshold, alphaThreshold, pageThicknessMm, segmentPolicy });

    try { validateAnalysisOptions(options); }
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
    const img = new ImageClass();
    pendingImages.set(img, source);
    img.onload = () => {
      try {
        if (destroyed || jobId !== analysisJobId) return;
        const result = analyzeImage(img, options, { canvas: analysisCanvas });
        state.columns = result.columns;
        state.meta = Object.freeze({ ...result.meta, ...metadata });
        renderResults();
      } catch (error) {
        console.error(error);
        elements.summaryLine.textContent = error.message || "Verarbeitung fehlgeschlagen.";
        invalidateResults("error");
      } finally {
        pendingImages.delete(img);
        if (source.revoke) {
          urlApi.revokeObjectURL(source.url);
        }
      }
    };
    img.onerror = () => {
      pendingImages.delete(img);
      if (jobId === analysisJobId) {
        elements.summaryLine.textContent = "SVG konnte nicht gelesen werden. Bitte versuche eine andere Datei.";
        invalidateResults("error");
      }
      if (source.revoke) {
        urlApi.revokeObjectURL(source.url);
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
      const doc = createPdfDocument(Object.freeze({ columns: state.columns, meta: state.meta }), { factory: pdfFactory() });
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

    if (state.meta.omittedSegmentCount) {
      summaryText += ` Achtung: ${state.meta.omittedSegmentCount} Farbstreifen ausgelassen; pro Blatt wird nur ein Streifen abwechselnd gewählt.`;
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
      clearTimer(textRenderTimeout);
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
      clearTimer(textRenderTimeout);
    }
    textRenderTimeout = setTimer(() => {
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
    let fontFamily;
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
      fontFamily = normalizeFontName(elements.fontInput?.value) || DEFAULT_FONT_FAMILY;
      const url = await createTextArtworkUrl({ text, fontFamily, fontSize, paddingPercent }, { document: doc, URL: urlApi });

      if (destroyed || jobId !== textRenderJobId || state.mode !== "text") {
        urlApi.revokeObjectURL(url);
        return;
      }

      const previousUrl = state.textArtUrl;
      state.textArtUrl = url;
      state.textArtLabel = `Textgrafik: "${text}" · ${fontFamily}`;
      state.textArtMeta = Object.freeze({ text, fontFamily, fontSize, imageFileName: null });
      setPreviewSource(url, { revocable: true });

      if (previousUrl && previousUrl !== url) {
        urlApi.revokeObjectURL(previousUrl);
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
        elements.textStatus.textContent = error.message || "Text konnte nicht gerendert werden.";
        setResultStatus("error");
      }
    }
  }

  function clearTextArtSource() {
    if (state.textArtUrl) {
      urlApi.revokeObjectURL(state.textArtUrl);
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
      url: urlApi.createObjectURL(state.imageFile), revoke: true,
      metadata: Object.freeze({ text: "", fontFamily: "", fontSize: null, imageFileName: state.imageFile.name }),
    } : null;
  }

  // ============================================================================
  // PDF Management
  // ============================================================================

  listen(elements.pdfDownloadLink, "click", (event) => {
    if (!pdfPreviewUrl || state.status !== "ready") event.preventDefault();
  });

  function previewPdf(doc) {
    try {
      const blob = doc.output("blob");
      const blobUrl = urlApi.createObjectURL(blob);
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
      urlApi.revokeObjectURL(pdfPreviewUrl);
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
      urlApi.revokeObjectURL(pdfPreviewUrl);
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

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    invalidateTextRender();
    clearTimer(analysisTimeout);
    for (const [image, source] of pendingImages) {
      image.onload = null;
      image.onerror = null;
      image.src = "";
      if (source.revoke) urlApi.revokeObjectURL(source.url);
    }
    pendingImages.clear();
    cleanups.forEach(cleanup => cleanup());
    clearTextArtSource();
    if (state.imageArtUrl) urlApi.revokeObjectURL(state.imageArtUrl);
    setPreviewSource(null);
    invalidateResults();
    mounts.delete(root);
  }

  const instance = Object.freeze({ destroy });
  mounts.set(root, instance);
  return instance;
}
