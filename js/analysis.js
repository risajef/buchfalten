/**
 * Image Analysis Module
 * Handles image processing, column slicing, and segment detection
 */

export function analyzeImage(image, options) {
  const { columns, bookHeight, darkThreshold, alphaThreshold } = options;
  
  // Calculate physical book dimensions
  const bookWidthMm = columns * CONFIG.PAGE_THICKNESS_MM;
  const resolvedBookHeightMm = bookHeight;
  
  // Get original image dimensions
  const originalWidth = image.naturalWidth || image.width;
  const originalHeight = image.naturalHeight || image.height;
  
  // Calculate canvas size to represent full book dimensions in pixels
  // We need to maintain the book's physical aspect ratio
  const bookAspectRatio = bookWidthMm / resolvedBookHeightMm;
  
  // Scale image to fit within book dimensions while maintaining aspect ratio
  // The canvas represents the full book, image is centered with white space
  const { canvasWidth, canvasHeight, imageWidth, imageHeight, imageX, imageY } = 
    calculateImageLayout(originalWidth, originalHeight, bookAspectRatio);
  
  // Draw scaled image to canvas with proper centering
  const canvas = document.getElementById('analysisCanvas');
  const imageData = renderImageToCanvas(canvas, image, canvasWidth, canvasHeight, imageWidth, imageHeight, imageX, imageY);
  
  const thresholds = { darkThreshold, alphaThreshold };
  // Determine the horizontal active range (non-empty area) and slice only that
  // region into columns. This trims empty left/right parts of the SVG before
  // the folding analysis so output columns correspond to visible artwork.
  const activeRange = computeActiveRange(imageData, thresholds);
  const rawColumns = sliceColumns(imageData, columns, thresholds, activeRange);
  
  const pxToMm = resolvedBookHeightMm / canvasHeight;
  const enriched = normalizeSegments(rawColumns, pxToMm, canvasHeight);
  const balanced = balanceSegments(enriched);

  return {
    columns: balanced,
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
      activeRange: null,
      activeRange,
    }
  };
}

function calculateImageLayout(originalWidth, originalHeight, bookAspectRatio) {
  const imageAspectRatio = originalWidth / originalHeight;
  
  // Use original image height as reference, calculate canvas dimensions from it
  const canvasHeight = originalHeight;
  const canvasWidth = canvasHeight * bookAspectRatio;
  
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

export function balanceSegments(columns) {
  let segmentCursor = 0;
  return columns.map((col) => {
    if (!col.segments.length) {
      return col;
    }

    const index = col.segments.length === 1 ? 0 : Math.floor(segmentCursor) % col.segments.length;
    const selectedSegment = col.segments[index];
    segmentCursor += 1;

    return {
      ...col,
      segments: selectedSegment ? [selectedSegment] : [],
    };
  });
}
