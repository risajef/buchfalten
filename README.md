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
