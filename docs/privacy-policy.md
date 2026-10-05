# Privacy Policy — Authenticator X

_Last updated: 5 October 2026_

## The short version

Authenticator X works without an account, and then nothing leaves your
computer. Sync between your browsers is optional. If you turn it on, your
two-factor accounts are encrypted on your device before they are uploaded, with
a key the server never receives: we store them, but we cannot read them. We
keep your email address and what is needed to run the account, use it for
nothing else, and sell nothing.

Authenticator X is made by BRICK IT ALL LLC ("we"). Sync is available from
version 0.2.0.

## Without an account

### What the extension stores

- **Your two-factor accounts** — the issuer, the account name, the shared
  secret needed to generate codes, and any note or picture you add. These are
  encrypted with AES-256-GCM before they are written to disk, using either that
  device's key or your master password.
- **Your preferences** — theme, sort order, auto-lock delay, and whether
  autofill is enabled.
- **When to ask for a rating** — the time you first used a code and how many
  codes you have copied or filled since, so that the extension asks once,
  after real use, whether you would rate it, and remembers your answer. It
  holds no account names or secrets and is never sent anywhere.

All of this lives in your browser's local extension storage. Without an account
none of it is sent anywhere.

### What the extension can see

- **The page you open the extension on.** When you scan a QR code, the extension
  takes a picture of the visible part of that tab and looks for a QR code in it.
  When you fill a code, it looks for a one-time-code field on that tab and types
  into it. Both use the browser's `activeTab` permission, which is granted only
  for the tab you invoked the extension on, and only until that tab navigates
  away.
- **Your camera, only when you ask it to scan.** The browser asks for your
  permission the first time and remembers your answer. The extension reads each
  frame on your device to find a QR code in it, and switches the camera off as
  soon as the scan finishes or you leave it.
- **Pictures you choose.** A screenshot or photo of a QR code that you pick is
  read on your device to find the code in it.
- The extension declares **no host permissions** and installs **no persistent
  content scripts**, so it has no standing access to any website.

Nothing seen this way is stored or transmitted. Screenshots of the page, camera
frames and the pictures you choose are decoded in memory and discarded — none of
them is recorded, kept or uploaded, with or without an account.

## With an account (optional sync)

### What we receive and keep

- **Your email address**, to identify your account and to send you a code that
  proves the address is yours.
- **Your two-factor accounts, encrypted.** Each one is encrypted on your device
  with your account's data key before it is uploaded. We store the ciphertext
  and the little we need to keep your devices in step: a random identifier for
  each entry, a revision number, when it last changed, whether it was deleted,
  and which of your devices changed it. We cannot read the issuer, account name,
  secret, note or picture.
- **What lets you sign in, none of it usable as your password.** Your account
  password never leaves your device. It is stretched on your device into two
  unrelated keys: one stays there; the other proves your password to us, and we
  store only a salted, slow hash of that proof, mixed with a secret held apart
  from the database. We also store your data key in encrypted form, so a new
  device can open it with your password, and, if you made one, the same for your
  recovery key.
- **Your signed-in devices** — a name such as "Chrome on Mac", when each signed
  in and was last used, and a hash of its session tokens, so you can see the
  list and sign a device out.

### What the service sees in passing

- **Your IP address**, which every connection carries. To limit abuse — someone
  guessing passwords or requesting codes in bulk — the server counts recent
  requests per address. It keeps only a one-way digest of the address, for at
  most an hour.
- Requests reach the server through **Cloudflare**, which protects it and sees
  connection details such as your IP address. Our hosting provider's web server
  writes routine access logs (IP address, time, the address requested); we have
  archiving of those logs switched off, and we do not combine them with your
  account.

### Emails we send

Only what the account needs: the code that confirms your address when you sign
up, and a notice if someone tries to sign up with an address that already has an
account. No newsletters, no marketing.

### Who processes it for us

- **A2 Hosting** runs the server and its database, in Singapore.
- **Cloudflare** carries the connections between your browser and the server.
- **MailChannels** relays the emails we send.
- **Google** (Gmail) holds an off-site copy of each daily database backup. The
  backup is encrypted, and the key to open it is not stored with it.

They handle the data only to provide those services to us. Some of them are in
the United States, so your data may be processed outside your country.

### How long we keep it

- **Your account and everything synced**: until you delete the account.
  Deleting it (Settings → Account & sync → Delete account, which asks for
  your password) removes your email address, your encrypted entries, your devices and
  your recovery data from our database at once.
- **Backups**: encrypted daily copies of the database are kept for 14 days on
  the server, and the off-site copies are deleted within 60 days. Deleted
  accounts disappear from backups as they expire.
- **Sign-up codes**: a code works for 15 minutes. The record of the request,
  with the address it went to, is deleted within a day once its hour has passed.
- **Failed sign-in counts** are forgotten after an hour without failures, and
  deleted within a day after that. **Expired sessions** are deleted within a day.

### How we use it

Only to provide sync and to keep the service and your account secure. We do not
sell your data, use it for advertising, share it except with the processors
above, or use it to decide anyone's creditworthiness. Nobody at BRICK IT ALL LLC
reads your two-factor accounts, because nobody can.

## What Authenticator X never does

- No analytics, telemetry, crash reporting or usage statistics.
- No advertising, and no advertising identifiers.
- No remotely hosted code. Everything that runs is in the package the browser
  installed, enforced by the extension's Content Security Policy.
- No service logos fetched from the internet: they are built in, so no website
  learns which accounts you keep.

## Data you export yourself

The backup and export features write files to wherever you choose, or show QR
codes on your screen for another app to scan. All of it is made on your device
and sent nowhere. An encrypted backup is protected by the password you set for
it. Everything else — a QR code, a printed sheet of them, an Aegis or Bitwarden
file, a plain-text `otpauth://` export — is **not** encrypted and contains your
secrets in readable form: whoever sees or holds it can generate your codes.
Delete files, and destroy paper copies, as soon as you have finished with them.

## Your choices and rights

- **Use it without an account.** Every feature but sync works without one.
- **See and take your data.** Your entries are in the extension, readable by
  you, and Backup & import exports them. For what we hold about your account,
  write to us.
- **Delete it.** Delete the account in the extension at any time. Settings →
  Security → Delete this vault removes the vault from a device; removing the
  extension also removes its storage.
- **Correct it or ask about it.** Write to us; we answer within 30 days.

By creating an account you agree to this processing for the purposes above; you
can withdraw by deleting the account. If you believe we handle your data
wrongly, you may also complain to the data protection authority where you live.

Authenticator X is not directed at children under 13, and we do not knowingly
hold data about them.

## Changes

When this policy changes, the date at the top changes with it. A change in what
we collect or who processes it is also named in the extension's release notes
before it takes effect.

## Contact

BRICK IT ALL LLC — brickitall.hi@gmail.com
