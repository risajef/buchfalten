import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
const source = new URL('node_modules/jspdf/dist/jspdf.umd.min.js', root);
const destination = new URL('vendor/jspdf.umd.min.js', root);
const metadata = JSON.parse(await readFile(new URL('node_modules/jspdf/package.json', root)));
const bytes = await readFile(source);
await mkdir(new URL('vendor/', root), { recursive: true });
await copyFile(source, destination);
await copyFile(new URL('node_modules/jspdf/LICENSE', root), new URL('vendor/jspdf.LICENSE', root));
await writeFile(new URL('vendor/manifest.json', root), JSON.stringify({
  package: 'jspdf', version: metadata.version,
  sha256: createHash('sha256').update(bytes).digest('hex'),
}, null, 2) + '\n');
