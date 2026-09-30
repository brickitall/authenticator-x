# Privacy Policy — Authenticator X

_Last updated: 23 September 2026_

## The short version

Authenticator X does not collect, transmit or sell any of your data. There is no
server. Everything the extension stores stays in your own browser profile on your
own computer.

## What the extension stores

- **Your two-factor accounts** — the issuer, the account name, and the shared
  secret needed to generate codes. These are encrypted with AES-256-GCM before
  they are written to disk and can only be decrypted on the device that created
  them, using either that device's key or your master password.
- **Your preferences** — theme, sort order, auto-lock delay, and whether autofill
  is enabled.

All of this lives in Chrome's local extension storage. None of it is sent
anywhere.

## What the extension can see

- **The page you open the extension on.** When you scan a QR code, the extension
  takes a picture of the visible part of that tab and looks for a QR code in it.
  When you fill a code, it looks for a one-time-code field on that tab and types
  into it. Both use Chrome's `activeTab` permission, which Chrome grants only for
  the tab you invoked the extension on, and only until that tab navigates away.
- **Your camera, only when you ask it to scan.** Chrome asks for your permission
  the first time and remembers your answer. The extension reads each frame on
  your device to find a QR code in it, and switches the camera off as soon as
  the scan finishes or you leave it.
- **Pictures you choose.** A screenshot or photo of a QR code that you pick is
  read on your device to find the code in it.
- The extension declares **no host permissions** and installs **no persistent
  content scripts**, so it has no standing access to any website.

Nothing seen this way is stored or transmitted. Screenshots of the page, camera
frames and the pictures you choose are decoded in memory and discarded — none
of them is recorded, kept or uploaded.

## What the extension does not do

- No analytics, telemetry, crash reporting or usage statistics.
- No advertising, and no advertising identifiers.
- No accounts, sign-in or email collection.
- No selling or sharing of data with third parties, because there is no data
  leaving your device to sell or share.
- No remotely hosted code. Everything that runs is in the package Chrome
  installed, enforced by the extension's Content Security Policy.

## Data you export yourself

The backup and export features write files to wherever you choose. An encrypted
backup is protected by the password you set for it. A plain-text `otpauth://`
export is **not** encrypted and contains your secrets in readable form — delete
it as soon as you have finished using it.

## Deleting your data

Settings → Security → Delete this vault removes the encrypted vault and its
encryption key from the device. Removing the extension from Chrome also removes
its storage. Neither is recoverable, and neither needs a request to us, because we
never had a copy.

## Future versions

A later version will offer an optional account so your vault can sync between
your devices. That is opt-in, it does not exist in this version, and this policy
will be updated before it ships.

## Contact

brickitall.hi@gmail.com
