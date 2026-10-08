import type { BrowserContext, Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import QRCode from 'qrcode';
import {
  createDeviceVault,
  expect,
  launchExtension,
  migrationUri,
  openOptions,
  openPopup,
  test,
} from './fixtures.js';

/**
 * The camera scanner, against a camera Chromium invents for us.
 *
 * `--use-file-for-fake-video-capture` takes a raw Y4M file and replays it as a
 * webcam, looping. Writing one by hand is a few lines and buys a test that
 * exercises the real path — getUserMedia, a real `<video>`, a real canvas read,
 * the real decoder — rather than a mock of it. A stubbed `getUserMedia` would
 * have passed just as happily while the feature was broken.
 *
 * Generated assets stay in the project's own gitignored .tmp, like the browser
 * profiles do; nothing here writes outside the repo.
 */
const FIXTURE_DIR = resolve(import.meta.dirname, '../.tmp/camera');

const SECRET = 'JBSWY3DPEHPK3PXP';

const WIDTH = 640;
const HEIGHT = 480;

/** The luma plane of one frame showing `text` as a QR code. */
function lumaWithQr(text: string, width = WIDTH, height = HEIGHT): Buffer {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'L' });
  const size = qr.modules.size;
  const data = qr.modules.data;

  // Leave a generous quiet zone: a detector needs light around the finder
  // patterns, and a real camera would never frame it edge to edge either.
  const scale = Math.floor((Math.min(width, height) * 0.7) / size);
  const drawn = scale * size;
  const left = Math.floor((width - drawn) / 2);
  const top = Math.floor((height - drawn) / 2);

  const luma = Buffer.alloc(width * height, 0xff);
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (!data[row * size + column]) continue;
      for (let y = 0; y < scale; y += 1) {
        const start = (top + row * scale + y) * width + left + column * scale;
        luma.fill(0x00, start, start + scale);
      }
    }
  }

  return luma;
}

/**
 * A Y4M that shows each code in turn, then loops.
 *
 * Y4M is a header, then `FRAME\n` and three planes per frame. In 4:2:0 the
 * chroma planes are quarter size, and a fixed 128 in both is exactly grey — so
 * a black-and-white QR needs only the luma plane to say anything.
 *
 * Several codes in sequence is what a Google Authenticator export looks like
 * from the camera's side: the user shows part one, taps next, shows part two.
 * Chromium loops the file, so each code comes round again and again — which is
 * also what a code held in view does, and exactly the repetition the scanner
 * has to tell apart from new work.
 */
function y4m(texts: string[], framesEach = 10): Buffer {
  const chroma = Buffer.alloc((WIDTH / 2) * (HEIGHT / 2), 0x80);
  const frame = Buffer.from('FRAME\n');
  const parts = [Buffer.from(`YUV4MPEG2 W${WIDTH} H${HEIGHT} F30:1 Ip A1:1 C420mpeg2\n`)];
  for (const text of texts) {
    const luma = lumaWithQr(text);
    for (let i = 0; i < framesEach; i += 1) parts.push(frame, luma, chroma, chroma);
  }
  return Buffer.concat(parts);
}

function fakeCamera(codes: string | string[], name: string): string[] {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  const file = join(FIXTURE_DIR, `${name}.y4m`);
  writeFileSync(file, y4m(([] as string[]).concat(codes)));
  return [
    '--use-fake-device-for-media-stream',
    // Grants the camera without a prompt. The prompt itself is Chrome's, not
    // ours, and is not what this is testing.
    '--use-fake-ui-for-media-stream',
    `--use-file-for-fake-video-capture=${file}`,
  ];
}

/**
 * What a webcam actually delivers when a phone is held up to it, as opposed to
 * the pristine codes above.
 *
 * The codes above are a few dozen modules, drawn black on white at 8 px a
 * module. Every reader passes them, which is exactly why they were not enough:
 * the scanner shipped with them green and failed on the first real export it
 * was shown. A Google Authenticator export packs up to ten accounts into a
 * code of 117 modules a side, and the camera sees it through a phone's
 * contrast, a fixed-focus lens's softness and sensor noise.
 *
 * `ppm` is pixels per module. 3.5 is about what a 720p webcam gives an export
 * held at the closest distance it stays sharp.
 */
function webcamY4m(
  texts: string[],
  { width = 1280, height = 720, ppm = 3.5, framesEach = 6 } = {},
): Buffer {
  const dark = 45;
  const light = 205;
  const quiet = 4;
  let seed = 11;
  const random = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

  const chroma = Buffer.alloc((width / 2) * (height / 2), 0x80);
  const header = Buffer.from(`YUV4MPEG2 W${width} H${height} F30:1 Ip A1:1 C420mpeg2\n`);
  const parts = [header];

  for (const text of texts) {
    const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
    const n = qr.modules.size;
    const side = Math.ceil((n + 2 * quiet) * ppm);
    const left = Math.floor((width - side) / 2);
    const top = Math.floor((height - side) / 2);
    const dark_at = (x: number, y: number) => {
      const mx = Math.floor(x) - quiet;
      const my = Math.floor(y) - quiet;
      return mx >= 0 && my >= 0 && mx < n && my < n && qr.modules.data[my * n + mx] ? 1 : 0;
    };

    // Resample at a fractional scale, averaging four points per pixel the way
    // a sensor pixel integrates whatever falls on it.
    const sharp = new Float32Array(width * height).fill(light);
    for (let py = 0; py < side; py += 1) {
      for (let px = 0; px < side; px += 1) {
        let cover = 0;
        for (const sy of [0.25, 0.75]) for (const sx of [0.25, 0.75]) cover += dark_at((px + sx) / ppm, (py + sy) / ppm);
        sharp[(top + py) * width + left + px] = light - (light - dark) * (cover / 4);
      }
    }
    // A fixed-focus lens up close: one pass of a 3×3 blur.
    const soft = new Float32Array(width * height).fill(light);
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        let sum = 0;
        for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) sum += sharp[(y + dy) * width + x + dx]!;
        soft[y * width + x] = sum / 9;
      }
    }
    // Fresh sensor noise every frame, as a real one has.
    for (let f = 0; f < framesEach; f += 1) {
      const luma = Buffer.alloc(width * height);
      for (let i = 0; i < luma.length; i += 1) {
        luma[i] = Math.max(0, Math.min(255, Math.round(soft[i]! + (random() - 0.5) * 28)));
      }
      parts.push(Buffer.from('FRAME\n'), luma, chroma, chroma);
    }
  }
  return Buffer.concat(parts);
}

function fakeWebcam(codes: string[], name: string): string[] {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  const file = join(FIXTURE_DIR, `${name}.y4m`);
  writeFileSync(file, webcamY4m(codes));
  return [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    `--use-file-for-fake-video-capture=${file}`,
  ];
}

/**
 * A full export read through a webcam depends on Chrome's own QR reader, which
 * Chrome ships on macOS, ChromeOS and Android but not on Windows or Linux — and
 * CI runs on Linux. Without it the scanner falls back to jsQR, which cannot
 * read a code that dense through a webcam's blur and noise (qr.ts has the
 * numbers). There the test would only fail for the platform it happens to run
 * on, so it stands down and says why, where a report will show it.
 *
 * This is a limit of the product, not of the test: a Windows user holding a
 * full export up to a webcam hits it too. Uploading a screenshot is the way
 * round it there — a clean image of the same code reads with jsQR.
 */
async function requireNativeReader(page: Page): Promise<void> {
  const native = await page.evaluate(async () => {
    const Reader = (window as unknown as { BarcodeDetector?: { getSupportedFormats(): Promise<string[]> } })
      .BarcodeDetector;
    return Reader ? (await Reader.getSupportedFormats()).includes('qr_code') : false;
  });
  test.skip(
    !native,
    'No native QR reader in this Chrome (Windows/Linux). jsQR alone cannot read a full export through a webcam.',
  );
}

/** Stand in for Chrome on Windows or Linux, which ships no native QR reader. */
async function withoutNativeReader(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    delete (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector;
  });
}

/**
 * What a phone's screenshot of an export code is to a QR reader: the code,
 * clean, at the size a phone draws it. No blur, no noise — which is the whole
 * reason it reads where a webcam's view of the same code does not.
 */
async function screenshotsOf(codes: string[]) {
  return Promise.all(
    codes.map(async (code, i) => ({
      name: `IMG_${2401 + i}.PNG`,
      mimeType: 'image/png',
      buffer: await QRCode.toBuffer(code, { errorCorrectionLevel: 'M', width: 900, margin: 4 }),
    })),
  );
}

/** A distinct, valid base32 secret per account, the length Google issues. */
function secretFor(i: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let out = '';
  let value = i * 2654435761 + 97;
  for (let k = 0; k < 32; k += 1) {
    value = (value * 1103515245 + 12345) & 0x7fffffff;
    out += alphabet[value % 32];
  }
  return out;
}

/** An export as Google Authenticator makes it: `codes` codes of `perCode` accounts. */
function fullExport(codes: number, perCode: number, id: number): { codes: string[]; issuers: string[] } {
  const issuers: string[] = [];
  const out: string[] = [];
  for (let c = 0; c < codes; c += 1) {
    const entries = [];
    for (let a = 0; a < perCode; a += 1) {
      const i = c * perCode + a;
      const issuer = `Service${String(i + 1).padStart(2, '0')}`;
      issuers.push(issuer);
      entries.push({ secret: secretFor(i), name: `nguyen.van.a${i}@gmail.com`, issuer });
    }
    out.push(migrationUri(entries, { size: codes, index: c, id }));
  }
  return { codes: out, issuers };
}

test('a QR held up to the camera adds the account', async () => {
  const uri = `otpauth://totp/Alpha:alice@example.com?secret=${SECRET}&issuer=Alpha`;
  const extension = await launchExtension(fakeCamera(uri, 'single'));

  try {
    const options = await openOptions(extension.context, extension.extensionId);
    await createDeviceVault(options);

    await options.getByRole('button', { name: 'Add account' }).first().click();
    await options.getByRole('button', { name: /Scan with your camera/ }).click();

    // The scanner polls frames; the account appearing is the whole assertion.
    await expect(options.getByText('Alpha').first()).toBeVisible({ timeout: 20_000 });
    await expect(options.getByText('alice@example.com').first()).toBeVisible();
  } finally {
    await extension.close();
  }
});

test('a Google Authenticator export held up to the camera brings every account', async () => {
  const uri = migrationUri([{ secret: SECRET, name: 'bob@example.com', issuer: 'Beta' }]);
  const extension = await launchExtension(fakeCamera(uri, 'migration'));

  try {
    const options = await openOptions(extension.context, extension.extensionId);
    await createDeviceVault(options);

    await options.getByRole('button', { name: 'Add account' }).first().click();
    await options.getByRole('button', { name: /Scan with your camera/ }).click();

    await expect(options.getByText('Beta').first()).toBeVisible({ timeout: 20_000 });
  } finally {
    await extension.close();
  }
});

/**
 * The claim on the scanner's own face is that the picture is not kept and not
 * sent. The second half is structural — `connect-src 'self'` — so this is the
 * half that a mistake could actually break: the camera must be released the
 * moment the scanner goes away, not whenever garbage collection notices.
 */
test('leaving the scanner releases the camera', async () => {
  const uri = `otpauth://totp/Gamma:me@example.com?secret=${SECRET}&issuer=Gamma`;
  const extension = await launchExtension(fakeCamera(uri, 'release'));

  try {
    const options = await openOptions(extension.context, extension.extensionId);
    await createDeviceVault(options);

    // Count every track the page ever opens, and watch them being stopped.
    await options.evaluate(() => {
      const opened: MediaStreamTrack[] = [];
      (window as unknown as { __tracks: MediaStreamTrack[] }).__tracks = opened;
      const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        const stream = await real(constraints);
        opened.push(...stream.getTracks());
        return stream;
      };
    });

    await options.getByRole('button', { name: 'Add account' }).first().click();
    await options.getByRole('button', { name: /Scan with your camera/ }).click();

    await expect
      .poll(
        () =>
          options.evaluate(
            () => (window as unknown as { __tracks: MediaStreamTrack[] }).__tracks.length,
          ),
        { timeout: 20_000 },
      )
      .toBeGreaterThan(0);

    // The account lands, which unmounts the scanner.
    await expect(options.getByText('Gamma').first()).toBeVisible({ timeout: 20_000 });

    await expect
      .poll(
        () =>
          options.evaluate(() =>
            (window as unknown as { __tracks: MediaStreamTrack[] }).__tracks.every(
              (track) => track.readyState === 'ended',
            ),
          ),
        { timeout: 10_000 },
      )
      .toBe(true);
  } finally {
    await extension.close();
  }
});

test('a Google Authenticator export spread over several codes comes across in one sitting', async () => {
  // Three codes of one export, each carrying one account, shown in a loop.
  const id = 20260923;
  const codes = [
    migrationUri([{ secret: SECRET, name: 'kilo@example.com', issuer: 'Kilo' }], { size: 3, index: 0, id }),
    migrationUri([{ secret: 'MZXW6YTBOI', name: 'lima@example.com', issuer: 'Lima' }], { size: 3, index: 1, id }),
    migrationUri([{ secret: 'GEZDGNBVGY3TQOJQ', name: 'mike@example.com', issuer: 'Mike' }], {
      size: 3,
      index: 2,
      id,
    }),
  ];
  const extension = await launchExtension(fakeCamera(codes, 'batch'));

  try {
    const options = await openOptions(extension.context, extension.extensionId);
    await createDeviceVault(options);

    await options.getByRole('button', { name: 'Add account' }).first().click();
    await options.getByRole('button', { name: /Scan with your camera/ }).click();

    // The scanner stays open between codes and says when it has them all.
    const summary = options.getByText(/All 3 codes scanned/);
    await expect(summary).toBeVisible({ timeout: 30_000 });
    // All of it, not a prefix. The vault was empty, so any "already in your
    // vault" here would be the loop's repeats miscounted as duplicates — the
    // accounts would come out right and the summary would still be a lie.
    await expect(summary).toHaveText('All 3 codes scanned. 3 accounts added.');
    await options.getByRole('button', { name: 'Done' }).click();

    for (const issuer of ['Kilo', 'Lima', 'Mike']) {
      await expect(options.getByText(issuer).first()).toBeVisible();
    }
    // Every code was decoded many times over while it looped. Exactly three
    // is the assertion that none of those repeats was stored.
    await expect(options.getByText('3 accounts', { exact: true })).toBeVisible();
  } finally {
    await extension.close();
  }
});

/**
 * The export that broke the first real attempt: three codes of ten accounts,
 * seen the way a webcam sees a phone. Before the native reader and the 1080p
 * request, this read none of them — the decoder was jsQR, which reads 0 in 10
 * frames like these, and the camera was at 640×480.
 */
test('a full-size Google Authenticator export, seen through a webcam, comes across whole', async () => {
  const { codes, issuers } = fullExport(3, 10, 918273);
  const extension = await launchExtension(fakeWebcam(codes, 'full-export'));

  try {
    const options = await openOptions(extension.context, extension.extensionId);
    await requireNativeReader(options);
    await createDeviceVault(options);

    await options.getByRole('button', { name: 'Add account' }).first().click();
    await options.getByRole('button', { name: /Scan with your camera/ }).click();

    const summary = options.getByText(/All 3 codes scanned/);
    await expect(summary).toBeVisible({ timeout: 45_000 });
    await expect(summary).toHaveText('All 3 codes scanned. 30 accounts added.');
    await options.getByRole('button', { name: 'Done' }).click();

    await expect(options.getByText('30 accounts', { exact: true })).toBeVisible();
    for (const issuer of [issuers[0]!, issuers[14]!, issuers[29]!]) {
      await expect(options.getByText(issuer, { exact: true }).first()).toBeVisible();
    }
  } finally {
    await extension.close();
  }
});

/**
 * Asked for nothing, Chrome opens a camera at 640×480, and a full export at
 * that size is under 2 px a module — below what any reader recovers. The fake
 * camera ignores the request and plays its file at whatever size it was
 * written, so the export test above cannot see this half of the fix. This one
 * pins it directly.
 */
test('the camera is asked for enough resolution to read a full export', async () => {
  const uri = `otpauth://totp/Oscar:me@example.com?secret=${SECRET}&issuer=Oscar`;
  const extension = await launchExtension(fakeCamera(uri, 'resolution'));

  try {
    const options = await openOptions(extension.context, extension.extensionId);
    await createDeviceVault(options);

    await options.evaluate(() => {
      const seen: MediaStreamConstraints[] = [];
      (window as unknown as { __constraints: MediaStreamConstraints[] }).__constraints = seen;
      const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = (constraints) => {
        if (constraints) seen.push(constraints);
        return real(constraints);
      };
    });

    await options.getByRole('button', { name: 'Add account' }).first().click();
    await options.getByRole('button', { name: /Scan with your camera/ }).click();
    await expect(options.getByText('Oscar').first()).toBeVisible({ timeout: 20_000 });

    const [asked] = await options.evaluate(
      () => (window as unknown as { __constraints: MediaStreamConstraints[] }).__constraints,
    );
    const video = asked?.video as MediaTrackConstraints;
    expect((video.width as ConstrainULongRange).ideal).toBeGreaterThanOrEqual(1920);
    expect((video.height as ConstrainULongRange).ideal).toBeGreaterThanOrEqual(1080);
  } finally {
    await extension.close();
  }
});

/**
 * Chrome on Windows and Linux has no native QR reader, and there jsQR is still
 * the one reading every frame. Take the native one away and make sure the
 * fallback is wired up, not just present.
 */
test('without a native reader, the fallback still reads a code', async () => {
  const uri = `otpauth://totp/Papa:me@example.com?secret=${SECRET}&issuer=Papa`;
  const extension = await launchExtension(fakeCamera(uri, 'fallback'));

  try {
    await withoutNativeReader(extension.context);
    const options = await openOptions(extension.context, extension.extensionId);
    expect(await options.evaluate(() => 'BarcodeDetector' in window)).toBe(false);

    await createDeviceVault(options);
    await options.getByRole('button', { name: 'Add account' }).first().click();
    await options.getByRole('button', { name: /Scan with your camera/ }).click();

    await expect(options.getByText('Papa').first()).toBeVisible({ timeout: 20_000 });
  } finally {
    await extension.close();
  }
});

/**
 * The popup cannot ask for the camera — Chrome's prompt takes focus and the
 * popup closes under it — but the grant belongs to the extension, not the page
 * that asked. Once Settings has it, the popup scans in place.
 *
 * `--use-fake-ui-for-media-stream` makes Chromium report the camera as granted
 * from the start, which stands in for a grant made earlier in Settings.
 */
test('in the popup, once the camera is granted, it scans right there', async () => {
  const uri = `otpauth://totp/Quebec:me@example.com?secret=${SECRET}&issuer=Quebec`;
  const extension = await launchExtension(fakeCamera(uri, 'popup-granted'));

  try {
    const popup = await openPopup(extension.context, extension.extensionId);
    await createDeviceVault(popup);

    await popup.getByTitle('Add account').click();
    const choice = popup.getByRole('button', { name: /Scan with your camera/ });
    await expect(choice).toContainText('including a Google Authenticator export');

    // Installing opens a welcome tab on its own, so count rather than look
    // for Settings: the point is that this click opened nothing new.
    const before = extension.context.pages().length;
    await choice.click();

    await expect(popup.getByText('Quebec').first()).toBeVisible({ timeout: 20_000 });
    expect(extension.context.pages()).toHaveLength(before);
  } finally {
    await extension.close();
  }
});

/**
 * Before anything has been granted, the same button says what it will do and
 * then does it: opens Settings, already on the scanner, where Chrome can ask.
 * Without the fake-UI flag Chromium reports the camera as not yet granted, as
 * a real first run does.
 */
test('in the popup, before the camera is granted, the button opens Settings on the scanner', async () => {
  const extension = await launchExtension(['--use-fake-device-for-media-stream']);

  try {
    const popup = await openPopup(extension.context, extension.extensionId);
    await createDeviceVault(popup);

    await popup.getByTitle('Add account').click();
    const choice = popup.getByRole('button', { name: /Scan with your camera/ });
    await expect(choice).toContainText('Opens Settings once');

    const [settings] = await Promise.all([extension.context.waitForEvent('page'), choice.click()]);
    await settings.waitForLoadState();

    expect(new URL(settings.url()).pathname).toBe('/options.html');
    await expect(settings.getByRole('heading', { name: 'Scan with your camera' })).toBeVisible();
    // Taken, so a reload or a trip back through history does not reopen it.
    expect(new URL(settings.url()).hash).toBe('');
  } finally {
    await extension.close();
  }
});

/**
 * The request to scan is honoured once. The Accounts panel remounts every time
 * its tab is chosen and on every reload; if the request outlived its first use
 * the camera would switch on each time for someone who came to change a
 * setting.
 */
test('Settings opens the scanner for the popup once, not every time Accounts is shown', async () => {
  const extension = await launchExtension(['--use-fake-device-for-media-stream']);

  try {
    const setup = await openOptions(extension.context, extension.extensionId);
    await createDeviceVault(setup);
    await setup.close();

    const settings = await extension.context.newPage();
    await settings.goto(`chrome-extension://${extension.extensionId}/options.html#scan`);
    const scanner = settings.getByRole('heading', { name: 'Scan with your camera' });
    await expect(scanner).toBeVisible();

    // Cancel with nothing added goes back to the list of ways to add; Back
    // from there closes the sheet.
    const sheet = settings.getByRole('dialog');
    await sheet.getByRole('button', { name: 'Cancel' }).click();
    await sheet.getByRole('button', { name: 'Back' }).click();
    await expect(scanner).toBeHidden();

    await settings.getByRole('button', { name: 'Security', exact: true }).click();
    await settings.getByRole('button', { name: 'Accounts', exact: true }).click();
    await expect(settings.getByRole('heading', { name: 'Accounts', exact: true })).toBeVisible();
    await expect(scanner).toBeHidden();

    await settings.reload();
    await expect(settings.getByRole('heading', { name: 'Accounts', exact: true })).toBeVisible();
    await expect(scanner).toBeHidden();
  } finally {
    await extension.close();
  }
});

/**
 * Import collects, then asks. Adding from the Accounts tab stores each code
 * the moment it is read; importing gathers the whole export and hands it to
 * the same review a file gets. The claim that matters is the one in between:
 * nothing is in the vault until the user says so.
 */
test('Backup & import scans a full export and stores none of it until asked', async () => {
  const { codes } = fullExport(3, 10, 5550123);
  const extension = await launchExtension(fakeWebcam(codes, 'import-export'));

  try {
    const options = await openOptions(extension.context, extension.extensionId);
    await requireNativeReader(options);
    await createDeviceVault(options);

    await options.getByRole('button', { name: 'Backup', exact: true }).click();
    await options.getByRole('button', { name: 'Import', exact: true }).click();
    await options.getByRole('button', { name: /Scan with your camera/ }).click();

    await expect(options.getByText('Found 30 new accounts.')).toBeVisible({ timeout: 45_000 });
    // Scanned, reviewed, and still not stored.
    await expect(options.getByText('0 accounts', { exact: true })).toBeVisible();

    await options.getByRole('button', { name: 'Import 30' }).click();
    await expect(options.getByText('30 accounts', { exact: true })).toBeVisible();
  } finally {
    await extension.close();
  }
});

/**
 * Here Cancel can honestly be called Cancel, because nothing has been written
 * — and the review reports accounts already in the vault the same way it does
 * for a file, rather than the scanner quietly dropping them.
 */
test('a camera import that is cancelled stores nothing, and says what it would have skipped', async () => {
  const uri = migrationUri([
    { secret: SECRET, name: 'x@example.com', issuer: 'Xray' },
    { secret: 'MZXW6YTBOI', name: 'y@example.com', issuer: 'Yankee' },
  ]);
  const extension = await launchExtension(fakeCamera(uri, 'import-cancel'));

  try {
    const options = await openOptions(extension.context, extension.extensionId);
    await createDeviceVault(options);

    // Xray is in the vault before the scan.
    await options.getByRole('button', { name: 'Backup', exact: true }).click();
    await options.getByRole('button', { name: 'Import', exact: true }).click();
    await options
      .getByLabel(/paste otpauth/)
      .fill(`otpauth://totp/Xray:x@example.com?secret=${SECRET}&issuer=Xray`);
    await options.getByRole('button', { name: 'Read links' }).click();
    await options.getByRole('button', { name: 'Import 1' }).click();
    await expect(options.getByText('1 account', { exact: true })).toBeVisible();

    await options.getByRole('button', { name: /Scan with your camera/ }).click();
    await expect(
      options.getByText('Found 1 new account, skipping 1 already in your vault.'),
    ).toBeVisible({ timeout: 20_000 });

    await options.getByRole('button', { name: 'Cancel' }).click();
    await expect(options.getByText('1 account', { exact: true })).toBeVisible();
    await expect(options.getByRole('button', { name: /Scan with your camera/ })).toBeVisible();
  } finally {
    await extension.close();
  }
});

/**
 * The way round the camera for everyone whose Chrome has no native reader —
 * most of them, on Windows. A full export through a webcam will not read with
 * jsQR; the same codes as screenshots do. This is the promise the scanner's
 * advice makes on those machines, so it is tested on one.
 */
test('without a native reader, a full export chosen as screenshots comes across whole', async () => {
  const { codes } = fullExport(3, 10, 3141592);
  const extension = await launchExtension();

  try {
    await withoutNativeReader(extension.context);
    const options = await openOptions(extension.context, extension.extensionId);
    expect(await options.evaluate(() => 'BarcodeDetector' in window)).toBe(false);
    await createDeviceVault(options);

    await options.getByRole('button', { name: 'Backup', exact: true }).click();
    await options.getByRole('button', { name: 'Import', exact: true }).click();
    // All three at once, the way someone picks them from a folder.
    await options.locator('input[type="file"]').setInputFiles(await screenshotsOf(codes));

    await expect(options.getByText('Found 30 new accounts.')).toBeVisible({ timeout: 30_000 });
    await expect(options.getByText(/These screenshots hold/)).toBeHidden();
    await options.getByRole('button', { name: 'Import 30' }).click();
    await expect(options.getByText('30 accounts', { exact: true })).toBeVisible();
  } finally {
    await extension.close();
  }
});

/**
 * Leave one screenshot out and a third of the accounts are missing, with
 * nothing wrong with anything that was read. The review says so before Import
 * rather than leaving someone to wonder later where ten accounts went.
 */
test('screenshots holding only part of an export say that some of it is missing', async () => {
  const { codes } = fullExport(3, 10, 2718281);
  const extension = await launchExtension();

  try {
    const options = await openOptions(extension.context, extension.extensionId);
    await createDeviceVault(options);

    await options.getByRole('button', { name: 'Backup', exact: true }).click();
    await options.getByRole('button', { name: 'Import', exact: true }).click();
    await options.locator('input[type="file"]').setInputFiles(await screenshotsOf([codes[0]!, codes[2]!]));

    await expect(
      options.getByText(
        'These screenshots hold 2 of the 3 codes in this Google Authenticator export, so the accounts in the other one are not here. Choose every screenshot of the export together to bring them all across.',
      ),
    ).toBeVisible({ timeout: 30_000 });
    await expect(options.getByText('Found 20 new accounts.')).toBeVisible();
  } finally {
    await extension.close();
  }
});

/**
 * On a Chrome that cannot read a full export through a camera, the scanner
 * says so before the user tries, and points at the upload on that same screen
 * — each surface has its own.
 */
test('without a native reader, the scanner says what to do instead', async () => {
  const extension = await launchExtension([
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
  ]);

  try {
    await withoutNativeReader(extension.context);
    const options = await openOptions(extension.context, extension.extensionId);
    await createDeviceVault(options);

    await options.getByRole('button', { name: 'Add account' }).first().click();
    await options.getByRole('button', { name: /Scan with your camera/ }).click();
    const sheet = options.getByRole('dialog');
    await expect(sheet).toContainText('no built-in QR reader');
    await expect(sheet).toContainText('use Upload a QR image instead');

    await sheet.getByRole('button', { name: 'Cancel' }).click();
    await sheet.getByRole('button', { name: 'Back' }).click();

    await options.getByRole('button', { name: 'Backup', exact: true }).click();
    await options.getByRole('button', { name: 'Import', exact: true }).click();
    await options.getByRole('button', { name: /Scan with your camera/ }).click();
    await expect(options.getByText(/no built-in QR reader/)).toBeVisible();
    await expect(options.getByText(/pick them all with Choose files/)).toBeVisible();
  } finally {
    await extension.close();
  }
});

/** And where Chrome can read one, it does not cry wolf. */
test('with a native reader, the scanner gives no such warning', async () => {
  const extension = await launchExtension([
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
  ]);

  try {
    const options = await openOptions(extension.context, extension.extensionId);
    await requireNativeReader(options);
    await createDeviceVault(options);

    await options.getByRole('button', { name: 'Add account' }).first().click();
    await options.getByRole('button', { name: /Scan with your camera/ }).click();
    const sheet = options.getByRole('dialog');
    await expect(sheet).toContainText('Hold the QR code inside the frame');
    await expect(sheet).not.toContainText('no built-in QR reader');
  } finally {
    await extension.close();
  }
});
