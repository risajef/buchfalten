/**
 * Font Loading Module
 * Handles Google Fonts loading and font availability checks
 */

const fontStylesheetPromises = new Map();

export async function ensureFontLoaded(fontFamily, fontSize) {
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

export function buildGoogleFontsShareUrl(fontFamily) {
  return `https://fonts.google.com/share?selection.family=${encodeFontFamilyForUrl(fontFamily)}`;
}

function encodeFontFamilyForUrl(fontFamily) {
  const normalized = normalizeFontName(fontFamily);
  return normalized ? normalized.replace(/\s+/g, "+") : "";
}

export function normalizeFontName(name) {
  if (!name) {
    return "";
  }
  return name.trim().replace(/\s+/g, " ");
}

export function buildFontLoadingDescriptor(fontFamily, fontSize) {
  const safeSize = clampNumber(fontSize || 16, 8, 512);
  return `normal 400 ${safeSize}px "${fontFamily}"`;
}

export function buildCanvasFontValue(fontFamily, fontSize) {
  return `${buildFontLoadingDescriptor(fontFamily, fontSize)}, sans-serif`;
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}
