import { createPdfDocument } from '../js/pdf.js';

export function pdfCalls(plan) {
  const calls = [];
  class Pdf {
    constructor({ orientation }) {
      const landscape = orientation === 'landscape';
      this.internal = { pageSize: { getWidth: () => landscape ? 297 : 210, getHeight: () => landscape ? 210 : 297 } };
    }
    setFont() {} setFontSize() {} setDrawColor() {} setLineWidth() {} setFillColor() {}
    splitTextToSize(text, width) {
      const length = Math.max(1, Math.floor(width / 2));
      return text.match(new RegExp(`.{1,${length}}`, 'g')) || [];
    }
    text(...args) { calls.push({ type: 'text', args }); }
    line(...args) { calls.push({ type: 'line', args }); }
    rect(...args) { calls.push({ type: 'rect', args }); }
    addPage() { calls.push({ type: 'page', args: [] }); }
  }
  createPdfDocument(plan, { factory: Pdf });
  return calls;
}

export function examplePlan(height = 210) {
  return {
    columns: [{ columnIndex: 1, segments: [{ startMm: 100, endMm: 150, heightMm: 50 }] }],
    meta: { widthPx: 100, heightPx: 100, bookHeightMm: height },
  };
}
