# Buchfaltstudio

Book folding pattern generator - Create beautiful folded book art with precision.

## Features

- **Text Mode**: Enter text and automatically generate foldable artwork using Google Fonts
- **Image Mode**: Upload SVG, PNG, JPEG, GIF, or WebP images


### Application Flow

1. User enters text or uploads an image
2. Image is scaled to fit physical book dimensions (width = foldable leaves × selected folded-leaf width (default 1 mm), height = parameter)
3. Image is analyzed to detect dark regions and slice into columns
4. Segments are normalized to millimeter measurements
5. Book preview is rendered showing fold positions
6. PDF is automatically generated with detailed fold instructions

## Running the Development Server

```bash
# Using Python 3
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

**Note:** Do not open `index.html` directly in the browser - you will get CORS errors. Always use a local web server.

## Credits

Built with:
- [jsPDF](https://github.com/parallax/jsPDF) for PDF generation
- [Google Fonts](https://fonts.google.com/) for text rendering
- Vanilla JavaScript for maximum performance and minimal dependencies

## Physical model and detail allocation

The count means **foldable leaves / output columns**, not printed page numbers. A leaf
has two printed sides. The default effective width per folded leaf remains 1 mm;
measure your folded book and change that setting to calibrate its width. This is a
planning parameter, not a claim about the thickness of raw paper.

Artwork is contained within the complete book rectangle without stretching it.
Blank leaves remain in the preview, PDF diagrams and measurement table with the
same indices. Positions are measured from the upper book edge.

One interval is assigned per leaf. When several dark bands occur in a column, the
existing alternating allocation remains the default: a cursor advances through
nonempty columns and selects cursor modulo band count. This loses detail. The UI
and PDF report the number of omitted bands; the alternate policy stops instead of
producing a lossy plan. Detected bands remain in the immutable plan for inspection.
Preview and export consume the same selected intervals and original column indices.

For tall books the PDF may contain scaled schematic diagrams. Use its exact
millimeter table; do not measure a schematic directly. True-size diagrams require
100% printing and verification of the 50 mm calibration line.

## Modules and embedding

`app.js` is a small compatibility bootstrap for the standalone root
`buchfaltstudio-app` and the existing parent-site root `buchfaltstudio-root`.
The previous `main.js` implementation has been removed. `config.js` remains a
harmless compatibility entry for hosts that still load it as a classic script;
all active modules import the deeply frozen configuration from `js/config.js`.

For a custom host, provide the app markup inside a root and mount it explicitly:

```js
import { mountBuchfaltstudio } from './js/application.js';
const app = mountBuchfaltstudio(root, { pdfFactory: () => window.jspdf?.jsPDF });
// Before removing the markup:
app.destroy();
```

Mounting the same root again disposes its previous instance. Listeners, analysis
jobs, timers and artwork/PDF object URLs belong to the mounted instance. Analysis
accepts its canvas explicitly, and PDF export accepts its jsPDF constructor.

## Regression checks

Requires Node 22 or newer. Run `npm ci`, then `npm test` for deterministic controller,
geometry, font-loading and PDF-layout checks. `npm run test:browser` runs Chromium
against a temporary local server and checks real canvas analysis, font loading,
mode changes, validation, stale exports and actual PDF blobs. Its font/PDF network
requests use local fixtures, so external service availability does not affect it.
The browser check uses the DejaVu Sans font from a standard Linux installation;
set `BUCHFALTEN_TEST_FONT` to a local TrueType font path on another platform.

The subrepo's GitHub Actions workflow runs both checks on pushes and pull requests.
