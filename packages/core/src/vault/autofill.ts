import { matchBrand } from '../brand/registry.js';
import type { VaultItem } from './model.js';

/**
 * Where an account may be filled without anyone looking: the sites it records,
 * or — when it records none — its service's own domains from the catalogue.
 * Never the issuer guess that orders the popup's list: that guess is a
 * convenience, and a page that copied a service's name must not earn a code.
 */
function trustedDomains(item: VaultItem): readonly string[] {
  if (item.domains.length > 0) return item.domains;
  return matchBrand(item.issuer)?.domains ?? [];
}

function hostUnder(hostname: string, domains: readonly string[]): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, '');
  if (!host) return false;
  return domains.some((domain) => {
    const known = domain.toLowerCase().replace(/^www\./, '');
    return known.length > 0 && (host === known || host.endsWith(`.${known}`));
  });
}

/**
 * The one account a keyboard shortcut may fill on `hostname`, or null when a
 * person has to choose: nothing belongs to the site, more than one does, or
 * the one that does is a counter-based code, whose every use spends a step.
 *
 * Stricter than the popup on purpose. The popup shows what it is about to do
 * and warns before filling somewhere unexpected; a shortcut fills while the
 * eyes are elsewhere, so it fills only where it is certain.
 */
export function itemForShortcutFill(items: readonly VaultItem[], hostname: string | null): VaultItem | null {
  if (!hostname) return null;
  const candidates = items.filter((item) => item.deletedAt === null && hostUnder(hostname, trustedDomains(item)));
  if (candidates.length !== 1) return null;
  const [item] = candidates;
  return item!.type === 'totp' ? item! : null;
}
