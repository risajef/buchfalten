import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateBookBounds, renderBookPreview } from '../js/preview.js';

for (const aspect of [0.0025, 0.025, 1, 15, 45]) {
  test(`book aspect ${aspect} has positive preview bounds and aligned folds`, () => {
    const bounds = calculateBookBounds(aspect, 600, 380);
    assert(bounds.width >= 1 && bounds.height >= 1);
    assert(bounds.x >= 0 && bounds.y >= 0);
    const rectangles = [];
    const ctx = {
      clearRect() {}, fillRect(...args) { rectangles.push(args); }, strokeRect() {},
      createLinearGradient: () => ({ addColorStop() {} }), beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
    };
    const canvas = { getContext: () => ctx };
    const plan = { meta: { bookWidthMm: aspect * 400, bookHeightMm: 400 }, columns: [{ columnIndex: 1, segments: [{ startPercent: 0, endPercent: 100 }] }] };
    assert.equal(renderBookPreview(canvas, plan), 1);
    assert.equal(canvas.width, 600);
    assert.equal(canvas.height, 380);
    assert(rectangles.every(rect => rect.every(Number.isFinite) && rect[2] > 0 && rect[3] > 0));
    const fold = rectangles.at(-1);
    assert.equal(fold[1], bounds.y);
    assert.equal(fold[3], bounds.height);
  });
}
