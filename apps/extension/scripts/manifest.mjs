/**
 * Single source of truth for manifest.json.
 *
 * Permission policy: no `host_permissions` and no declarative content scripts.
 * Autofill runs through `activeTab` + `scripting`, which Chrome grants only for
 * the tab the user explicitly invoked the extension on. That keeps the store
 * listing free of the "read and change all your data on all websites" warning
 * and keeps review turnaround short.
 */
/**
 * Content Security Policy.
 *
 * Two of this project's invariants are otherwise held only by convention —
 * that no service logo is ever fetched, and that the extension talks to
 * nothing but its own sync server. Writing them into the policy means a
 * future mistake is refused by the browser instead of shipping quietly.
 *
 * - `img-src 'self' data:` — bundled artwork and the user's own re-encoded
 *   pictures. A favicon pulled from a service would tell whoever served it
 *   every place the user has two-factor authentication.
 * - `connect-src` — the sync origin and nothing else, so a bug cannot become
 *   an exfiltration path. Absent a configured server, nowhere at all.
 * - `style-src` needs `'unsafe-inline'`: React writes inline style attributes,
 *   which this directive governs. Style injection is a far smaller problem
 *   than script injection, which stays locked to `'self'`.
 * - `frame-src`/`object-src` none-ish and `form-action 'none'`: nothing here
 *   frames anything or submits a form the old-fashioned way, and both are
 *   quiet ways for data to leave.
 */
function contentSecurityPolicy(syncOrigin) {
  const connect = ["'self'", syncOrigin].filter(Boolean).join(' ');
  return [
    "script-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    `connect-src ${connect}`,
    "frame-src 'none'",
    "child-src 'none'",
    "form-action 'none'",
  ].join('; ');
}

export function buildManifest({ version, name, description, syncOrigin }) {
  return {
    manifest_version: 3,
    name,
    version,
    description,
    minimum_chrome_version: '116',

    action: {
      default_title: name,
      default_popup: 'popup.html',
      default_icon: {
        16: 'icons/icon-16.png',
        32: 'icons/icon-32.png',
        48: 'icons/icon-48.png',
        128: 'icons/icon-128.png',
      },
    },

    icons: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },

    background: {
      service_worker: 'background.js',
      type: 'module',
    },

    options_ui: {
      page: 'options.html',
      open_in_tab: true,
    },

    permissions: ['storage', 'alarms', 'activeTab', 'scripting', 'clipboardWrite'],

    content_security_policy: {
      extension_pages: contentSecurityPolicy(syncOrigin),
    },

    commands: {
      _execute_action: {
        suggested_key: { default: 'Alt+Shift+A', mac: 'Alt+Shift+A' },
        description: 'Open Authenticator X',
      },
    },
  };
}
