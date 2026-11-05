import './config.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureFontLoaded, normalizeFontName, buildGoogleFontsShareUrl } from '../js/fonts.js';
import { deferred } from './app-harness.js';

function fontEnvironment() {
  const links = [];
  const timers = new Map();
  const doc = {
    createElement: () => ({ remove() { this.removed = true; } }),
    head: { appendChild: link => links.push(link) },
    fonts: { load: async () => [{}], check: () => true },
  };
  const options = { document: doc, setTimeout: fn => { const id = timers.size + 1; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id) };
  return { doc, links, timers, options };
}

test('font names cannot inject selectors or descriptors and family parameters round-trip', () => {
  for (const name of ['bad"name', 'A&B', 'X:weight@700', 'X[foo]', 'x'.repeat(101)]) assert.throws(() => normalizeFontName(name));
  const name = "Noto Sans O'Clock";
  assert.equal(new URL(buildGoogleFontsShareUrl(name)).searchParams.get('selection.family'), name);
});

test('failed stylesheet is removed and a retry actually loads a new link', async () => {
  const env = fontEnvironment();
  const first = ensureFontLoaded('Test Font', 160, env.options);
  env.links[0].onerror();
  await assert.rejects(first, /geladen/);
  assert(env.links[0].removed);
  const retry = ensureFontLoaded('Test Font', 160, env.options);
  assert.equal(env.links.length, 2);
  env.links[1].onload();
  await retry;
  assert.equal(env.timers.size, 0);
});

for (const phase of ['stylesheet', 'font']) {
  test(`font timeout bounds the ${phase} phase and permits retry`, async () => {
    const env = fontEnvironment();
    env.doc.fonts.load = () => deferred().promise;
    const pending = ensureFontLoaded('Test Font', 160, env.options);
    if (phase === 'font') env.links[0].onload();
    for (const timer of [...env.timers.values()]) timer();
    await assert.rejects(pending, /Zeitüberschreitung/);
    assert(env.links[0].removed);
    assert.equal(env.timers.size, 0);
  });
}

test('missing requested font is an error rather than successful fallback', async () => {
  const env = fontEnvironment();
  env.doc.fonts.load = async () => [];
  const pending = ensureFontLoaded('Test Font', 160, env.options);
  env.links[0].onload();
  await assert.rejects(pending, /nicht verfügbar/);
});
