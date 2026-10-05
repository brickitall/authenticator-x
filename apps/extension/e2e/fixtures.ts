import { test as base, chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const EXTENSION_PATH = resolve(import.meta.dirname, '../dist');
// Throwaway browser profiles stay inside the project rather than in the OS temp
// directory: nothing this repo does should leave anything behind on the machine.
const PROFILE_ROOT = resolve(import.meta.dirname, '../.tmp/profiles');

/**
 * Loads the built extension into a real Chromium.
 *
 * Extensions need a persistent context and the new headless mode; the old
 * headless shell cannot run them at all. Each test gets a throwaway profile so
 * one test's vault cannot leak into the next.
 */
/**
 * Launch one Chromium with the built extension loaded. Exported separately so a
 * test can run two at once — two profiles is the only honest way to test sync.
 */
export async function launchExtension(
  extraArgs: string[] = [],
  {
    colorScheme = 'light',
    deviceScaleFactor,
  }: { colorScheme?: 'light' | 'dark'; deviceScaleFactor?: number } = {},
) {
  mkdirSync(PROFILE_ROOT, { recursive: true });
  const profile = mkdtempSync(join(PROFILE_ROOT, 'chrome-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    colorScheme,
    // Store artwork is captured at 2x and laid out at 1x, so a popup set a
    // little smaller than life stays sharp.
    deviceScaleFactor,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      // Camera tests hand Chromium a synthetic capture device here.
      ...extraArgs,
    ],
  });

  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const extensionId = new URL(worker.url()).host;

  return {
    context,
    extensionId,
    worker,
    async close() {
      await context.close();
      rmSync(profile, { recursive: true, force: true });
    },
  };
}

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
  worker: Worker;
}>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    mkdirSync(PROFILE_ROOT, { recursive: true });
    const profile = mkdtempSync(join(PROFILE_ROOT, 'chrome-'));
    const context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium',
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });

    await use(context);
    await context.close();
    rmSync(profile, { recursive: true, force: true });
  },

  worker: async ({ context }, use) => {
    const existing = context.serviceWorkers()[0];
    await use(existing ?? (await context.waitForEvent('serviceworker')));
  },

  extensionId: async ({ worker }, use) => {
    // chrome-extension://<id>/background.js
    await use(new URL(worker.url()).host);
  },
});

export const expect = test.expect;

/** Open the popup as a normal tab; extension pages behave the same either way. */
export async function openPopup(context: BrowserContext, extensionId: string) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  return page;
}

export async function openOptions(context: BrowserContext, extensionId: string) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  return page;
}

export function base32Bytes(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of input) {
    value = (value << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Build a Google Authenticator export payload, protobuf wire format by hand. */
export function migrationUri(
  entries: { secret: string; name: string; issuer: string }[],
  batch: { size: number; index: number; id?: number } = { size: 1, index: 0 },
): string {
  const varint = (value: number): number[] => {
    const out: number[] = [];
    let rest = value;
    while (rest > 0x7f) {
      out.push((rest & 0x7f) | 0x80);
      rest = Math.floor(rest / 128);
    }
    out.push(rest);
    return out;
  };
  const tag = (field: number, wire: number) => varint((field << 3) | wire);
  const bytes = (field: number, value: Buffer | Uint8Array) => [
    ...tag(field, 2),
    ...varint(value.length),
    ...value,
  ];
  const str = (field: number, value: string) => bytes(field, Buffer.from(value, 'utf8'));
  const num = (field: number, value: number) => [...tag(field, 0), ...varint(value)];

  const body: number[] = [];
  for (const entry of entries) {
    const params = [
      ...bytes(1, base32Bytes(entry.secret)),
      ...str(2, entry.name),
      ...str(3, entry.issuer),
      ...num(4, 1), // SHA1
      ...num(5, 1), // six digits
      ...num(6, 2), // TOTP
    ];
    body.push(...tag(1, 2), ...varint(params.length), ...params);
  }
  body.push(...num(2, 1), ...num(3, batch.size), ...num(4, batch.index));
  if (batch.id !== undefined) body.push(...num(5, batch.id));

  return `otpauth-migration://offline?data=${encodeURIComponent(
    Buffer.from(body).toString('base64'),
  )}`;
}

export async function createDeviceVault(page: Page) {
  await page.getByRole('button', { name: /Just start/ }).click();
  await expect(page.getByText('No accounts yet')).toBeVisible();
}
