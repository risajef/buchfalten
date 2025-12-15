/**
 * Book Preview Rendering Module
 * Handles 2D flat book visualization with fold overlays
 */

export function renderBookPreview(canvas, state) {
  if (!canvas) {
    return;
  }

  const ctx = canvas.getContext("2d");
  
  // Use actual image dimensions for aspect ratio
  const imageWidthPx = state.meta?.widthPx || 1;
  const imageHeightPx = state.meta?.heightPx || 1;
  const imageAspectRatio = imageWidthPx / imageHeightPx;
  
  // Calculate canvas dimensions to maintain image aspect ratio
  const { canvasWidth, canvasHeight } = calculateCanvasDimensions(imageAspectRatio);
  
  // Update canvas dimensions
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  drawFlatBook(ctx, canvasWidth, canvasHeight);

  const activeSegments = state.columns
    .map((col) => (col.segments[0] ? { columnIndex: col.columnIndex, segment: col.segments[0] } : null))
    .filter(Boolean);

  if (!activeSegments.length) {
    return null;
  }

  const totalColumns = state.columns.length || 1;
  activeSegments.forEach(({ columnIndex, segment }) => {
    const ratio = totalColumns <= 1 ? 0.5 : (columnIndex - 1) / (totalColumns - 1);
    drawFlatFold(ctx, ratio, segment, { width: canvasWidth, height: canvasHeight });
  });
  
  return activeSegments.length;
}

function calculateCanvasDimensions(imageAspectRatio) {
  const canvasMaxWidth = CONFIG.CANVAS.BOOK_PREVIEW_WIDTH;
  const canvasMaxHeight = CONFIG.CANVAS.BOOK_PREVIEW_HEIGHT;
  
  let canvasWidth, canvasHeight;
  
  if (imageAspectRatio > canvasMaxWidth / canvasMaxHeight) {
    // Width is the limiting factor
    canvasWidth = canvasMaxWidth;
    canvasHeight = canvasMaxWidth / imageAspectRatio;
  } else {
    // Height is the limiting factor
    canvasHeight = canvasMaxHeight;
    canvasWidth = canvasHeight * imageAspectRatio;
  }
  
  return { canvasWidth, canvasHeight };
}

function drawFlatBook(ctx, width, height) {
  const margin = 24;
  ctx.fillStyle = "#f4ead2";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#7b0f12";
  ctx.fillRect(margin / 2, margin / 2, width - margin, height - margin);

  const pageWidth = width - margin * 2;
  const pageHeight = height - margin * 2;
  const pageX = margin;
  const pageY = margin;

  const gradient = ctx.createLinearGradient(pageX, pageY, pageX + pageWidth, pageY);
  gradient.addColorStop(0, "#f9f0d7");
  gradient.addColorStop(0.5, "#fdf7df");
  gradient.addColorStop(1, "#f9f0d7");
  ctx.fillStyle = gradient;
  ctx.fillRect(pageX, pageY, pageWidth, pageHeight);

  ctx.strokeStyle = "rgba(120, 83, 45, 0.4)";
  ctx.lineWidth = 1;
  ctx.strokeRect(pageX, pageY, pageWidth, pageHeight);

  const spineX = width / 2;
  ctx.strokeStyle = "rgba(120, 83, 45, 0.5)";
  ctx.beginPath();
  ctx.moveTo(spineX, pageY);
  ctx.lineTo(spineX, pageY + pageHeight);
  ctx.stroke();
}

function drawFlatFold(ctx, ratio, segment, viewport) {
  const { width, height } = viewport;
  const margin = 30;
  const pageWidth = width - margin * 2;
  const pageHeight = height - margin * 2;
  const columnX = margin + ratio * pageWidth;

  const startY = margin + clamp01(segment.startPercent / 100) * pageHeight;
  const endY = margin + clamp01(segment.endPercent / 100) * pageHeight;
  const foldWidth = Math.max(1, pageWidth * 0.004);

  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.fillRect(columnX - foldWidth / 2, startY, foldWidth, endY - startY);
  ctx.strokeStyle = "rgba(120, 83, 45, 0.35)";
  ctx.lineWidth = 1;
  ctx.strokeRect(columnX - foldWidth / 2, startY, foldWidth, endY - startY);
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}
