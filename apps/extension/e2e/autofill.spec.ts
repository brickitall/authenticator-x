import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

/**
 * Exercises the *built* content script against real pages.
 *
 * Playwright cannot click the browser action, and activeTab is only granted by
 * that click — so the script is injected the way Chrome would and driven
 * through a stubbed `chrome.runtime`. The DOM, the CSS, the visibility checks
 * and the value-setting are all real, which is where the bugs live.
 */
const require = createRequire(import.meta.url);
const CONTENT_SCRIPT = resolve(import.meta.dirname, '../dist/content.js');
// React's exports map hides the UMD build, so resolve the package root and
// reach into it directly.
const REACT = resolve(
  dirname(require.resolve('react/package.json')),
  'umd/react.production.min.js',
);
const REACT_DOM = resolve(
  dirname(require.resolve('react-dom/package.json')),
  'umd/react-dom.production.min.js',
);

async function arm(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { chrome: unknown }).chrome = {
      runtime: {
        id: 'test-extension',
        onMessage: {
          addListener: (fn: unknown) => {
            (window as unknown as { __listener: unknown }).__listener = fn;
          },
        },
      },
    };
  });
  await page.addScriptTag({ path: CONTENT_SCRIPT });
}

interface Detection {
  found: boolean;
  count: number;
}

function drive(page: Page, message: Record<string, unknown>): Promise<Detection> {
  return page.evaluate((msg) => {
    const listener = (window as unknown as { __listener: (...args: unknown[]) => unknown })
      .__listener;
    let response: Detection = { found: false, count: 0 };
    listener(msg, { id: 'test-extension' }, (value: Detection) => {
      response = value;
    });
    return response;
  }, message);
}

const detect = (page: Page) => drive(page, { type: 'authx/detect' });
const fill = (page: Page, code: string) => drive(page, { type: 'authx/fill', code });

test('fills a field marked autocomplete="one-time-code"', async ({ context }) => {
  const page = await context.newPage();
  await page.setContent(`
    <form>
      <label for="code">Verification code</label>
      <input id="code" autocomplete="one-time-code" />
      <button type="submit">Verify</button>
    </form>
  `);
  await arm(page);

  expect(await detect(page)).toEqual({ found: true, count: 1 });
  expect(await fill(page, '123456')).toEqual({ found: true, count: 1 });
  await expect(page.locator('#code')).toHaveValue('123456');
});

test('spreads a code across split single-digit boxes', async ({ context }) => {
  const page = await context.newPage();
  await page.setContent(`
    <div>
      ${Array.from(
        { length: 6 },
        (_, index) => `<input id="d${index}" maxlength="1" inputmode="numeric" />`,
      ).join('')}
    </div>
  `);
  await arm(page);

  expect(await detect(page)).toEqual({ found: true, count: 6 });
  await fill(page, '482915');

  for (const [index, digit] of [...'482915'].entries()) {
    await expect(page.locator(`#d${index}`)).toHaveValue(digit);
  }
});

test('picks the code field and leaves other short inputs alone', async ({ context }) => {
  const page = await context.newPage();
  await page.setContent(`
    <form>
      <input name="zip" placeholder="ZIP code" />
      <input name="otp" placeholder="One-time password" />
      <input name="card_cvv" placeholder="CVV" />
    </form>
  `);
  await arm(page);

  expect(await detect(page)).toEqual({ found: true, count: 1 });
  await fill(page, '654321');

  await expect(page.locator('[name="otp"]')).toHaveValue('654321');
  await expect(page.locator('[name="zip"]')).toHaveValue('');
  await expect(page.locator('[name="card_cvv"]')).toHaveValue('');
});

test('reports nothing on a page with no code field', async ({ context }) => {
  const page = await context.newPage();
  await page.setContent(`
    <form>
      <input type="search" name="q" placeholder="Search" />
      <input type="email" name="email" placeholder="Email" />
    </form>
  `);
  await arm(page);

  expect(await detect(page)).toEqual({ found: false, count: 0 });
  expect(await fill(page, '111111')).toEqual({ found: false, count: 0 });
});

test('ignores a hidden code field', async ({ context }) => {
  const page = await context.newPage();
  await page.setContent(`
    <input name="otp" style="display:none" />
    <input name="honeypot_otp" style="visibility:hidden" />
  `);
  await arm(page);

  expect(await detect(page)).toEqual({ found: false, count: 0 });
});

test('a React-controlled input actually receives the value', async ({ context }) => {
  const page = await context.newPage();
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ path: REACT });
  await page.addScriptTag({ path: REACT_DOM });

  // Assigning input.value directly is invisible to React — it compares against
  // its own value tracker and drops the change. This asserts the content
  // script's prototype-setter path keeps controlled components in sync, which
  // is the difference between a code that looks filled and one that submits.
  await page.evaluate(() => {
    const react = (window as unknown as { React: any }).React;
    const { useState, createElement: h } = react;

    function Form() {
      const [code, setCode] = useState('');
      return h('div', null, [
        h('input', {
          key: 'input',
          autoComplete: 'one-time-code',
          value: code,
          onChange: (event: any) => setCode(event.target.value),
        }),
        h('p', { key: 'state', id: 'state' }, `React sees: ${code}`),
      ]);
    }

    (window as unknown as { ReactDOM: any }).ReactDOM.createRoot(
      document.getElementById('root'),
    ).render(h(Form));
  });
  await expect(page.locator('#state')).toHaveText('React sees:');

  await arm(page);
  await fill(page, '246810');

  await expect(page.locator('#state')).toHaveText('React sees: 246810');
  await expect(page.locator('input')).toHaveValue('246810');
});
