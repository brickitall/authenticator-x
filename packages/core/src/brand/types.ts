/**
 * Shared shape for the generated catalogue and the matcher.
 *
 * Kept apart from both so the generated file and the code that consumes it do
 * not import each other in a circle.
 */
export interface BrandEntry {
  /** Lookup key, and the key for the artwork in the UI layer. */
  slug: string;
  /** How the service writes its own name. */
  name: string;
  /** Websites that identify it, used when an item records where it came from. */
  domains: string[];
  /** Other names the same service is issued under. */
  aliases: string[];
  /** The mark spells the name out, so it needs more of the tile. */
  wide?: boolean;
  /** Widely held, so suggestions rank it above a service that merely matches. */
  popular?: boolean;
}
