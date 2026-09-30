/**
 * The fragment the popup puts on the Settings URL to send someone straight to
 * the camera scanner. One constant for the side that writes it and the side
 * that reads it, so the two cannot drift apart and leave the button opening a
 * page that ignores it.
 */
export const SCAN_FRAGMENT = '#scan';

/**
 * Whether this page was opened to scan — and if so, remove the fragment.
 *
 * Consuming it matters: left in the URL, a reload or a visit from history
 * would open the camera for someone who only came to change a setting.
 *
 * Call it once, at load, outside React. StrictMode runs state initialisers
 * twice in development, and the second run would find the fragment already
 * gone and answer no.
 */
export function takeScanRequest(): boolean {
  if (location.hash !== SCAN_FRAGMENT) return false;
  history.replaceState(null, '', location.pathname + location.search);
  return true;
}
