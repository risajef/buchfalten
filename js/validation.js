/** Validate at the domain boundary, including automatic submissions. */
export function validateAnalysisOptions({ columns, bookHeight, darkThreshold, alphaThreshold }) {
  if (!Number.isInteger(columns) || columns < CONFIG.PAGES.MIN || columns > CONFIG.PAGES.MAX) {
    throw new Error(`Spaltenanzahl: ganze Zahl von ${CONFIG.PAGES.MIN} bis ${CONFIG.PAGES.MAX}.`);
  }
  if (!Number.isFinite(bookHeight) || bookHeight < CONFIG.HEIGHT.MIN || bookHeight > CONFIG.HEIGHT.MAX) {
    throw new Error(`Buchhöhe: ${CONFIG.HEIGHT.MIN} bis ${CONFIG.HEIGHT.MAX} mm.`);
  }
  for (const value of [darkThreshold, alphaThreshold]) {
    if (!Number.isInteger(value) || value < 0 || value > 255) {
      throw new Error('Bildschwellen müssen ganze Zahlen von 0 bis 255 sein.');
    }
  }
}

export function validateImageFile(file) {
  if (!CONFIG.ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    throw new Error('Bitte SVG, PNG, JPEG, GIF oder WebP auswählen.');
  }
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > CONFIG.LIMITS.MAX_FILE_BYTES) {
    throw new Error('Die Bilddatei muss zwischen 1 Byte und 10 MB gross sein.');
  }
}
