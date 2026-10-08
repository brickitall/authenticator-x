import { formatCode, itemSubtitle, totpWindow, type VaultItem } from '@authx/core';
import { BrandMark } from '../ui/BrandMark.js';
import { CheckIcon, CopyIcon, QrIcon, RefreshIcon, StarIcon } from '../ui/icons.js';
import { Button, cx } from '../ui/primitives.js';
import { CountdownRing } from '../ui/CountdownRing.js';
import { useT } from '../i18n/react.js';
import { titleOf } from '../i18n/titles.js';

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
  onShare: () => void;
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
  onShare,
}: AccountRowProps) {
  const t = useT();
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
          className="flex flex-1 flex-col items-start gap-0.5 text-start"
          title={t('row.copyHint')}
        >
          {/* The code sets how narrow this column may get, and never wraps:
              "Introdueix" on the Fill button once broke 841 298 over two lines.
              Name and subtitle take no width of their own (w-0 min-w-full), so
              a long name truncates instead of widening the column. */}
          {/* A name keeps its own direction: "Amazon (production)" read right
              to left lost its bracket and its beginning. It still lines up
              with the page. */}
          <span dir="auto" className="w-0 min-w-full truncate text-[13px] font-medium text-zinc-800 rtl:text-right dark:text-zinc-100">
            {titleOf(item)}
          </span>
          <span
            className={cx(
              'code-digits whitespace-nowrap text-[19px] leading-tight font-semibold text-zinc-900 dark:text-zinc-50',
              hideCodes && 'blur-[5px] transition group-hover:blur-none',
              pending && 'opacity-40',
            )}
          >
            {pending ? '••• •••' : formatCode(code)}
          </span>
          {subtitle && (
            <span dir="auto" className="w-0 min-w-full truncate text-[11px] text-zinc-400 rtl:text-right dark:text-zinc-500">
              {subtitle}
            </span>
          )}
        </button>

        <div className="flex min-w-0 items-center gap-0.5 [&>*:not([data-fill])]:shrink-0">
          {/* Over a page with a code field, Fill takes the place of the QR
              button, which only shows on hover: in a long language the row
              has no room for both. Sharing is a click away everywhere else. */}
          {!canFill && (
            <button
              type="button"
              onClick={onShare}
              aria-label={t('row.share')}
              title={t('row.shareHint')}
              className="rounded-lg p-1.5 text-base text-zinc-300 opacity-0 transition group-hover:opacity-100 hover:text-zinc-600 focus-visible:opacity-100 dark:text-zinc-700 dark:hover:text-zinc-400"
            >
              <QrIcon />
            </button>
          )}
          <button
            type="button"
            onClick={onToggleFavorite}
            aria-label={item.favorite ? t('row.favouriteRemove') : t('row.favouriteAdd')}
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
              title={t('row.fillHint')}
              aria-label={t('row.fill')}
              data-fill=""
              className="min-w-0"
            >
              {/* The last thing to give way when a row is tight. */}
              <span className="truncate">{t('row.fill')}</span>
            </Button>
          )}

          <button
            type="button"
            onClick={onCopy}
            disabled={pending}
            aria-label={copied ? t('row.copied') : t('row.copy')}
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
              aria-label={t('row.next')}
              title={t('row.counter', { counter: String(item.counter) })}
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
