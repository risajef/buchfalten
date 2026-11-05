import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

export async function createApp(overrides = {}) {
  const elements = new Map();
  const timers = new Map();
  const images = [];
  const revoked = [];
  const plans = [];
  let nextId = 0;
  function element(id) {
    if (!elements.has(id)) {
      const classes = new Set();
      const listeners = new Map();
      elements.set(id, {
        value: '', files: [], style: {}, dataset: {}, textContent: '', innerHTML: '',
        classList: { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x) },
        addEventListener(type, fn) { listeners.set(type, fn); },
        removeEventListener(type) { listeners.delete(type); },
        dispatchEvent(event) { return listeners.get(event.type)?.(event); },
        setAttribute(key, value) { this[key] = value; },
        removeAttribute(key) { delete this[key]; },
      });
    }
    return elements.get(id);
  }
  const defaults = { columnInput: '250', heightInput: '210', thresholdInput: '235', alphaInput: '40', fontInput: 'Playfair Display', fontSizeInput: '160', paddingInput: '18' };
  for (const [id, value] of Object.entries(defaults)) element(id).value = value;
  const document = { getElementById: element, querySelector: s => element(s.slice(1)), readyState: 'complete' };
  const context = vm.createContext({
    console: { error() {}, warn() {} }, document,
    URL: { createObjectURL: () => `blob:${++nextId}`, revokeObjectURL: u => revoked.push(u) },
    Image: class { constructor() { images.push(this); } },
    Event: class { constructor(type) { this.type = type; } preventDefault() {} },
    setTimeout: fn => { const id = ++nextId; timers.set(id, fn); return id; },
    clearTimeout: id => timers.delete(id), Date,
  });
  vm.runInContext(await readFile(new URL('../config.js', import.meta.url), 'utf8'), context);
  const config = vm.runInContext('CONFIG', context);
  const dependencies = {
    './js/validation.js': {
      validateAnalysisOptions: options => {
        if (!Number.isInteger(options.columns) || options.columns < 10 || options.columns > 1200 || !Number.isFinite(options.bookHeight) || options.bookHeight < 80 || options.bookHeight > 400) throw new Error('Invalid dimensions');
      },
      validateImageFile: file => { if (file.size > config.LIMITS.MAX_FILE_BYTES || !config.ACCEPTED_IMAGE_TYPES.includes(file.type)) throw new Error('Invalid file'); },
    },
    './js/analysis.js': { analyzeImage: (_img, options) => ({
      columns: [{ columnIndex: 1, segments: [{ startMm: 0, endMm: 10, heightMm: 10 }] }],
      meta: { widthPx: 100, heightPx: 100, bookHeightMm: options.bookHeight, bookWidthMm: options.columns },
    }) },
    './js/pdf.js': {
      createPdfDocument: plan => { plans.push(structuredClone(plan)); return { output: () => ({}) }; },
      buildPdfFileName: () => 'instructions.pdf',
    },
    './js/textRenderer.js': { createTextArtworkUrl: async () => `blob:text-${++nextId}`, clampNumber: (n, min, max) => Math.max(min, Math.min(max, n)) },
    './js/fonts.js': { normalizeFontName: s => s?.trim() || '', buildGoogleFontsShareUrl: () => '' },
    './js/preview.js': { renderBookPreview: () => 1 },
    '../config.js': { CONFIG: config },
    './config.js': { CONFIG: config },
    ...overrides,
  };
  const module = new vm.SourceTextModule(await readFile(new URL('../app.js', import.meta.url), 'utf8'), { context });
  await module.link(specifier => {
    const exports = dependencies[specifier];
    if (!exports) throw new Error(`Missing test dependency: ${specifier}`);
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate();
  const fire = (id, type) => element(id).dispatchEvent({ type, preventDefault() {} });
  return {
    element, images, revoked, plans, config,
    fire, submit: () => fire('plannerForm', 'submit'),
    upload(name = 'picture.png') { element('svgInput').files = [{ name, type: 'image/png', size: 100 }]; return fire('svgInput', 'change'); },
    async flushTimers() { const pending = [...timers.values()]; timers.clear(); for (const fn of pending) await fn(); },
    async settle() { for (let i = 0; i < 8; i++) await Promise.resolve(); },
  };
}

export function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
