// Buchfaltstudio Configuration
// All constants and default values for the application

const CONFIG = {
  // Physical book properties
  PAGE_THICKNESS_MM: 0.25, // Each folded page thickness in millimeters
  MAX_HEIGHT_TO_WIDTH_RATIO: 0.5, // Maximum height is 50% of book width
  
  // Text rendering defaults
  TEXT: {
    MAX_LENGTH: 32,
    FONT_SIZE: {
      DEFAULT: 160,
      MIN: 60,
      MAX: 240
    },
    PADDING_PERCENT: {
      DEFAULT: 18,
      MIN: 5,
      MAX: 40
    },
    DEFAULT_FONT: "Playfair Display",
    SUGGESTED_FONTS: [
      "Playfair Display",
      "Montserrat",
      "Abril Fatface",
      "Raleway",
      "Space Grotesk",
      "Caveat Brush",
      "Caveat"
    ]
  },
  
  // Image analysis defaults
  ANALYSIS: {
    DARK_THRESHOLD: {
      DEFAULT: 235,
      MIN: 0,
      MAX: 255
    },
    ALPHA_THRESHOLD: {
      DEFAULT: 40,
      MIN: 0,
      MAX: 255
    }
  },
  
  // Page/column settings
  PAGES: {
    MIN: 10,
    DEFAULT: 250,
    MAX: 1200
  },
  
  // Book height settings (in mm)
  HEIGHT: {
    MIN: 80,
    DEFAULT: 210,
    MAX: 400
  },
  
  // Auto-render delays (in ms)
  DEBOUNCE: {
    TEXT_INPUT: 350,
    SETTINGS_CHANGE: 0,
    AUTO_ANALYSIS: 500
  },
  
  // Font loading
  FONT: {
    PROBE_TEXT: "WEei1234567890",
    LOAD_TIMEOUT: 4000 // milliseconds
  },
  
  // File types
  ACCEPTED_IMAGE_TYPES: [
    "image/svg+xml",
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/gif",
    "image/webp"
  ],
  
  // Canvas dimensions
  CANVAS: {
    BOOK_PREVIEW_WIDTH: 600,
    BOOK_PREVIEW_HEIGHT: 380
  }
};

// Make config immutable
Object.freeze(CONFIG);
Object.freeze(CONFIG.TEXT);
Object.freeze(CONFIG.TEXT.FONT_SIZE);
Object.freeze(CONFIG.TEXT.PADDING_PERCENT);
Object.freeze(CONFIG.ANALYSIS);
Object.freeze(CONFIG.ANALYSIS.DARK_THRESHOLD);
Object.freeze(CONFIG.ANALYSIS.ALPHA_THRESHOLD);
Object.freeze(CONFIG.PAGES);
Object.freeze(CONFIG.HEIGHT);
Object.freeze(CONFIG.DEBOUNCE);
Object.freeze(CONFIG.FONT);
Object.freeze(CONFIG.CANVAS);
