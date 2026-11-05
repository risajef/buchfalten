import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import '../vendor/jspdf.umd.min.js';
import { createPdfDocument } from '../js/pdf.js';
import { CONFIG } from '../js/config.js';
const factory = globalThis.jspdf.jsPDF;
delete globalThis.jspdf;

test('vendored PDF engine and its checksum match the locked npm package', async () => {
  const vendor = await readFile(new URL('../vendor/jspdf.umd.min.js', import.meta.url));
  const installed = await readFile(new URL('../node_modules/jspdf/dist/jspdf.umd.min.js', import.meta.url));
  const manifest = JSON.parse(await readFile(new URL('../vendor/manifest.json', import.meta.url)));
  assert(vendor.equals(installed));
  assert.equal(createHash('sha256').update(vendor).digest('hex'), manifest.sha256);
  assert.equal(manifest.version, factory.version);
});

test('real jsPDF serializes diagrams, warnings and exact measurement pages', () => {
  const plan = {
    columns: [{ columnIndex: 7, segments: [{ startMm: 100, endMm: 150, heightMm: 50 }] }],
    meta: { bookHeightMm: 400, widthPx: 100, heightPx: 100, text: 'MARKER', omittedSegmentCount: 1 },
  };
  const doc = createPdfDocument(plan, { factory });
  const output = doc.output();
  assert.match(output, /^%PDF/);
  assert.match(output, /Skizze/);
  assert.match(output, /MARKER/);
  assert.match(output, /100\.0/);
  assert.match(output, /150\.0/);
  assert.equal(doc.getNumberOfPages(), 2);
  assert(doc.output('arraybuffer').byteLength > 1000);
});

test('nested configuration and its arrays are immutable', () => {
  assert.throws(() => CONFIG.TEXT.SUGGESTED_FONTS.push('Changed'), TypeError);
  assert.throws(() => CONFIG.ACCEPTED_IMAGE_TYPES.push('text/html'), TypeError);
  assert.throws(() => { CONFIG.LIMITS.MAX_CANVAS_PIXELS = Infinity; }, TypeError);
});
