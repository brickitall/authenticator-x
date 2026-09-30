/**
 * Refuse to call a build a release if it breaks what the store reviewer checks
 * first. Run against `apps/extension/dist` after `npm run zip`.
 *
 * Two of the extension's permission invariants (see docs/architecture.md) are
 * only visible in the built manifest, so this is where they are enforced
 * rather than trusted:
 *
 * - No `host_permissions` and no declarative `content_scripts`. Ever. This is
 *   what keeps "read and change all your data on all websites" off the listing.
 * - `connect-src` names nothing but 'self'. True of every release until the
 *   sync server is deployed; the day it is, this check changes deliberately,
 *   together with the privacy-practices answers given to each store — not
 *   quietly because someone had VITE_SYNC_API_URL left in their shell.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const path = resolve(process.argv[2] ?? 'apps/extension/dist/manifest.json');
const manifest = JSON.parse(readFileSync(path, 'utf8'));
const failures = [];

if (manifest.host_permissions) {
  failures.push(`host_permissions declared: ${JSON.stringify(manifest.host_permissions)}`);
}
if (manifest.content_scripts) {
  failures.push('declarative content_scripts present; autofill must stay on activeTab');
}

const csp = manifest.content_security_policy?.extension_pages ?? '';
const connect = csp.match(/connect-src ([^;]+)/)?.[1]?.trim();
if (connect !== "'self'") {
  failures.push(`connect-src is "${connect ?? 'missing'}"; a release must reach nothing but itself`);
}

if (failures.length > 0) {
  console.error(`✗ ${path} is not a release build:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  `✓ ${manifest.name} ${manifest.version}: permissions ${JSON.stringify(manifest.permissions)}, connect-src 'self' only, no host permissions`,
);
