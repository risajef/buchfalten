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
