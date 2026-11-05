import { clamp01 } from './utils.js';
import { CONFIG } from './config.js';

/** Render the canonical leaf plan in a bounded viewport, including extreme books. */
export function renderBookPreview(canvas, plan) {
  if (!canvas) return null;
  canvas.width = CONFIG.CANVAS.BOOK_PREVIEW_WIDTH;
  canvas.height = CONFIG.CANVAS.BOOK_PREVIEW_HEIGHT;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const aspect = plan.meta?.bookWidthMm && plan.meta?.bookHeightMm
    ? plan.meta.bookWidthMm / plan.meta.bookHeightMm
    : CONFIG.PAGES.DEFAULT * CONFIG.PAGE_THICKNESS_MM / CONFIG.HEIGHT.DEFAULT;
  const bounds = calculateBookBounds(aspect, canvas.width, canvas.height);
  drawFlatBook(ctx, bounds);
  let count = 0;
  for (const column of plan.columns) {
    const segment = column.segments[0];
    if (!segment) continue;
    const x = bounds.x + ((column.columnIndex - 0.5) / plan.columns.length) * bounds.width;
    const startY = bounds.y + clamp01(segment.startPercent / 100) * bounds.height;
    const endY = bounds.y + clamp01(segment.endPercent / 100) * bounds.height;
    const width = Math.max(0.5, Math.min(bounds.width, bounds.width / plan.columns.length));
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fillRect(x - width / 2, startY, width, endY - startY);
    ctx.strokeStyle = 'rgba(120, 83, 45, 0.35)';
    ctx.strokeRect(x - width / 2, startY, width, endY - startY);
    count += 1;
  }
  return count;
}

export function calculateBookBounds(aspect, viewportWidth, viewportHeight) {
  const availableWidth = viewportWidth - 60;
  const availableHeight = viewportHeight - 60;
  const width = Math.max(1, Math.min(availableWidth, availableHeight * aspect));
  const height = Math.max(1, Math.min(availableHeight, availableWidth / aspect));
  return { x: (viewportWidth - width) / 2, y: (viewportHeight - height) / 2, width, height };
}

function drawFlatBook(ctx, { x, y, width, height }) {
  ctx.fillStyle = '#7b0f12';
  ctx.fillRect(x - 6, y - 6, width + 12, height + 12);
  const gradient = ctx.createLinearGradient(x, y, x + width, y);
  gradient.addColorStop(0, '#f9f0d7');
  gradient.addColorStop(0.5, '#fdf7df');
  gradient.addColorStop(1, '#f9f0d7');
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = 'rgba(120, 83, 45, 0.4)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, width, height);
  ctx.beginPath();
  ctx.moveTo(x + width / 2, y);
  ctx.lineTo(x + width / 2, y + height);
  ctx.stroke();
}
