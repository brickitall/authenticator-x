# @keyrook/brand

Keyrook's identity, for every Keyrook product: the crow, the hand-lettered
wordmark, the colours, the motions, and each product's own mark. Open
`guide.html` for the brand book.

The crow is the brand's, never a product's icon: it marks only what Keyrook
itself speaks for — the account, emails, the brand's site, a "by Keyrook".

| | |
| --- | --- |
| `src/tokens.ts` | Colours, roles, type, lines, motion — the source of truth |
| `src/mark.ts` | The crow — Keyrook's own mark — full and compact |
| `src/authenticator.ts` | Keyrook Authenticator's mark, the crayon asterisk |
| `src/wordmark.ts`, `src/lockup.ts` | "keyrook", and the crow with it |
| `src/svg.ts` | Any of them as an SVG string, no DOM |
| `brand.css` | The tokens as `--kr-*` and `.kr-boil`, `.kr-draw`, `.kr-sketch` |
| `assets/` | The logo kit, SVG and PNG |
| `guide.html` | What each piece is for, and what not to do |

`brand.css`, `assets/` and `guide.html` are generated:

```bash
node scripts/render-brand.mjs
```

CI runs it with `--check`. Change `src/`, never the generated files.

The code is GPL-3.0-or-later like the rest of this tree. The Keyrook name and
the crow identify Keyrook's own products; a fork should carry its own.
