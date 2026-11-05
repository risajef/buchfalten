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
  for (const columns of [10, 250, 1200]) for (const bookHeight of [80, 210, 400]) {
    const layout = calculateImageLayout(4000, 10000, columns / bookHeight, columns);
    assert(layout.canvasWidth >= columns);
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
