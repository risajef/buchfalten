import vm from 'node:vm';
import { readFileSync } from 'node:fs';
export const CONFIG = vm.runInNewContext(readFileSync(new URL('../config.js', import.meta.url), 'utf8') + '; CONFIG');
globalThis.CONFIG = CONFIG;
