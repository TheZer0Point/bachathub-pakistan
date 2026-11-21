import { CategoryId, Deal } from '../types';

const BASE = import.meta.env.BASE_URL;

export const REAL_PHOTOS = {
  fashion: `${BASE}src/assets/images/hero_pakistani_fashion_1795253617938.jpg`,
  food: `${BASE}src/assets/images/buffet_pakistani_bbq_1795253618146.jpg`,
  grocery: `${BASE}src/assets/images/grocery_pakistan_mart_1795253619145.jpg`,
  shoes: `${BASE}src/assets/images/shoes_leather_retail_1795253618032.jpg`,
} as const;

export function getRealPhotoForDeal(deal: Pick<Deal, 'category' | 'isBuffet' | 'brandId'>): string {
  if (deal.isBuffet || deal.category === 'food') return REAL_PHOTOS.food;
  if (deal.category === 'grocery' || deal.category === 'health') return REAL_PHOTOS.grocery;
  if (deal.category === 'shoes' || deal.category === 'mobiles' || deal.category === 'home') return REAL_PHOTOS.shoes;
  return REAL_PHOTOS.fashion;
}

export function getRealPhotoForCategory(category: CategoryId): string {
  switch (category) {
    case 'food':
      return REAL_PHOTOS.food;
    case 'grocery':
    case 'health':
      return REAL_PHOTOS.grocery;
    case 'shoes':
    case 'mobiles':
    case 'home':
      return REAL_PHOTOS.shoes;
    default:
      return REAL_PHOTOS.fashion;
  }
}

const BANK_DOMAINS: Array<{ match: RegExp; domain: string; shortCode: string }> = [
  { match: /hbl|habib/i, domain: 'hbl.com', shortCode: 'HBL' },
  { match: /meezan/i, domain: 'meezanbank.com', shortCode: 'MBL' },
  { match: /alfalah/i, domain: 'bankalfalah.com', shortCode: 'BAFL' },
  { match: /ubl|united/i, domain: 'ubldigital.com', shortCode: 'UBL' },
  { match: /mcb/i, domain: 'mcb.com.pk', shortCode: 'MCB' },
  { match: /sadapay/i, domain: 'sadapay.pk', shortCode: 'SP' },
  { match: /nayapay/i, domain: 'nayapay.com', shortCode: 'NP' },
  { match: /faysal/i, domain: 'faysalbank.com', shortCode: 'FBL' },
  { match: /standard|scb/i, domain: 'sc.com', shortCode: 'SCB' },
  { match: /allied|abl/i, domain: 'abl.com', shortCode: 'ABL' },
  { match: /askari/i, domain: 'askaribank.com', shortCode: 'AKBL' },
  { match: /js\s*bank/i, domain: 'jsbl.com', shortCode: 'JS' },
];

export function getBankBrandingMeta(bankName: string): { logoUrl: string; shortCode: string; domain: string } {
  const found = BANK_DOMAINS.find((b) => b.match.test(bankName));
  if (found) {
    return {
      domain: found.domain,
      shortCode: found.shortCode,
      logoUrl: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(found.domain)}&sz=128`,
    };
  }
  const letters = bankName
    .split(/\s+/)
    .map((w) => w[0] || '')
    .join('')
    .slice(0, 3)
    .toUpperCase();
  return {
    domain: 'hbl.com',
    shortCode: letters || 'PK',
    logoUrl: '',
  };
}
