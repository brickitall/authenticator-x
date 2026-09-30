import { cx } from './primitives.js';

const SIZE = 28;
const STROKE = 2.75;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Time left on the current code. Turns amber below 8 seconds so the user knows
 * not to start typing a code that is about to roll over.
 */
export function CountdownRing({
  remaining,
  period,
  className,
}: {
  remaining: number;
  period: number;
  className?: string;
}) {
  const fraction = Math.max(0, Math.min(1, remaining / period));
  const urgent = remaining <= 8;
  const seconds = Math.ceil(remaining);

  return (
    <div
      className={cx('relative shrink-0', className)}
      style={{ width: SIZE, height: SIZE }}
      role="timer"
      aria-label={`${seconds} seconds until this code changes`}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          className="stroke-zinc-200 dark:stroke-zinc-800"
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          className={cx(
            'transition-[stroke-dashoffset] duration-200 ease-linear',
            urgent ? 'stroke-amber-500' : 'stroke-brand-500',
          )}
        />
      </svg>
      <span
        className={cx(
          'absolute inset-0 grid place-items-center text-[10px] font-semibold tabular-nums',
          urgent ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-500 dark:text-zinc-400',
        )}
      >
        {seconds}
      </span>
    </div>
  );
}
