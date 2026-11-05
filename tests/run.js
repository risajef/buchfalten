import { readdir } from 'node:fs/promises';
// Run in this process so restricted environments need no test worker subprocesses.
for (const file of (await readdir(new URL('.', import.meta.url))).filter(f => f.endsWith('.test.js')).sort()) {
  await import(new URL(file, import.meta.url));
}
