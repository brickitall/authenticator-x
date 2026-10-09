import type { Page, Worker } from '@playwright/test';
import { createDeviceVault, expect, openOptions, openPopup, test } from './fixtures.js';

/**
 * Asking for a rating: only after real use, once, and the answer sticks. The
 * week of use is seeded straight into storage — the rule itself is unit-tested
 * in test/rating.test.ts; this is the popup obeying it.
 */

const SETUP_URI = 'otpauth://totp/GitHub:octocat@example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub';
const DAY = 24 * 60 * 60 * 1000;

async function addAccount(popup: Page) {
  await popup.getByTitle('Add account').click();
  await popup.getByRole('button', { name: /Enter a setup key manually/ }).click();
  await popup.getByLabel('Setup key').fill(SETUP_URI);
  await popup.locator('form').getByRole('button', { name: 'Add account' }).click();
  await expect(popup.getByRole('button', { name: 'Copy code' })).toBeVisible();
}

const stored = (worker: Worker) =>
  worker.evaluate(async () => (await chrome.storage.local.get('authx.rating'))['authx.rating']);

/** A week and a half of use, as if it had happened. */
const seedDue = (worker: Worker) =>
  worker.evaluate(
    (since) =>
      chrome.storage.local.set({
        'authx.rating': { firstUseAt: since, uses: 40, snoozes: 0, snoozedUntil: null, done: false },
      }),
    Date.now() - 10 * DAY,
  );

test('a new user is not asked, however many codes they copy', async ({ context, extensionId, worker }) => {
  const popup = await openPopup(context, extensionId);
  await createDeviceVault(popup);
  await addAccount(popup);

  for (let i = 1; i <= 20; i++) {
    await popup.getByTitle('Click to copy').click();
    await expect.poll(async () => (await stored(worker))?.uses).toBe(i);
  }

  await popup.reload();
  await expect(popup.getByText('GitHub').first()).toBeVisible();
  await expect(popup.getByRole('region', { name: 'Rate Keyrook Authenticator' })).toHaveCount(0);
});

test('after real use the popup asks once, and "Not now" is believed', async ({ context, extensionId, worker }) => {
  const popup = await openPopup(context, extensionId);
  await createDeviceVault(popup);
  await addAccount(popup);
  await seedDue(worker);

  await popup.reload();
  const prompt = popup.getByRole('region', { name: 'Rate Keyrook Authenticator' });
  await expect(prompt).toBeVisible();
  // The code comes first: the question sits under the list, not over it.
  await expect(popup.getByRole('button', { name: 'Copy code' })).toBeVisible();

  await prompt.getByRole('button', { name: 'Not now' }).click();
  await expect(prompt).toHaveCount(0);
  expect(await stored(worker)).toMatchObject({ snoozes: 1, done: false });

  await popup.reload();
  await expect(popup.getByText('GitHub').first()).toBeVisible();
  await expect(prompt).toHaveCount(0);
});

test('"Rate it" opens the listing and the question never comes back', async ({ context, extensionId, worker }) => {
  const popup = await openPopup(context, extensionId);
  await createDeviceVault(popup);
  await addAccount(popup);
  await seedDue(worker);
  await popup.reload();

  // The store itself is not this test's business, and a tab the extension
  // opens is beyond Playwright's routing: record where it would go instead.
  await popup.evaluate(() => {
    const opened: string[] = ((window as unknown as { opened: string[] }).opened = []);
    chrome.tabs.create = (async ({ url }: { url?: string }) => {
      opened.push(url ?? '');
      return {} as chrome.tabs.Tab;
    }) as typeof chrome.tabs.create;
    window.close = () => {};
  });
  await popup.getByRole('region', { name: 'Rate Keyrook Authenticator' }).getByRole('button', { name: 'Rate it' }).click();

  // An unpacked build in Chromium rates on the Chrome listing.
  await expect
    .poll(() => popup.evaluate(() => (window as unknown as { opened: string[] }).opened))
    .toEqual(['https://chromewebstore.google.com/detail/occcfljfhlijenkofoceocnimkfpdndl/reviews']);
  expect(await stored(worker)).toMatchObject({ done: true });

  const again = await openPopup(context, extensionId);
  await expect(again.getByText('GitHub').first()).toBeVisible();
  await expect(again.getByRole('region', { name: 'Rate Keyrook Authenticator' })).toHaveCount(0);
});

test('About offers the rating and a public place for problems, with a warning', async ({ context, extensionId }) => {
  const popup = await openPopup(context, extensionId);
  await createDeviceVault(popup);
  const options = await openOptions(context, extensionId);
  await options.getByRole('button', { name: 'General', exact: true }).click();

  await expect(options.getByRole('link', { name: 'Rate it' })).toHaveAttribute(
    'href',
    'https://chromewebstore.google.com/detail/occcfljfhlijenkofoceocnimkfpdndl/reviews',
  );
  await expect(options.getByRole('link', { name: 'Open an issue' })).toHaveAttribute(
    'href',
    'https://github.com/keyrook/keyrook-authenticator/issues/new',
  );
  await expect(options.getByText(/Never paste a setup key/)).toBeVisible();
});
