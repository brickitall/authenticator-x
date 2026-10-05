import type { ReactNode } from 'react';
import { cx } from '../ui/primitives.js';

/**
 * A settings card: its title and what it is for inside it, the rows below. A
 * heading floating over a bordered box, with a paragraph between, read like a
 * document; a card reads like a control panel, which is what this is.
 */
export function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  /** Absent, the card is its header alone — a danger zone still folded away. */
  children?: ReactNode;
}) {
  return (
    <section className="mb-5 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-zinc-800 dark:bg-zinc-900/50 dark:shadow-none">
      <div className="flex items-start justify-between gap-4 px-4 pt-4 pb-3.5">
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold tracking-[-0.005em]">{title}</h2>
          {description && (
            <p className="mt-1 max-w-[60ch] text-[12.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              {description}
            </p>
          )}
        </div>
        {action}
      </div>
      {children ? <div className="border-t border-zinc-100 dark:border-zinc-800/80">{children}</div> : null}
    </section>
  );
}

export function Row({
  label,
  description,
  control,
}: {
  label: string;
  description?: ReactNode;
  control: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-zinc-100 px-4 py-3.5 last:border-b-0 dark:border-zinc-800/80">
      <div className="min-w-0">
        <p className="text-[13px] font-medium">{label}</p>
        {description && (
          <p className="mt-0.5 text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            {description}
          </p>
        )}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-10 rounded-full transition-colors ${
        checked ? 'bg-brand-600' : 'bg-zinc-300 dark:bg-zinc-700'
      }`}
    >
      {/* `left-0` is load-bearing. An absolutely placed box with no `left`
          sits at its static position, and inside a <button> — text centred
          by default — that is the middle of the track. The knob then started
          halfway along: off looked on, and on slid out past the edge. */}
      <span
        className={`absolute top-0.5 left-0 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-[18px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

/**
 * A choice of a few values. Up to three show as a segmented control — every
 * option visible, one click — which looks like part of the product; more fall
 * back to a menu, styled rather than left as the browser's default control.
 */
export function Select<T extends string | number>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  if (options.length <= 3) {
    return (
      <div
        role="radiogroup"
        aria-label={label}
        className="inline-flex rounded-xl bg-zinc-100 p-0.5 dark:bg-zinc-800"
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={String(option.value)}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.value)}
              className={cx(
                'h-8 rounded-[10px] px-3 text-[12.5px] font-medium transition-colors',
                selected
                  ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white'
                  : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200',
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="relative">
      <select
        aria-label={label}
        value={String(value)}
        onChange={(event) => {
          const match = options.find((option) => String(option.value) === event.target.value);
          if (match) onChange(match.value);
        }}
        className="h-9 appearance-none rounded-xl border border-zinc-200 bg-white pr-8 pl-3 text-[13px] font-medium text-zinc-800 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
      >
        {options.map((option) => (
          <option key={String(option.value)} value={String(option.value)}>
            {option.label}
          </option>
        ))}
      </select>
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-2.5 h-4 w-4 -translate-y-1/2 text-zinc-400"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m7 10 5 5 5-5" />
      </svg>
    </div>
  );
}
