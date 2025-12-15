/**
 * Utility Functions Module
 * Common helper functions used across the application
 */

export function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

export function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function lerpPoint(a, b, t) {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

export function formatMm(value) {
  return Number(value).toFixed(1);
}
