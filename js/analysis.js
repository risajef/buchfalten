import { CONFIG } from "./config.js";
/**
 * Image Analysis Module
 * Handles image processing, column slicing, and segment detection
 */

import { planFolds } from "./planning.js";
import { validateAnalysisOptions } from "./validation.js";

export function analyzeImage(image, options, { canvas } = {}) {
  validateAnalysisOptions(options);
  const { columns, bookHeight, darkThreshold, alphaThreshold, pageThicknessMm = CONFIG.PAGE_THICKNESS_MM, segmentPolicy = "alternate" } = options;
  
  // Calculate physical book dimensions
  const bookWidthMm = columns * pageThicknessMm;
  const resolvedBookHeightMm = bookHeight;
  
  // Get original image dimensions
  const originalWidth = image.naturalWidth || image.width;
  const originalHeight = image.naturalHeight || image.height;
  
  if (!Number.isFinite(originalWidth) || !Number.isFinite(originalHeight) ||
      originalWidth <= 0 || originalHeight <= 0 ||
      originalWidth * originalHeight > CONFIG.LIMITS.MAX_SOURCE_PIXELS) {
    throw new Error("Bildabmessungen ungültig oder grösser als 40 Megapixel.");
  }

  // Calculate canvas size to represent full book dimensions in pixels
  // We need to maintain the book's physical aspect ratio
  const bookAspectRatio = bookWidthMm / resolvedBookHeightMm;
  
  // Scale image to fit within book dimensions while maintaining aspect ratio
  // The canvas represents the full book, image is centered with white space
  const { canvasWidth, canvasHeight, imageWidth, imageHeight, imageX, imageY } = 
    calculateImageLayout(originalWidth, originalHeight, bookAspectRatio, columns);
  
  // Draw scaled image to canvas with proper centering
  if (!canvas?.getContext) throw new Error("Analyse-Canvas fehlt.");
  const imageData = renderImageToCanvas(canvas, image, canvasWidth, canvasHeight, imageWidth, imageHeight, imageX, imageY);
  
  const thresholds = { darkThreshold, alphaThreshold };
  // Measure visible content for diagnostics. Slice the full book so containment,
  // blank leaves and physical page indices remain consistent in every renderer.
  const activeRange = computeActiveRange(imageData, thresholds);
  const rawColumns = sliceColumns(imageData, columns, thresholds);
  
  const pxToMm = resolvedBookHeightMm / canvasHeight;
  const enriched = normalizeSegments(rawColumns, pxToMm, canvasHeight);
  const plan = planFolds(enriched, segmentPolicy);

  return {
    columns: plan.columns,
    meta: {
      heightPx: canvasHeight,
      widthPx: canvasWidth,
      originalWidthPx: canvasWidth,
      originalImageWidth: originalWidth,
      originalImageHeight: originalHeight,
      bookHeightMm: resolvedBookHeightMm,
      bookWidthMm: bookWidthMm,
      requestedBookHeightMm: bookHeight,
      maxHeightMm: null,
      pxToMm,
      activeRange,
      pageThicknessMm,
      segmentPolicy,
      omittedSegmentCount: plan.omittedSegmentCount,
      fitPolicy: "contain",
    }
  };
}

export function calculateImageLayout(originalWidth, originalHeight, bookAspectRatio, columns) {
  const imageAspectRatio = originalWidth / originalHeight;
  
  const { MAX_CANVAS_EDGE, MAX_CANVAS_PIXELS } = CONFIG.LIMITS;
  const referenceHeight = Math.min(originalHeight, MAX_CANVAS_EDGE,
    MAX_CANVAS_EDGE / bookAspectRatio, Math.sqrt(MAX_CANVAS_PIXELS / bookAspectRatio));
  // Prefer one sample per leaf when the aspect ratio permits it within the budget.
  const minimumWidth = Math.min(columns, Math.floor(MAX_CANVAS_EDGE * bookAspectRatio),
    Math.floor(Math.sqrt(MAX_CANVAS_PIXELS * bookAspectRatio)));
  const canvasWidth = Math.max(1, minimumWidth, Math.floor(referenceHeight * bookAspectRatio));
  const canvasHeight = Math.max(1, Math.floor(canvasWidth / bookAspectRatio));

  // Now fit the image within this canvas while maintaining its aspect ratio
  let imageWidth, imageHeight;
  
  if (imageAspectRatio > bookAspectRatio) {
    // Image is wider than book - fit to width
    imageWidth = canvasWidth;
    imageHeight = imageWidth / imageAspectRatio;
  } else {
    // Image is taller than book - fit to height
    imageHeight = canvasHeight;
    imageWidth = imageHeight * imageAspectRatio;
  }
  
  // Center the image in the canvas
  const imageX = (canvasWidth - imageWidth) / 2;
  const imageY = (canvasHeight - imageHeight) / 2;
  
  return { canvasWidth, canvasHeight, imageWidth, imageHeight, imageX, imageY };
}

function renderImageToCanvas(canvas, image, canvasWidth, canvasHeight, imageWidth, imageHeight, imageX, imageY) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  
  // Fill with white background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  
  // Draw image centered in the canvas
  ctx.drawImage(image, imageX, imageY, imageWidth, imageHeight);

  return ctx.getImageData(0, 0, canvasWidth, canvasHeight);
}

export function sliceColumns(imageData, columnCount, thresholds, activeRange) {
  if (!Number.isInteger(columnCount) || columnCount < CONFIG.PAGES.MIN || columnCount > CONFIG.PAGES.MAX) {
    throw new Error("Ungültige Spaltenanzahl.");
  }
  const { data, width, height } = imageData;
  const { darkThreshold, alphaThreshold } = thresholds;
  const range = activeRange || { start: 0, end: width - 1, width };
  const columnWidth = range.width / columnCount;
  const result = [];

  for (let c = 0; c < columnCount; c += 1) {
    const xStart = Math.max(0, Math.floor(range.start + c * columnWidth));
    const rawEnd = Math.floor(range.start + (c + 1) * columnWidth) - 1;
    const xEnd = Math.max(xStart, Math.min(range.end, rawEnd));
    const segments = [];
    let active = false;
    let startY = 0;

    for (let y = 0; y < height; y += 1) {
      let rowHasInk = false;

      for (let x = xStart; x <= xEnd; x += 1) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const a = data[idx + 3];
        
        if (a < alphaThreshold) {
          continue;
        }
        
        const brightness = (r + g + b) / 3;
        if (brightness <= darkThreshold) {
          rowHasInk = true;
          break;
        }
      }

      if (rowHasInk && !active) {
        active = true;
        startY = y;
      }

      if (!rowHasInk && active) {
        active = false;
        segments.push({ startPx: startY, endPx: y - 1 });
      }
    }

    if (active) {
      segments.push({ startPx: startY, endPx: height - 1 });
    }

    result.push({
      columnIndex: c + 1,
      xStart,
      xEnd,
      segments,
    });
  }

  return result;
}

export function computeActiveRange(imageData, thresholds) {
  const { data, width, height } = imageData;
  const { darkThreshold, alphaThreshold } = thresholds;
  let minX = width;
  let maxX = -1;

  for (let x = 0; x < width; x += 1) {
    let columnHasInk = false;
    for (let y = 0; y < height; y += 1) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];
      
      if (a < alphaThreshold) {
        continue;
      }
      
      const brightness = (r + g + b) / 3;
      if (brightness <= darkThreshold) {
        columnHasInk = true;
        break;
      }
    }
    
    if (columnHasInk) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
  }

  if (maxX === -1) {
    return { start: 0, end: width - 1, width };
  }

  const padding = Math.max(1, Math.round(width * 0.002));
  const start = Math.max(0, minX - padding);
  const end = Math.min(width - 1, maxX + padding);
  
  return {
    start,
    end,
    width: end - start + 1,
  };
}

export function normalizeSegments(columns, pxToMm, heightPx) {
  return columns.map((col) => {
    const mappedSegments = col.segments.map((segment) => {
      const startMm = +(segment.startPx * pxToMm).toFixed(1);
      const endMm = +((segment.endPx + 1) * pxToMm).toFixed(1);
      return {
        ...segment,
        startMm,
        endMm,
        heightMm: +(endMm - startMm).toFixed(1),
        startPercent: +(((segment.startPx / heightPx) * 100).toFixed(2)),
        endPercent: +((((segment.endPx + 1) / heightPx) * 100).toFixed(2)),
      };
    });
    return { ...col, segments: mappedSegments };
  });
}
