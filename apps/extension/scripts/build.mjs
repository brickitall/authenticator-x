import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildManifest } from './manifest.mjs';
import { EDGE_PUBLIC_KEY, PRODUCTION_SYNC_API_URL } from './release.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

const NAME = 'Authenticator X — 2FA Codes';
// The store's summary line, 132 characters at most. "Your secrets stay on
// your device" stopped being the whole truth when sync arrived.
const DESCRIPTION =
  'Encrypted 2FA authenticator. Scan a QR code, get your TOTP codes in one click. Optional sync, end-to-end encrypted.';

function run(command, args) {
  execFileSync(command, args, { cwd: root, stdio: 'inherit' });
}

const asEdge = process.argv.includes('--as-edge');
if (asEdge && process.argv.includes('--zip')) {
  throw new Error('--as-edge is for loading unpacked; a store upload must not carry a key.');
}

rmSync(dist, { recursive: true, force: true });

// The environment wins, including an empty value; otherwise the official
// server. Set here, once, so the bundle and the manifest's connect-src below
// cannot be built against two different answers.
const syncApiUrl = process.env.VITE_SYNC_API_URL ?? PRODUCTION_SYNC_API_URL;
process.env.VITE_SYNC_API_URL = syncApiUrl;
console.log(syncApiUrl ? `▸ Sync server: ${syncApiUrl}` : '▸ No sync server: account features off');

console.log('\n▸ Building pages + service worker');
run('npx', ['vite', 'build']);

console.log('\n▸ Building content script');
run('npx', ['vite', 'build', '--config', 'vite.content.config.ts']);

console.log('\n▸ Writing manifest.json');
// The policy has to name the same origin the bundle was built against, or
// every sync call is blocked by the browser.
const syncOrigin = syncApiUrl ? new URL(syncApiUrl).origin : '';
if (syncOrigin) console.log(`  connect-src allows ${syncOrigin}`);
mkdirSync(dist, { recursive: true });
const manifest = buildManifest({ version: pkg.version, name: NAME, description: DESCRIPTION, syncOrigin });
if (asEdge) {
  // Loads with the Edge listing's id, which the sync server accepts.
  manifest.key = EDGE_PUBLIC_KEY;
  console.log('  key: Edge listing (id lnbabkbknabedpnmdihllnbhdmolianm) — not for upload');
}
writeFileSync(resolve(dist, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

if (process.argv.includes('--zip')) {
  const releases = resolve(root, '../../release');
  mkdirSync(releases, { recursive: true });
  const archive = resolve(releases, `authenticator-x-${pkg.version}.zip`);
  rmSync(archive, { force: true });
  console.log(`\n▸ Packaging ${archive}`);
  // -X drops macOS resource forks, which the Web Store rejects as unexpected files.
  execFileSync('zip', ['-r', '-X', '-q', archive, '.'], { cwd: dist, stdio: 'inherit' });
  console.log(`\n✓ Upload this to the Chrome Web Store: ${archive}`);
} else {
  console.log(`\n✓ Load unpacked from: ${dist}`);
}
