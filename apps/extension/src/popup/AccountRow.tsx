import { formatCode, itemSubtitle, itemTitle, totpWindow, type VaultItem } from '@authx/core';
import { BrandMark } from '../ui/BrandMark.js';
import { CheckIcon, CopyIcon, RefreshIcon, StarIcon } from '../ui/icons.js';
import { Button, cx } from '../ui/primitives.js';
import { CountdownRing } from '../ui/CountdownRing.js';

export interface AccountRowProps {
  item: VaultItem;
  code: string | undefined;
  now: number;
  hideCodes: boolean;
  copied: boolean;
  canFill: boolean;
  onCopy: () => void;
  onFill: () => void;
  onToggleFavorite: () => void;
  onAdvanceCounter: () => void;
}

export function AccountRow({
  item,
  code,
  now,
  hideCodes,
  copied,
  canFill,
  onCopy,
  onFill,
  onToggleFavorite,
  onAdvanceCounter,
}: AccountRowProps) {
  const subtitle = itemSubtitle(item);
  const window_ = totpWindow(item.period, now);
  const pending = code === undefined;

  return (
    <li className="group relative">
      <div
        className={cx(
          'flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors',
          'hover:bg-zinc-50 dark:hover:bg-zinc-900',
        )}
      >
        <BrandMark issuer={item.issuer} label={item.label} domains={item.domains} icon={item.icon} />

        <button
          type="button"
          onClick={onCopy}
          disabled={pending}
          className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left"
          title="Click to copy"
        >
          <span className="w-full truncate text-[13px] font-medium text-zinc-800 dark:text-zinc-100">
            {itemTitle(item)}
          </span>
          <span
            className={cx(
              'code-digits text-[19px] leading-tight font-semibold text-zinc-900 dark:text-zinc-50',
              hideCodes && 'blur-[5px] transition group-hover:blur-none',
              pending && 'opacity-40',
            )}
          >
            {pending ? '••• •••' : formatCode(code)}
          </span>
          {subtitle && (
            <span className="w-full truncate text-[11px] text-zinc-400 dark:text-zinc-500">
              {subtitle}
            </span>
          )}
        </button>

        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={onToggleFavorite}
            aria-label={item.favorite ? 'Remove from favourites' : 'Add to favourites'}
            aria-pressed={item.favorite}
            className={cx(
              'rounded-lg p-1.5 text-base transition',
              item.favorite
                ? 'text-amber-400'
                : 'text-zinc-300 opacity-0 group-hover:opacity-100 hover:text-zinc-500 dark:text-zinc-700 dark:hover:text-zinc-500',
            )}
          >
            <StarIcon filled={item.favorite} />
          </button>

          {canFill && (
            <Button
              size="sm"
              variant="secondary"
              onClick={onFill}
              disabled={pending}
              title="Fill this code into the page"
            >
              Fill
            </Button>
          )}

          <button
            type="button"
            onClick={onCopy}
            disabled={pending}
            aria-label={copied ? 'Copied' : 'Copy code'}
            className={cx(
              'rounded-lg p-1.5 text-base transition',
              copied
                ? 'text-emerald-500'
                : 'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200',
            )}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
          </button>

          {item.type === 'hotp' ? (
            <button
              type="button"
              onClick={onAdvanceCounter}
              aria-label="Generate the next code"
              title={`Counter: ${item.counter}`}
              className="rounded-lg p-1.5 text-base text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              <RefreshIcon />
            </button>
          ) : (
            <CountdownRing remaining={window_.remaining} period={item.period} />
          )}
        </div>
      </div>
    </li>
  );
}
