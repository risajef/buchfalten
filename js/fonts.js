/** Google Fonts adapter. A failed or timed-out request never silently uses fallback. */
const stylesheetCaches = new WeakMap();

export async function ensureFontLoaded(fontFamily, fontSize, {
  document: doc = globalThis.document,
  timeoutMs = CONFIG.FONT.LOAD_TIMEOUT,
  text = CONFIG.FONT.PROBE_TEXT,
  setTimeout: setTimer = globalThis.setTimeout,
  clearTimeout: clearTimer = globalThis.clearTimeout,
} = {}) {
  const family = normalizeFontName(fontFamily);
  if (!family) throw new Error('Bitte eine Schriftart auswählen.');
  if (!doc.fonts?.load || !doc.fonts?.check) throw new Error('Dieser Browser unterstützt das Laden von Schriftarten nicht.');
  let cache = stylesheetCaches.get(doc);
  if (!cache) stylesheetCaches.set(doc, cache = new Map());
  let entry = cache.get(family);
  if (!entry) {
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?${new URLSearchParams({ family, display: 'swap' })}`;
    entry = { link, promise: new Promise((resolve, reject) => {
      link.onload = resolve;
      link.onerror = () => reject(new Error(`Schriftart "${family}" konnte nicht geladen werden.`));
    }) };
    cache.set(family, entry);
    doc.head.appendChild(link);
  }
  let timer;
  try {
    await Promise.race([
      (async () => {
        await entry.promise;
        const descriptor = buildFontLoadingDescriptor(family, fontSize);
        const faces = await doc.fonts.load(descriptor, text);
        if (!faces.length || !doc.fonts.check(descriptor, text)) {
          throw new Error(`Schriftart "${family}" ist nicht verfügbar.`);
        }
      })(),
      new Promise((_, reject) => {
        timer = setTimer(() => reject(new Error(`Zeitüberschreitung beim Laden von "${family}".`)), timeoutMs);
      }),
    ]);
  } catch (error) {
    if (cache.get(family) === entry) {
      cache.delete(family);
      entry.link.remove();
      entry.link.onload = null;
      entry.link.onerror = null;
    }
    throw error;
  } finally {
    clearTimer(timer);
  }
}

export function buildGoogleFontsShareUrl(fontFamily) {
  return `https://fonts.google.com/share?${new URLSearchParams({ 'selection.family': normalizeFontName(fontFamily) })}`;
}

export function normalizeFontName(name) {
  const family = String(name || '').trim().replace(/\s+/g, ' ');
  if (family.length > 100 || (family && !/^[\p{L}\p{M}\p{N} '\-]+$/u.test(family))) {
    throw new Error('Schriftname: höchstens 100 Zeichen; Buchstaben, Zahlen, Leerzeichen, Apostroph oder Bindestrich.');
  }
  return family;
}

export function buildFontLoadingDescriptor(fontFamily, fontSize) {
  const family = normalizeFontName(fontFamily);
  const safeSize = clampNumber(fontSize || 16, 8, 512);
  return `normal 400 ${safeSize}px "${family}"`;
}

export function buildCanvasFontValue(fontFamily, fontSize) {
  return `${buildFontLoadingDescriptor(fontFamily, fontSize)}, sans-serif`;
}

function clampNumber(value, min, max) {
  return Number.isFinite(value) ? Math.min(Math.max(value, min), max) : min;
}
