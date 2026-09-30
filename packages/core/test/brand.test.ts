import { describe, expect, it } from 'vitest';
import { BRANDS, matchBrand, monogramFor, searchBrands } from '../src/brand/registry.js';

describe('matching an account to a service', () => {
  it('matches the service name as written', () => {
    expect(matchBrand('GitHub')?.slug).toBe('github');
    expect(matchBrand('github')?.slug).toBe('github');
    expect(matchBrand('  GitHub  ')?.slug).toBe('github');
  });

  it('matches punctuation and spacing however the issuer wrote it', () => {
    expect(matchBrand('Fly.io')?.slug).toBe('flydotio');
    expect(matchBrand('1Password')?.slug).toBe('1password');
    expect(matchBrand('Battle.net')?.slug).toBe('battledotnet');
    expect(matchBrand('Cash App')?.slug).toBe('cashapp');
  });

  it('matches the other names a service is issued under', () => {
    expect(matchBrand('Gmail')?.slug).toBe('google');
    expect(matchBrand('Twitter')?.slug).toBe('x');
    expect(matchBrand('Blizzard')?.slug).toBe('battledotnet');
    expect(matchBrand('ProtonMail')?.slug).toBe('proton');
    expect(matchBrand('Amazon Web Services')?.slug).toBe('aws');
  });

  it('prefers the recorded domain over the issuer string', () => {
    // The domain is where the account was actually added from; the issuer is
    // whatever the service chose to put in its QR code.
    expect(matchBrand('My work login', ['github.com'])?.slug).toBe('github');
    expect(matchBrand('', ['gist.github.com'])?.slug).toBe('github');
    expect(matchBrand('', ['www.dropbox.com'])?.slug).toBe('dropbox');
  });

  it('reads through the decoration issuers add', () => {
    expect(matchBrand('GitHub (work)')?.slug).toBe('github');
    expect(matchBrand('Cloudflare - production')?.slug).toBe('cloudflare');
    expect(matchBrand('Shopify Partners')?.slug).toBe('shopify');
  });

  it('does not let a short name swallow unrelated services', () => {
    // "X", "EA", "VK" and friends must match exactly or not at all, or every
    // account starting with those letters gets the wrong mark.
    expect(matchBrand('X')?.slug).toBe('x');
    expect(matchBrand('Xero')).toBeNull();
    expect(matchBrand('EA')?.slug).toBe('ea');
    expect(matchBrand('Easyjet')).toBeNull();
    expect(matchBrand('VK')?.slug).toBe('vk');
    expect(matchBrand('Vklopnik')).toBeNull();
  });

  it('returns nothing rather than guessing', () => {
    expect(matchBrand('Some Internal Tool')).toBeNull();
    expect(matchBrand('')).toBeNull();
    expect(matchBrand('', ['intranet.example.com'])).toBeNull();
  });
});

describe('the lettered fallback', () => {
  it('takes the first letter, upper case', () => {
    expect(monogramFor('Fastmail').letter).toBe('F');
    expect(monogramFor('  zulip').letter).toBe('Z');
    expect(monogramFor('1Password').letter).toBe('1');
  });

  it('skips leading punctuation and handles non-Latin names', () => {
    expect(monogramFor('*** internal').letter).toBe('I');
    expect(monogramFor('Ngân hàng').letter).toBe('N');
    expect(monogramFor('日本の銀行').letter).toBe('日');
    expect(monogramFor('').letter).toBe('?');
    expect(monogramFor('🔐').letter).toBe('?');
  });

  it('gives a name the same colour every time', () => {
    expect(monogramFor('Fastmail').hue).toBe(monogramFor('Fastmail').hue);
    // Recognition comes from the colour being stable, so casing and spacing
    // must not move it.
    expect(monogramFor('fastmail').hue).toBe(monogramFor('Fast mail').hue);
  });

  it('ignores accents, so one name is one colour', () => {
    // Vietnamese account names are routinely written both ways.
    expect(monogramFor('Ngân hàng').hue).toBe(monogramFor('Ngan hang').hue);
    expect(monogramFor('Café').hue).toBe(monogramFor('Cafe').hue);
  });

  it('spreads names across the whole wheel instead of clustering', () => {
    // Two names landing near each other is ordinary — 360 hues and a handful of
    // accounts collide by birthday maths, and the row's text carries the name
    // anyway. What would be a real failure is every tile coming out the same
    // family of colours.
    const quadrants = new Set(BRANDS.map((brand) => Math.floor(monogramFor(brand.name).hue / 90)));
    expect(quadrants.size).toBe(4);

    // With hundreds of services and 360 hues, repeats are arithmetic rather
    // than a flaw — what would be a real failure is the hash favouring one
    // stretch of the wheel. Over half distinct is what an even spread gives.
    const hues = BRANDS.map((brand) => monogramFor(brand.name).hue);
    expect(new Set(hues).size).toBeGreaterThan(hues.length * 0.5);
  });

  it('stays inside the colour wheel', () => {
    for (const brand of BRANDS) {
      const { hue } = monogramFor(brand.name);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });
});

describe('the registry itself', () => {
  it('has no duplicate slugs', () => {
    const slugs = BRANDS.map((brand) => brand.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('resolves every entry by its own name', () => {
    for (const brand of BRANDS) {
      expect(matchBrand(brand.name)?.slug, `by name: ${brand.name}`).toBe(brand.slug);
    }
  });

  it('lets no two services claim the same website', () => {
    // A domain that resolves to the wrong service is worse than no domain:
    // autofill would then offer the wrong code on that site.
    const owners = new Map<string, string>();
    for (const brand of BRANDS) {
      for (const domain of brand.domains) {
        expect(owners.get(domain), `${domain} claimed twice`).toBeUndefined();
        owners.set(domain, brand.slug);
      }
    }
  });

  it('resolves every entry by each of its websites', () => {
    for (const brand of BRANDS) {
      for (const domain of brand.domains) {
        expect(matchBrand('', [domain])?.slug, `by domain: ${domain}`).toBe(brand.slug);
      }
    }
  });

  it('gives every Font Awesome entry a colour, since that set ships none', () => {
    for (const brand of BRANDS) {
      if (brand.source === 'font-awesome') {
        expect(brand.color, brand.slug).toMatch(/^[0-9A-F]{6}$/i);
      }
    }
  });
});

describe('suggesting services as the user types', () => {
  const names = (query: string) => searchBrands(query).map((brand) => brand.name);

  it('offers nothing until something is typed', () => {
    expect(searchBrands('')).toEqual([]);
    expect(searchBrands('   ')).toEqual([]);
  });

  it('puts the obvious answer first', () => {
    expect(names('git')[0]).toBe('GitHub');
    expect(names('goo')[0]).toBe('Google');
    expect(names('drop')[0]).toBe('Dropbox');
    expect(names('cloud')[0]).toBe('Cloudflare');
  });

  it('prefers an exact name over a longer one that starts the same', () => {
    expect(names('box')[0]).toBe('Box');
    expect(names('square')[0]).toBe('Square');
    expect(names('proton')[0]).toBe('Proton');
  });

  it('finds a service under the other names it is issued as', () => {
    expect(names('gmail')).toContain('Google');
    expect(names('twitter')).toContain('X');
    expect(names('blizzard')).toContain('Battle.net');
    expect(names('outlook')).toContain('Microsoft');
  });

  it('ignores spacing, case and punctuation', () => {
    expect(names('1 password')).toContain('1Password');
    expect(names('FLY.IO')).toContain('Fly.io');
    expect(names('cash app')).toContain('Cash App');
  });

  it('matches on the domain when that is what someone typed', () => {
    expect(names('github.com')).toContain('GitHub');
    expect(names('npmjs')).toContain('npm');
  });

  it('offers several when the query is genuinely ambiguous', () => {
    const git = names('git');
    expect(git).toContain('GitHub');
    expect(git).toContain('GitLab');
  });

  it('returns nothing for a name no service has', () => {
    expect(searchBrands('zzzinternaltool')).toEqual([]);
  });

  it('respects the limit', () => {
    expect(searchBrands('a', 3)).toHaveLength(3);
  });
});

describe('AI services', () => {
  it('recognises the ones people actually have accounts with', () => {
    expect(matchBrand('OpenAI')?.slug).toBe('openai');
    // ChatGPT is OpenAI's mark, so it resolves there rather than to a tile.
    expect(matchBrand('ChatGPT')?.slug).toBe('openai');
    expect(matchBrand('Claude')?.slug).toBe('claude');
    expect(matchBrand('Anthropic')?.slug).toBe('anthropic');
    expect(matchBrand('Google Gemini')?.slug).toBe('googlegemini');
    expect(matchBrand('Perplexity')?.slug).toBe('perplexity');
    expect(matchBrand('Midjourney')?.slug).toBe('midjourney');
    expect(matchBrand('Cursor')?.slug).toBe('cursor');
    expect(matchBrand('Hugging Face')?.slug).toBe('huggingface');
  });

  it('suggests them while typing', () => {
    const names = (query: string) => searchBrands(query).map((brand) => brand.name);
    expect(names('chatg')).toContain('OpenAI');
    expect(names('open')).toContain('OpenAI');
    expect(names('clau')).toContain('Claude');
    expect(names('gpt')).toContain('OpenAI');
  });
});
