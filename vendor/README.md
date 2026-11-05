# Vendored PDF engine

The app imports this local jsPDF UMD bundle, which sets `globalThis.jspdf`.
It replaces the standalone CDN dependency and is also authoritative if an older
host happens to preload another jsPDF version.

Version and SHA-256 are recorded in `manifest.json`; the original license is
included. To update, change the exact `jspdf` devDependency, run `npm install`,
then `npm run sync-vendor` and both test commands. Commit the manifest, bundle,
license and package lock together. The runtime needs no npm installation.

Google Fonts remains an explicit runtime dependency for text mode. Font-family
requests go to Google; uploaded images and typed artwork are processed locally.
The font-loading adapter reports network failures and allows retries.
