import { useEffect, useState } from 'react';

/**
 * The shortcuts as they are set now — someone may have changed them at
 * chrome://extensions/shortcuts — by command name. Null until Chrome answers.
 */
export function useShortcuts(): Record<string, string> | null {
  const [shortcuts, setShortcuts] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    chrome.commands
      .getAll()
      .then((commands) => setShortcuts(Object.fromEntries(commands.map((command) => [command.name ?? '', command.shortcut ?? '']))))
      .catch(() => setShortcuts({}));
  }, []);
  return shortcuts;
}

const KEY =
  'rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[12px] dark:border-zinc-700 dark:bg-zinc-900';

/** "Alt+Shift+F" as keys; macOS's "⌥⇧F" arrives without the pluses, as one. */
export function Keys({ shortcut }: { shortcut: string }) {
  const parts = shortcut.includes('+') ? shortcut.split('+') : [shortcut];
  return (
    <span className="inline-flex items-center gap-1 text-[12px] text-zinc-500 dark:text-zinc-400" dir="ltr">
      {parts.map((part, index) => (
        <span key={index} className="inline-flex items-center gap-1">
          {index > 0 && '+'}
          <kbd className={KEY}>{part}</kbd>
        </span>
      ))}
    </span>
  );
}
