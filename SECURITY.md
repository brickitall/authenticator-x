# Security policy

Authenticator X holds people's two-factor secrets. If you have found a way to
weaken that, we want to hear about it before anyone else does.

## Reporting

Email **brickitall.hi@gmail.com** with "Security" in the subject line. Please
include:

- what an attacker could do, and what they would need first;
- the version you tested (Settings → About) and your browser;
- steps or a proof of concept that shows it.

Please do not open a public issue or pull request for a vulnerability. We will
reply to confirm we have it, keep you told as we work on a fix, and credit you
in the release notes if you would like that.

## What we most want to know about

- Anything that reveals a secret, the data key or the master password without
  the password or the device's own key.
- Anything that reads or fills pages beyond the tab the user invoked the
  extension on, or that lets a web page drive the vault.
- Anything that lets the sync server — which the client treats as hostile —
  read, forge, move, replay or roll back what it stores.
  [docs/security-model.md](docs/security-model.md) sets out what a server is and
  is not supposed to be able to do. The server's code is not public; reports
  about how it behaves are welcome too.
- A way to take over an account from a session token alone.

## Limits we already state

Some weaknesses are documented, not hidden. The device-key mode, for instance,
does not protect against malware running as you on the same machine — the
settings page says so. Reports that go further than what is documented are
always welcome.
