import { Brand, Deal } from '../types.ts';

// Curated secondary brand colors for crisp dual-tone banners & emblem fallbacks
const BRAND_PALETTE_MAP: Record<string, { secondary: string; domain?: string }> = {
  khaadi: { secondary: '#C94B63', domain: 'khaadi.com' },
  bata: { secondary: '#EF4444', domain: 'bata.com.pk' },
  kababjees: { secondary: '#D97706', domain: 'kababjees.com' },
  imtiaz: { secondary: '#10B981', domain: 'imtiaz.com.pk' },
  sapphire: { secondary: '#6366F1', domain: 'pk.sapphireonline.pk' },
  'gul-ahmed': { secondary: '#3B82F6', domain: 'gulahmedshop.com' },
  'j-dot': { secondary: '#52525B', domain: 'junaidjamshed.com' },
  alkaram: { secondary: '#D97706', domain: 'alkaramstudio.com' },
  kfc: { secondary: '#DC2626', domain: 'kfcpakistan.com' },
  'chughtai-lab': { secondary: '#06B6D4', domain: 'chughtailab.com' },
  'lal-qila': { secondary: '#B91C1C', domain: 'lalqila.com' },
  samsung: { secondary: '#2563EB', domain: 'samsung.com' },
  foodpanda: { secondary: '#EC4899', domain: 'foodpanda.pk' },
  pso: { secondary: '#16A34A', domain: 'psopk.com' },
  'toni-guy': { secondary: '#334155', domain: 'toniandguy.com' },
};

const PRIVATE_HOST_RE = /^(?:localhost|127\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|169\.254\.|0\.0\.0\.0|\[::1\])/i;

function normalizeDomain(website: string): string {
  return website
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .trim()
    .toLowerCase();
}

export function buildOfficialFaviconUrl(website: string): string {
  const domain = normalizeDomain(website);
  if (!domain || PRIVATE_HOST_RE.test(domain)) return '';
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
}

function resolveAbsoluteUrl(candidate: string, baseUrl: string): string | null {
  try {
    const resolved = new URL(candidate.trim(), baseUrl);
    if (resolved.protocol !== 'https:' && resolved.protocol !== 'http:') return null;
    if (PRIVATE_HOST_RE.test(resolved.hostname)) return null;
    return resolved.toString();
  } catch {
    return null;
  }
}

function isValidHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value.trim());
}

/**
 * Synchronous zero-latency enrichment so every brand and deal has
 * a crisp high-res logo URL and rich dual-tone branding immediately on boot.
 */
export function ensureDefaultBranding(brands: Brand[], deals: Deal[]): { brandsUpdated: number; dealsUpdated: number } {
  let brandsUpdated = 0;
  let dealsUpdated = 0;

  const brandLogoById = new Map<string, string>();

  for (const b of brands) {
    const preset = BRAND_PALETTE_MAP[b.id];
    if (!b.brandSecondaryColor) {
      b.brandSecondaryColor = preset?.secondary || '#19A85B';
      brandsUpdated++;
    }
    if (!b.logoUrl && b.website) {
      const fav = buildOfficialFaviconUrl(b.website);
      if (fav) {
        b.logoUrl = fav;
        b.logoSource = 'official_favicon';
        brandsUpdated++;
      }
    }
    if (b.logoUrl) {
      brandLogoById.set(b.id, b.logoUrl);
    }
  }

  for (const d of deals) {
    const mapped = brandLogoById.get(d.brandId);
    if (mapped && d.brandLogoUrl !== mapped) {
      d.brandLogoUrl = mapped;
      dealsUpdated++;
    } else if (!d.brandLogoUrl) {
      const preset = BRAND_PALETTE_MAP[d.brandId];
      if (preset?.domain) {
        d.brandLogoUrl = buildOfficialFaviconUrl(preset.domain);
        dealsUpdated++;
      }
    }
  }

  return { brandsUpdated, dealsUpdated };
}

/**
 * Zero-AI live Brand Logo & Branding Scraper:
 * Fetches each brand's official website HTML and extracts:
 *  - apple-touch-icon / high-res shortcut icon / logo <img>
 *  - official <meta name="theme-color">
 * Falls back cleanly to official high-res domain icon if site blocks bots.
 */
export async function scrapeSingleBrandBranding(brand: Brand): Promise<{
  brandId: string;
  name: string;
  logoUrl: string;
  logoSource: Brand['logoSource'];
  themeColorFound?: string;
  ok: boolean;
}> {
  const domain = normalizeDomain(brand.website || '');
  const fallbackFavicon = buildOfficialFaviconUrl(domain);

  if (!domain || PRIVATE_HOST_RE.test(domain)) {
    return {
      brandId: brand.id,
      name: brand.name,
      logoUrl: brand.logoUrl || fallbackFavicon,
      logoSource: brand.logoSource || 'emblem',
      ok: false,
    };
  }

  const targetUrl = `https://${domain}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5500);

  try {
    const res = await fetch(targetUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BachatHubPK-BrandBot/2.0)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      brand.logoUrl = brand.logoUrl || fallbackFavicon;
      brand.logoSource = 'official_favicon';
      brand.brandingScrapedAt = new Date().toISOString();
      return {
        brandId: brand.id,
        name: brand.name,
        logoUrl: brand.logoUrl,
        logoSource: 'official_favicon',
        ok: true,
      };
    }

    const html = (await res.text()).slice(0, 120_000);
    const finalBase = res.url || targetUrl;

    // 1. Extract <meta name="theme-color" content="#...">
    let themeColorFound: string | undefined;
    const themeMatch = html.match(/<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']theme-color["']/i);
    if (themeMatch?.[1] && isValidHexColor(themeMatch[1])) {
      const hex = themeMatch[1].trim();
      // Avoid pure white/black washing out badges
      if (hex.toLowerCase() !== '#ffffff' && hex.toLowerCase() !== '#000000') {
        themeColorFound = hex;
        brand.brandSecondaryColor = hex;
      }
    }

    // 2. Extract apple-touch-icon or high-res PNG/SVG icon link
    const iconCandidates: string[] = [];
    const appleIconMatch = html.match(/<link[^>]+rel=["'][^"']*apple-touch-icon[^"']*["'][^>]+href=["']([^"']+)["']/i)
      || html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*apple-touch-icon[^"']*["']/i);
    if (appleIconMatch?.[1]) iconCandidates.push(appleIconMatch[1]);

    const pngIconMatch = html.match(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+href=["']([^"']+\.(?:png|svg|webp)[^"']*)["']/i);
    if (pngIconMatch?.[1]) iconCandidates.push(pngIconMatch[1]);

    let scrapedLogo: string | null = null;
    for (const rawHref of iconCandidates) {
      const resolved = resolveAbsoluteUrl(rawHref, finalBase);
      if (resolved) {
        scrapedLogo = resolved;
        break;
      }
    }

    if (scrapedLogo) {
      brand.logoUrl = scrapedLogo;
      brand.logoSource = 'scraped_html';
    } else if (fallbackFavicon) {
      brand.logoUrl = fallbackFavicon;
      brand.logoSource = 'official_favicon';
    }
    brand.brandingScrapedAt = new Date().toISOString();

    return {
      brandId: brand.id,
      name: brand.name,
      logoUrl: brand.logoUrl || fallbackFavicon,
      logoSource: brand.logoSource,
      themeColorFound,
      ok: true,
    };
  } catch {
    clearTimeout(timeout);
    brand.logoUrl = brand.logoUrl || fallbackFavicon;
    brand.logoSource = 'official_favicon';
    brand.brandingScrapedAt = new Date().toISOString();
    return {
      brandId: brand.id,
      name: brand.name,
      logoUrl: brand.logoUrl,
      logoSource: 'official_favicon',
      ok: true,
    };
  }
}

export async function scrapeAllBrandBranding(brands: Brand[], deals: Deal[]) {
  ensureDefaultBranding(brands, deals);
  const results = await Promise.all(brands.map((b) => scrapeSingleBrandBranding(b)));
  ensureDefaultBranding(brands, deals);
  return {
    scrapedAt: new Date().toISOString(),
    totalBrands: brands.length,
    htmlScraped: results.filter((r) => r.logoSource === 'scraped_html').length,
    faviconMatched: results.filter((r) => r.logoSource === 'official_favicon').length,
    results,
  };
}
