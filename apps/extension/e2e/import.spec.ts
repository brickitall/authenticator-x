import { resolve } from 'node:path';
import { createDeviceVault, expect, openOptions, test } from './fixtures.js';

/**
 * Moving in from another app, through Settings: the real exports Aegis keeps
 * for its own importers, chosen as a person would choose them.
 */
const FIXTURES = resolve(import.meta.dirname, '../../../packages/core/test/fixtures/foreign');

test('an Aegis export comes in whole, and the Steam code it cannot use is said by name', async ({
  context,
  extensionId,
}) => {
  const options = await openOptions(context, extensionId);
  await createDeviceVault(options);
  await options.getByRole('button', { name: 'Backup', exact: true }).click();
  await options.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(options.getByText(/Exports from Aegis, 2FAS, Bitwarden/)).toBeVisible();

  await options.locator('input[type="file"]').setInputFiles(resolve(FIXTURES, 'aegis_plain.json'));
  await expect(options.getByText(/Found 6 new accounts, and 1 could not be read/)).toBeVisible();
  await options.getByText('Show the lines that failed').click();
  await expect(options.getByText(/Boeing: Sophia/)).toBeVisible();
  await expect(options.getByText(/Steam Guard codes cannot be imported yet/)).toBeVisible();
  await options.getByRole('button', { name: 'Import 6' }).click();

  await options.getByRole('button', { name: 'Accounts', exact: true }).click();
  for (const issuer of ['Deno', 'SPDX', 'Airbnb', 'Issuu', 'Air Canada', 'WWE']) {
    await expect(options.getByText(issuer, { exact: true })).toBeVisible();
  }
});

test('a locked 2FAS export asks for the password set in 2FAS, and a wrong one is said plainly', async ({
  context,
  extensionId,
}) => {
  const options = await openOptions(context, extensionId);
  await createDeviceVault(options);
  await options.getByRole('button', { name: 'Backup', exact: true }).click();
  await options.getByRole('button', { name: 'Import', exact: true }).click();

  await options.locator('input[type="file"]').setInputFiles(resolve(FIXTURES, '2fas_authenticator_encrypted_v4.2fas'));
  await expect(options.getByText('2FAS locked this export with a password. Enter the one you set there.')).toBeVisible();
  await options.getByLabel('Backup password').fill('not it');
  await options.getByRole('button', { name: 'Open backup' }).click();
  await expect(options.getByText('That password does not open this file.')).toBeVisible();

  await options.getByLabel('Backup password').fill('test');
  await options.getByRole('button', { name: 'Open backup' }).click();
  await expect(options.getByText(/Found 4 new accounts, and 1 could not be read/)).toBeVisible();
});

test('a password manager’s CSV gives up its two-factor keys only, and says to delete the file', async ({
  context,
  extensionId,
}) => {
  const options = await openOptions(context, extensionId);
  await createDeviceVault(options);
  await options.getByRole('button', { name: 'Backup', exact: true }).click();
  await options.getByRole('button', { name: 'Import', exact: true }).click();

  const csv = [
    'Title,URL,Username,Password,Notes,OTPAuth',
    'github.com (octocat),https://github.com/login,octocat,hunter2-not-kept,,otpauth://totp/GitHub:octocat?secret=JBSWY3DPEHPK3PXP&issuer=GitHub',
    'bank.example (me),https://bank.example,me,another-password,,',
  ].join('\n');
  await options.locator('input[type="file"]').setInputFiles({
    name: 'Passwords.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  });
  await expect(options.getByText(/This file holds your passwords in the clear/)).toBeVisible();
  await expect(options.getByText(/Found 1 new account/)).toBeVisible();
  await options.getByRole('button', { name: 'Import 1' }).click();

  // Nothing readable on disk holds the password from the same row.
  const stored = await options.evaluate(async () => JSON.stringify(await chrome.storage.local.get(null)));
  expect(stored).not.toContain('hunter2-not-kept');
  await options.getByRole('button', { name: 'Accounts', exact: true }).click();
  await expect(options.getByText('GitHub', { exact: true })).toBeVisible();
});
