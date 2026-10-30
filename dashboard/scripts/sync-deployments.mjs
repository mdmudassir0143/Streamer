// Copies ../deployments/<chainId>.json (all chains) and the generated ABI into src/generated
// so the app can import them at build time. Missing files produce empty stubs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const depDir = path.resolve(root, '..', 'deployments');
const outDir = path.resolve(root, 'src', 'generated');
fs.mkdirSync(outDir, { recursive: true });

const chains = [31337, 133, 177];
const all = {};
for (const id of chains) {
  const f = path.join(depDir, `${id}.json`);
  if (fs.existsSync(f)) {
    try {
      all[id] = JSON.parse(fs.readFileSync(f, 'utf8'));
      console.log(`[sync] deployments/${id}.json`);
    } catch (e) {
      console.warn(`[sync] could not parse ${f}: ${e.message}`);
    }
  }
}
fs.writeFileSync(path.join(outDir, 'deployments.json'), JSON.stringify(all, null, 2));

let abi = null;
const abiFile = path.join(depDir, 'abi', 'StreamVault.json');
if (fs.existsSync(abiFile)) {
  try {
    const j = JSON.parse(fs.readFileSync(abiFile, 'utf8'));
    abi = Array.isArray(j) ? j : j.abi ?? null;
    if (abi) console.log('[sync] deployments/abi/StreamVault.json');
  } catch (e) {
    console.warn(`[sync] could not parse ABI: ${e.message}`);
  }
}
fs.writeFileSync(path.join(outDir, 'StreamVault.abi.json'), JSON.stringify(abi));
