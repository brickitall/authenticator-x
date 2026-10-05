import { createDeviceVault, expect, openPopup, test } from './fixtures.js';

/**
 * "Just get a code": a key in, a code out, and nothing kept. RFC 6238's test
 * key makes 287082 at T = 59 s in every implementation that is right.
 */
const RFC_KEY = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

test('a pasted key gives its code at once, and is kept nowhere', async ({ context, extensionId, worker }) => {
  const popup = await openPopup(context, extensionId);
  await createDeviceVault(popup);
  await popup.clock.setFixedTime(new Date(59_000));

  await popup.getByTitle('Add account').click();
  await popup.getByRole('button', { name: /Just get a code/ }).click();
  await popup.getByLabel('Setup key or otpauth:// link').fill('gezd gnbv gy3t qojq gezd gnbv gy3t qojq');
  await expect(popup.getByLabel('Current code')).toHaveText('287 082');

  // Nothing of the key reached storage, in any spelling — and no account was added.
  const stored = await worker.evaluate(async () => JSON.stringify(await chrome.storage.local.get(null)));
  const session = await worker.evaluate(async () => JSON.stringify(await chrome.storage.session.get(null)));
  for (const dump of [stored, session]) {
    expect(dump.toUpperCase()).not.toContain(RFC_KEY);
    expect(dump.toUpperCase()).not.toContain('GEZD GNBV');
  }
  await popup.getByRole('button', { name: 'Back' }).click();
  await popup.getByRole('button', { name: 'Back' }).click();
  await expect(popup.getByText('No accounts yet')).toBeVisible();
});

test('a quick code can still be kept, as an ordinary account', async ({ context, extensionId }) => {
  const popup = await openPopup(context, extensionId);
  await createDeviceVault(popup);
  await popup.getByTitle('Add account').click();
  await popup.getByRole('button', { name: /Just get a code/ }).click();
  await popup
    .getByLabel('Setup key or otpauth:// link')
    .fill(`otpauth://totp/GitHub:octocat%40example.com?secret=${RFC_KEY}&issuer=GitHub`);
  await expect(popup.getByText('GitHub · octocat@example.com')).toBeVisible();
  await popup.getByRole('button', { name: 'Save it as an account instead' }).click();
  await expect(popup.getByText('GitHub').first()).toBeVisible();
  await expect(popup.locator('.code-digits')).toHaveCount(1);
});
