import type { ReactNode } from 'react';
import { cx } from '../ui/primitives.js';
import { ArrowLeftIcon } from '../ui/icons.js';
import { translate } from '../i18n/runtime.js';

/**
 * The top of every Settings tab: what the tab is for, in one line, and the
 * one thing most people come to it to do. The tabs used to open straight on a
 * card, so nothing said where you were or why.
 */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="mb-8 flex items-start justify-between gap-6">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold tracking-[-0.015em]">{title}</h1>
        {description && (
          <p className="mt-1 max-w-[62ch] text-[13.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

/** A page one step into a tab, with the way back to it. */
export function SubpageHeader({
  title,
  description,
  onBack,
}: {
  title: string;
  description?: ReactNode;
  onBack: () => void;
}) {
  return (
    <header className="mb-8">
      <button
        type="button"
        onClick={onBack}
        aria-label={translate('common.back')}
        className="-ms-1.5 mb-3 grid h-8 w-8 place-items-center rounded-lg text-[17px] text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
      >
        <ArrowLeftIcon />
      </button>
      <h1 className="text-[22px] font-semibold tracking-[-0.015em]">{title}</h1>
      {description && (
        <p className="mt-1 max-w-[62ch] text-[13.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          {description}
        </p>
      )}
    </header>
  );
}

/**
 * A group of settings: a short label above, the rows in one card below. The
 * label sat inside the card once, over a paragraph, and every card read like
 * a page of a manual; a label and rows read like controls, which these are.
 */
export function Section({
  title,
  description,
  action,
  tone = 'default',
  children,
}: {
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
  /** A danger zone is outlined in red, so it is never mistaken for an ordinary setting. */
  tone?: 'default' | 'danger';
  /** Absent, the group is its label alone — a danger zone still folded away. */
  children?: ReactNode;
}) {
  return (
    <section className="mb-8">
      {(title || action) && (
        <div className="mb-2 flex items-end justify-between gap-4 px-1">
          <div className="min-w-0">
            {title && (
              <h2
                className={cx(
                  'text-[13px] font-semibold',
                  tone === 'danger' ? 'text-red-600 dark:text-red-400' : 'text-zinc-800 dark:text-zinc-200',
                )}
              >
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-0.5 max-w-[62ch] text-[12.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                {description}
              </p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children ? (
        <div
          className={cx(
            'overflow-hidden rounded-2xl border bg-white dark:bg-zinc-900/60',
            tone === 'danger' ? 'border-red-200 dark:border-red-500/30' : 'border-zinc-200/80 dark:border-zinc-800',
          )}
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}

export function Row({
  label,
  description,
  control,
  children,
}: {
  label: ReactNode;
  description?: ReactNode;
  control?: ReactNode;
  /** What opens under the row when its control is used: a form, a warning. */
  children?: ReactNode;
}) {
  return (
    <div className="border-b border-zinc-100 px-4 py-3.5 last:border-b-0 dark:border-zinc-800/80">
      <div className="flex items-center justify-between gap-6">
        <div className="min-w-0">
          <div className="text-[13.5px] font-medium">{label}</div>
          {description && (
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">{description}</p>
          )}
        </div>
        {control && <div className="shrink-0">{control}</div>}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

/** A dot before a state: green when nothing needs doing, amber when something does. */
export function StateDot({ good }: { good: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cx('me-2 inline-block h-2 w-2 shrink-0 rounded-full align-middle', good ? 'bg-emerald-500' : 'bg-amber-500')}
    />
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
      {/* `start-0` is load-bearing. An absolutely placed box with no inset
          sits at its static position, and inside a <button> — text centred
          by default — that is the middle of the track. The knob then started
          halfway along: off looked on, and on slid out past the edge. Read
          right to left, the track is mirrored, so "on" moves the other way. */}
      <span
        className={`absolute top-0.5 start-0 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-[18px] rtl:-translate-x-[18px]' : 'translate-x-0.5 rtl:-translate-x-0.5'
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
        className="h-9 appearance-none rounded-xl border border-zinc-200 bg-white pe-8 ps-3 text-[13px] font-medium text-zinc-800 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
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
        className="pointer-events-none absolute top-1/2 end-2.5 h-4 w-4 -translate-y-1/2 text-zinc-400"
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
