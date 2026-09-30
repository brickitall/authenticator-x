import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildManifest } from './manifest.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

const NAME = 'Authenticator X — 2FA Codes';
const DESCRIPTION =
  'Encrypted 2FA authenticator. Scan a QR code, get your TOTP codes in one click. Your secrets stay on your device.';

function run(command, args) {
  execFileSync(command, args, { cwd: root, stdio: 'inherit' });
}

rmSync(dist, { recursive: true, force: true });

console.log('\n▸ Building pages + service worker');
run('npx', ['vite', 'build']);

console.log('\n▸ Building content script');
run('npx', ['vite', 'build', '--config', 'vite.content.config.ts']);

console.log('\n▸ Writing manifest.json');
// The policy has to name the same origin the bundle was built against, or
// every sync call is blocked by the browser.
const syncOrigin = process.env.VITE_SYNC_API_URL
  ? new URL(process.env.VITE_SYNC_API_URL).origin
  : '';
if (syncOrigin) console.log(`  connect-src allows ${syncOrigin}`);
mkdirSync(dist, { recursive: true });
writeFileSync(
  resolve(dist, 'manifest.json'),
  `${JSON.stringify(
    buildManifest({ version: pkg.version, name: NAME, description: DESCRIPTION, syncOrigin }),
    null,
    2,
  )}\n`,
);

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
