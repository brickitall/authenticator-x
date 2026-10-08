import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { launchExtension } from './fixtures.js';

/**
 * The extension in the browser's language, and in the one chosen in Settings.
 * Each check reads a page as its reader would: by the words on it.
 */
type Device = Awaited<ReturnType<typeof launchExtension>>;

async function open(device: Device, page: 'popup' | 'options'): Promise<Page> {
  const tab = await device.context.newPage();
  await tab.goto(`chrome-extension://${device.extensionId}/${page}.html`);
  return tab;
}

test('a German browser gets German, and the page says which language it is in', async () => {
  const device = await launchExtension([], { locale: 'de-DE' });
  try {
    const popup = await open(device, 'popup');
    await expect(popup.getByRole('button', { name: /Einfach loslegen/ })).toBeVisible();
    expect(await popup.evaluate(() => document.documentElement.lang)).toBe('de');
    await popup.getByRole('button', { name: /Einfach loslegen/ }).click();
    await expect(popup.getByText('Noch keine Konten')).toBeVisible();
    await expect(popup.getByPlaceholder('Konten durchsuchen')).toBeVisible();
  } finally {
    await device.close();
  }
});

test('a browser in a language the extension does not speak gets English', async () => {
  // Icelandic: Chrome has a store page in fifty-five languages and the
  // extension speaks fifty, so a language outside both is the honest test.
  const device = await launchExtension([], { locale: 'is-IS' });
  try {
    const popup = await open(device, 'popup');
    await expect(popup.getByRole('button', { name: /Just start/ })).toBeVisible();
  } finally {
    await device.close();
  }
});

test('Vietnam gets Vietnamese, and Portugal gets the Portuguese written for Brazil', async () => {
  for (const [locale, start] of [
    ['vi-VN', /Bắt đầu luôn/],
    ['pt-PT', /Começar já/],
  ] as const) {
    const device = await launchExtension([], { locale });
    try {
      const popup = await open(device, 'popup');
      await expect(popup.getByRole('button', { name: start })).toBeVisible();
    } finally {
      await device.close();
    }
  }
});

test('Arabic lays every page out right to left', async () => {
  const device = await launchExtension([], { locale: 'ar-EG' });
  try {
    const popup = await open(device, 'popup');
    await expect(popup.getByRole('button', { name: /ابدأ مباشرة/ })).toBeVisible();
    expect(await popup.evaluate(() => [document.documentElement.lang, document.documentElement.dir])).toEqual(['ar', 'rtl']);
    await popup.getByRole('button', { name: /ابدأ مباشرة/ }).click();
    await expect(popup.getByText('لا حسابات بعد')).toBeVisible();

    const options = await open(device, 'options');
    const nav = options.locator('aside nav');
    await expect(nav.getByRole('button', { name: 'الأمان', exact: true })).toBeVisible();
    // Mirrored, not only translated: the sidebar sits on the right of the page.
    const side = await options.locator('aside').boundingBox();
    const main = await options.locator('main').boundingBox();
    expect(side!.x).toBeGreaterThan(main!.x);
  } finally {
    await device.close();
  }
});

test('Taiwan gets Traditional Chinese', async () => {
  const device = await launchExtension([], { locale: 'zh-TW' });
  try {
    const popup = await open(device, 'popup');
    await expect(popup.getByRole('button', { name: /直接開始/ })).toBeVisible();
  } finally {
    await device.close();
  }
});

test('the language chosen in Settings reaches an open popup, and survives a reload', async () => {
  const device = await launchExtension();
  try {
    const popup = await open(device, 'popup');
    await popup.getByRole('button', { name: /Just start/ }).click();
    await expect(popup.getByText('No accounts yet')).toBeVisible();

    const options = await open(device, 'options');
    await options.getByRole('button', { name: 'General', exact: true }).click();
    await options.getByRole('combobox', { name: 'Language' }).selectOption({ label: '日本語' });

    // Settings changes as it is chosen, and the popup open beside it follows.
    await expect(options.getByRole('button', { name: 'セキュリティ' })).toBeVisible();
    await expect(popup.getByText('アカウントはまだありません')).toBeVisible();

    await popup.reload();
    await expect(popup.getByText('アカウントはまだありません')).toBeVisible();

    // And back to whatever the browser speaks.
    // Named in the language now showing.
    await expect(options.getByRole('combobox', { name: '言語' }).locator('option[value="auto"]')).toHaveText(
      'ブラウザの言語（English）',
    );
    await options.getByRole('combobox', { name: '言語' }).selectOption('auto');
    await expect(options.getByRole('button', { name: 'Security', exact: true })).toBeVisible();
  } finally {
    await device.close();
  }
});

test('a refusal from the service worker arrives in the page’s language', async () => {
  const device = await launchExtension([], { locale: 'fr-FR' });
  try {
    const popup = await open(device, 'popup');
    await popup.getByRole('button', { name: /Ajouter un mot de passe principal/ }).click();
    await popup.getByLabel('Mot de passe principal', { exact: true }).fill('un mot de passe assez long');
    await popup.getByLabel('Confirmer le mot de passe').fill('un mot de passe assez long');
    await popup.getByRole('button', { name: 'Créer mon coffre' }).click();
    await expect(popup.getByText('Aucun compte pour l’instant')).toBeVisible();

    await popup.getByRole('button', { name: 'Verrouiller maintenant' }).click();
    await popup.getByPlaceholder('Mot de passe principal').fill('pas le bon');
    await popup.getByRole('button', { name: 'Déverrouiller' }).click();
    await expect(popup.getByText('Mot de passe principal incorrect.')).toBeVisible();
  } finally {
    await device.close();
  }
});
