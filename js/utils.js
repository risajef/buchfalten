/** Shared numeric and immutable-data helpers. */
export function clampNumber(value, min, max) {
  return Number.isFinite(value) ? Math.min(Math.max(value, min), max) : min;
}

export function clamp01(value) {
  return clampNumber(value, 0, 1);
}

export function formatMm(value) {
  return Number(value).toFixed(1);
}

export function deepFreeze(value) {
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object' && !Object.isFrozen(child)) deepFreeze(child);
  }
  return Object.freeze(value);
}
