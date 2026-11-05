import './config.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAnalysisOptions, validateImageFile } from '../js/validation.js';
import { calculateImageLayout, analyzeImage, sliceColumns } from '../js/analysis.js';
const valid = { columns: 250, bookHeight: 210, darkThreshold: 235, alphaThreshold: 40 };

test('analysis rejects fractional, unbounded and nonfinite inputs at its boundary', () => {
  for (const [key, values] of Object.entries({ columns: [0, 2.5, 1201, Infinity, NaN], bookHeight: [0, -1, 401, NaN, Infinity], darkThreshold: [-1, 256, 1.5], alphaThreshold: [NaN, 256] })) {
    for (const value of values) {
      assert.throws(() => validateAnalysisOptions({ ...valid, [key]: value }));
      assert.throws(() => analyzeImage({}, { ...valid, [key]: value }));
    }
  }
  assert.doesNotThrow(() => validateAnalysisOptions(valid));
  assert.throws(() => sliceColumns({}, 2.5, {}));
});

test('all supported book aspect ratios stay inside the raster budget', () => {
  for (const columns of [10, 250, 1200]) for (const bookHeight of [80, 210, 400]) for (const thickness of [0.1, 1, 3]) {
    const layout = calculateImageLayout(4000, 10000, columns * thickness / bookHeight, columns);
    assert(layout.canvasWidth >= 1);
    assert(layout.canvasWidth <= 2048 && layout.canvasHeight <= 2048);
    assert(layout.canvasWidth * layout.canvasHeight <= 2_000_000);
    assert(Number.isInteger(layout.canvasWidth) && Number.isInteger(layout.canvasHeight));
  }
});

test('invalid uploads and excessively large decoded images fail before canvas allocation', () => {
  assert.throws(() => validateImageFile({ type: 'text/html', size: 100 }));
  assert.throws(() => validateImageFile({ type: 'image/png', size: 11 * 1024 * 1024 }));
  assert.throws(() => analyzeImage({ naturalWidth: 10000, naturalHeight: 10000 }, valid), /Megapixel/);
});

test('fold planning preserves detection, indices and blanks while declaring detail loss', async () => {
  const { planFolds } = await import('../js/planning.js');
  const bands = [{ startMm: 10, endMm: 20 }, { startMm: 30, endMm: 40 }];
  const plan = planFolds([{ columnIndex: 1, segments: [] }, { columnIndex: 2, segments: bands }, { columnIndex: 3, segments: bands }]);
  assert.equal(plan.columns[0].segments.length, 0);
  assert.deepEqual(plan.columns.slice(1).map(c => c.segments[0].startMm), [10, 30]);
  assert.equal(plan.omittedSegmentCount, 2);
  assert.equal(plan.columns[1].detectedSegments.length, 2);
  assert.throws(() => { plan.columns[1].segments[0].startMm = 99; }, TypeError);
  assert.throws(() => planFolds([{ columnIndex: 1, segments: bands }], 'reject'), /Mehrere/);
});

test('slicing the full book preserves the horizontal placement of narrow artwork', () => {
  const data = new Uint8ClampedArray(10 * 2 * 4).fill(255);
  for (const x of [4, 5]) for (let y = 0; y < 2; y++) data.set([0, 0, 0, 255], (y * 10 + x) * 4);
  const columns = sliceColumns({ data, width: 10, height: 2 }, 10, { darkThreshold: 235, alphaThreshold: 40 });
  assert.deepEqual(columns.filter(c => c.segments.length).map(c => c.columnIndex), [5, 6]);
});

test('normalization preserves millimeter boundaries and blank artwork', async () => {
  const { normalizeSegments, computeActiveRange } = await import('../js/analysis.js');
  const columns = normalizeSegments([{ columnIndex: 1, segments: [{ startPx: 0, endPx: 99 }] }], 2.1, 100);
  assert.deepEqual(columns[0].segments[0], { startPx: 0, endPx: 99, startMm: 0, endMm: 210, heightMm: 210, startPercent: 0, endPercent: 100 });
  const imageData = { width: 10, height: 10, data: new Uint8ClampedArray(400).fill(255) };
  const thresholds = { darkThreshold: 235, alphaThreshold: 40 };
  assert.equal(sliceColumns(imageData, 10, thresholds).filter(c => c.segments.length).length, 0);
  assert.deepEqual(computeActiveRange(imageData, thresholds), { start: 0, end: 9, width: 10 });
});
