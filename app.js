import { mountBuchfaltstudio } from './js/application.js';

export { mountBuchfaltstudio };

// Keep the module entry point used by the standalone page and existing site embed.
const root = document.getElementById('buchfaltstudio-root') || document.getElementById('buchfaltstudio-app');
if (root) mountBuchfaltstudio(root, { pdfFactory: () => window.jspdf?.jsPDF });
