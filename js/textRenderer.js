/**
 * Text Rendering Module
 * Handles text-to-image conversion for fold generation
 */

import { ensureFontLoaded, buildCanvasFontValue } from './fonts.js';

export async function createTextArtworkUrl(config) {
  const { text, fontFamily, fontSize, paddingPercent } = config;
  
  await ensureFontLoaded(fontFamily, fontSize);
  
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const fontDeclaration = buildCanvasFontValue(fontFamily, fontSize);
  
  ctx.font = fontDeclaration;
  const metrics = ctx.measureText(text);
  const ascent = metrics.actualBoundingBoxAscent || fontSize * 0.8;
  const descent = metrics.actualBoundingBoxDescent || fontSize * 0.2;
  const textWidth = Math.max(10, metrics.width);
  const padding = (paddingPercent / 100) * fontSize;
  
  const width = Math.ceil(textWidth + padding * 2);
  const height = Math.ceil(ascent + descent + padding * 2);
  canvas.width = width;
  canvas.height = height;

  const drawCtx = canvas.getContext("2d");
  drawCtx.fillStyle = "#fff";
  drawCtx.fillRect(0, 0, width, height);
  drawCtx.fillStyle = "#000";
  drawCtx.font = fontDeclaration;
  drawCtx.textAlign = "center";
  drawCtx.textBaseline = "alphabetic";
  drawCtx.fillText(text, width / 2, padding + ascent);

  return await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Unable to create artwork blob"));
        return;
      }
      resolve(URL.createObjectURL(blob));
    }, "image/png");
  });
}

export function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}
