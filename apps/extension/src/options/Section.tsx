import type { ReactNode } from 'react';

export function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-semibold">{title}</h2>
          {description && (
            <p className="mt-1 max-w-prose text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              {description}
            </p>
          )}
        </div>
        {action}
      </div>
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800">{children}</div>
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
    <div className="flex items-center justify-between gap-6 border-b border-zinc-100 px-4 py-3.5 last:border-b-0 dark:border-zinc-900">
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
  return (
    <select
      aria-label={label}
      value={String(value)}
      onChange={(event) => {
        const match = options.find((option) => String(option.value) === event.target.value);
        if (match) onChange(match.value);
      }}
      className="h-9 rounded-lg border border-zinc-200 bg-white px-2.5 text-[13px] dark:border-zinc-800 dark:bg-zinc-900"
    >
      {options.map((option) => (
        <option key={String(option.value)} value={String(option.value)}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
