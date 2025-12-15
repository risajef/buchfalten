# Buchfaltstudio

Book folding pattern generator - Create beautiful folded book art with precision.

## Features

- **Text Mode**: Enter text and automatically generate foldable artwork using Google Fonts
- **Image Mode**: Upload SVG, PNG, JPEG, GIF, or WebP images


### Application Flow

1. User enters text or uploads an image
2. Image is scaled to fit physical book dimensions (width = pages × 0.25mm, height = parameter)
3. Image is analyzed to detect dark regions and slice into columns
4. Segments are normalized to millimeter measurements
5. Book preview is rendered showing fold positions
6. PDF is automatically generated with detailed fold instructions

## Running the Development Server

```bash
# Using Python 3
python3 -m http.server 8000

# Or Python 2
python -m SimpleHTTPServer 8000
```

Then open `http://localhost:8000` in your browser.

**Note:** Do not open `index.html` directly in the browser - you will get CORS errors. Always use a local web server.

## Credits

Built with:
- [jsPDF](https://github.com/parallax/jsPDF) for PDF generation
- [Google Fonts](https://fonts.google.com/) for text rendering
- Vanilla JavaScript for maximum performance and minimal dependencies
