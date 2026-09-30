import type { ScanSession } from '../lib/scan-session.js';
import { Callout } from './primitives.js';

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * Where a camera scan has got to, shown while the camera is still running.
 *
 * Two surfaces scan, and they mean different things by a scanned account.
 * Adding one stores it the moment its code is read, so it has been *added*,
 * and a repeat is one *already in your vault*. Importing collects everything
 * first and asks before storing any of it, so it has only been *found*, and a
 * repeat is one *already scanned* — saying "added" there would claim a write
 * that has not happened, and the user might close the tab believing it had.
 */
export function ScanProgress({ session, storing }: { session: ScanSession; storing: boolean }) {
  const { batch, added, skipped } = session;
  const verb = storing ? 'added' : 'found';
  const accounts = plural(added, 'account', 'accounts');
  return (
    <Callout tone="info">
      {batch
        ? `Code ${batch.seen.size} of ${batch.size} scanned — ${accounts} ${verb}. Show the next code.`
        : `${accounts} ${verb}.`}
      {skipped > 0 &&
        ` ${plural(skipped, 'was', 'were')} already ${storing ? 'in your vault' : 'scanned'}.`}
    </Callout>
  );
}
