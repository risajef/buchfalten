import test from 'node:test';
import assert from 'node:assert/strict';
import { pdfCalls, examplePlan } from './pdf-harness.js';

for (const height of [80, 210, 400]) {
  test(`PDF for ${height} mm book declares scale and includes exact fold measurements`, () => {
    const plan = examplePlan(height);
    plan.columns[0].segments = [{ startMm: 10, endMm: 60, heightMm: 50 }];
    const calls = pdfCalls(plan);
    const text = calls.filter(c => c.type === 'text').map(c => c.args[0]).flat().join('\n');
    assert.match(text, height === 400 ? /Skizze:.*Nicht abmessen/ : /Massstab 1:1/);
    assert.match(text, /10\.0\s+60\.0\s+50\.0/);
    assert(calls.some(c => c.type === 'line' && c.args[2] - c.args[0] === 50 && c.args[1] === c.args[3]));
    const band = calls.find(c => c.type === 'rect' && c.args.at(-1) === 'F');
    assert.equal(band.args[3], height === 400 ? 50 * (247 / 400) : 50);
  });
}

test('PDF preserves and wraps source metadata without overlapping the track', () => {
  const plan = examplePlan();
  Object.assign(plan.meta, { text: 'MARKER_TEXT', fontFamily: 'MARKER_FONT', fontSize: 160, imageFileName: 'MARKER_FILE_' + 'long-name'.repeat(20) });
  const calls = pdfCalls(plan);
  const text = calls.filter(c => c.type === 'text').map(c => c.args[0]).flat().join('\n');
  for (const value of ['MARKER_TEXT', 'MARKER_FONT', 'MARKER_FILE']) assert(text.includes(value));
  const firstTrack = calls.find(c => c.type === 'rect');
  const headers = calls.slice(0, calls.findIndex(c => c.type === 'rect')).filter(c => c.type === 'text');
  const metadataLines = headers.slice(0, headers.findIndex(c => String(c.args[0]).startsWith('Seite '))).filter(c => c.args[2] >= 40);
  assert(metadataLines.length > 3);
  for (const line of metadataLines) assert(line.args[2] < firstTrack.args[1]);
});

test('PDF preserves original column numbering and all blank leaves', () => {
  const plan = examplePlan();
  plan.columns = Array.from({ length: 80 }, (_, index) => ({ columnIndex: index + 1, segments: index === 40 ? plan.columns[0].segments : [] }));
  const calls = pdfCalls(plan);
  const texts = calls.filter(c => c.type === 'text').map(c => c.args[0]);
  assert(texts.includes('1') && texts.includes('41') && texts.includes('80'));
  assert.equal(calls.filter(c => c.type === 'rect' && c.args.length === 4).length, 80);
});
