/**
 * Where people move their accounts, and the quickest honest way to get them
 * there. The question a person has is "how do I get these into Microsoft
 * Authenticator", not "which of four formats is that" — so the page asks for
 * the app and answers with the one method that works best for it.
 *
 * "All at once" only where the app really imports in bulk. Microsoft
 * Authenticator, Authy, Apple's Passwords and 1Password import nothing from
 * other authenticators; for them the fastest way is one setup code after
 * another, and the page says so rather than offering a file they cannot open.
 *
 * The steps name the option to pick in each app, which is stable, rather than
 * every menu on the way to it, which is not.
 */

export type Method = 'transfer' | 'one-by-one' | 'aegis' | 'bitwarden' | 'text';

export interface Destination {
  id: string;
  name: string;
  /** Matched against the compiled-in marks, as an account's issuer would be. */
  brand: string;
  /** Everything in one go — a few codes, or one file — rather than account by account. */
  allAtOnce: boolean;
  /** Best first. */
  methods: Method[];
  steps: string;
}

export const DESTINATIONS: Destination[] = [
  {
    id: 'google',
    name: 'Google Authenticator',
    brand: 'Google',
    allAtOnce: true,
    methods: ['transfer'],
    steps: 'In Google Authenticator: menu → Transfer accounts → Import accounts, then scan the codes in order.',
  },
  {
    id: 'microsoft',
    name: 'Microsoft Authenticator',
    brand: 'Microsoft',
    allAtOnce: false,
    methods: ['one-by-one'],
    steps:
      'Microsoft Authenticator cannot import from another app, so the accounts go one after another. In it: + → Other account, scan, then Next here.',
  },
  {
    id: 'apple',
    name: 'Apple Passwords',
    brand: 'Apple',
    allAtOnce: false,
    methods: ['one-by-one'],
    steps:
      'Passwords imports codes only one at a time. In the Passwords app: Codes → +, scan, then Next here.',
  },
  {
    id: 'authy',
    name: 'Authy',
    brand: 'Authy',
    allAtOnce: false,
    methods: ['one-by-one'],
    steps: 'Authy cannot import from another app, so the accounts go one after another. In Authy: + → Scan QR code, then Next here.',
  },
  {
    id: '1password',
    name: '1Password',
    brand: '1Password',
    allAtOnce: false,
    methods: ['one-by-one'],
    steps:
      '1Password adds codes one login at a time. Open or create the login → Edit → add a one-time password → scan, then Next here. On a computer it can read the code straight off this screen.',
  },
  {
    id: 'bitwarden',
    name: 'Bitwarden',
    brand: 'Bitwarden',
    allAtOnce: true,
    methods: ['bitwarden', 'transfer'],
    steps:
      'Password manager: Import data → file format “Bitwarden (json)” → choose the file. Bitwarden Authenticator app: import from Google Authenticator and scan the transfer codes.',
  },
  {
    id: 'proton',
    name: 'Proton Authenticator',
    brand: 'Proton',
    allAtOnce: true,
    methods: ['transfer', 'aegis'],
    steps:
      'In Proton Authenticator, import from Google Authenticator and scan the transfer codes — or import from Aegis and choose the file.',
  },
  {
    id: 'ente',
    name: 'Ente Auth',
    brand: 'Ente',
    allAtOnce: true,
    methods: ['transfer', 'text'],
    steps:
      'In Ente Auth, import codes from Google Authenticator and scan the transfer codes — or choose “Plain text” and the .txt file.',
  },
  {
    id: 'aegis',
    name: 'Aegis',
    brand: 'Aegis Authenticator',
    allAtOnce: true,
    methods: ['aegis', 'transfer'],
    steps: 'In Aegis: Import & Export → Import from file → Aegis, and choose the file.',
  },
  {
    id: '2fas',
    name: '2FAS',
    brand: '2FAS',
    allAtOnce: true,
    methods: ['transfer', 'aegis'],
    steps:
      'In 2FAS, import from Google Authenticator and scan the transfer codes — or import from Aegis and choose the file.',
  },
  {
    id: 'other',
    name: 'Another app',
    brand: '',
    allAtOnce: false,
    methods: ['one-by-one', 'transfer', 'text'],
    steps:
      'Every authenticator scans a setup code, so one after another always works. Many also import Google Authenticator’s transfer codes, or a file of otpauth:// links — look for an import option.',
  },
];
