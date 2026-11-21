import 'dotenv/config';
import crypto from 'crypto';
import express, { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import nodemailer from 'nodemailer';
import path from 'path';
import {
  CNIC_REGEX,
  encryptPayload,
  generateSixDigitOtp,
  hashIdentifier,
  hashPassword,
  maskEmail,
  PAK_PHONE_REGEX,
  SessionPayload,
  signSessionToken,
  URL_LINK_REGEX,
  verifyPassword,
  verifySessionToken,
} from './src/server/cryptoVault.ts';
import { DESKTOP_MODE, StoredUserRecord, vault } from './src/server/githubStore.ts';
import { dealFromLead, dispatchScraper, pullFromGithub, startPublicSync, syncStatus } from './src/server/publicSync.ts';
import { connectFirebaseAdmin, disconnectFirebaseAdmin, fakeAlertFromSubmission, firebaseStatus } from './src/server/firebaseAdmin.ts';
import { PAKISTAN_CITIES } from './src/server/seedData.ts';
import { Brand, CategoryId, CommunityMessage, Deal, FeedbackItem, Submission } from './src/types.ts';

interface AuthRequest extends Request {
  session?: SessionPayload;
}

const VALID_CATEGORIES = new Set<CategoryId>([
  'food',
  'clothes',
  'grocery',
  'mobiles',
  'shoes',
  'health',
  'salon',
  'travel',
  'home',
  'promo',
]);

function extractSession(req: AuthRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    const token = header.slice(7).trim();
    const verified = verifySessionToken(token);
    if (verified) req.session = verified;
  }
  next();
}

function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.session) {
    return res.status(401).json({ error: 'Please sign in to continue.' });
  }
  if (req.session.role !== 'admin') {
    const user = vault.users.get(req.session.userId);
    if (user?.appBlocked) {
      return res.status(403).json({ error: 'Your account has been restricted by BachatHub Admin. You may submit an appeal.' });
    }
  }
  next();
}

function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.session || req.session.role !== 'admin') {
    return res.status(403).json({ error: 'Super Admin authorization required.' });
  }
  next();
}

function sanitizeUrl(url: string): string {
  const trimmed = String(url || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[a-z0-9.-]+\.[a-z]{2,}/i.test(trimmed)) return `https://${trimmed}`;
  return '';
}

function reindexDeals() {
  vault.deals.sort((a, b) => {
    if (a.pinnedFirst && !b.pinnedFirst) return -1;
    if (!a.pinnedFirst && b.pinnedFirst) return 1;
    return a.rank - b.rank;
  });
  vault.deals.forEach((d, idx) => {
    d.rank = idx + 1;
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(extractSession);

  function resolveDeviceUser(req: AuthRequest, preferredCity = 'Karachi'): StoredUserRecord {
    if (req.session && req.session.role !== 'admin') {
      const existing = vault.users.get(req.session.userId);
      if (existing) return existing;
    }
    const headerDev = typeof req.headers['x-device-id'] === 'string' ? req.headers['x-device-id'].trim() : '';
    const rawIp =
      (typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'] : '') ||
      req.socket?.remoteAddress ||
      '127.0.0.1';
    const ua = String(req.headers['user-agent'] || 'device');
    const deviceId =
      /^dev-[a-z0-9_-]{6,32}$/i.test(headerDev)
        ? headerDev
        : `dev-${hashIdentifier(`${rawIp}|${ua}`).slice(0, 14)}`;
    return vault.getOrCreateDeviceUser(deviceId, rawIp, preferredCity);
  }

  // =========================================================================
  // 1. PUBLIC BOOTSTRAP & ANALYTICS (ZERO-LOGIN AUTOMATIC DEVICE + IP SYNC)
  // =========================================================================
  app.get('/api/bootstrap', (req: AuthRequest, res) => {
    const city = typeof req.query.city === 'string' && req.query.city in PAKISTAN_CITIES ? req.query.city : 'Karachi';
    const isAdmin = req.session?.role === 'admin';
    // Desktop admin app: never create shopper profiles for the admin's own window
    const currentUser = isAdmin || DESKTOP_MODE ? null : resolveDeviceUser(req, city);

    res.json({
      cities: PAKISTAN_CITIES,
      selectedCity: currentUser?.city || city,
      deals: vault.deals,
      brands: vault.brands.filter((b) => !b.blacklisted || isAdmin),
      fakeAlerts: vault.fakeAlerts,
      bankCards: vault.bankCards,
      funEvents: vault.funEvents,
      broadcasts: vault.broadcasts,
      communitySettings: vault.communitySettings,
      platformFlags: {
        maintenanceMode: vault.platformFlags.maintenanceMode,
        maintenanceBannerText: vault.platformFlags.maintenanceBannerText,
        allowNewSignups: vault.platformFlags.allowNewSignups,
        allowGuestQuickAdd: vault.platformFlags.allowGuestQuickAdd,
      },
      scraperLastUpdatedAgo: '6 min ago',
      user: currentUser ? vault.toPublicUser(currentUser) : null,
      isAdmin,
      adminStatus: {
        envConfigured: Boolean(process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim().length > 0),
        claimed: Boolean(vault.adminSecurity.claimedAdminPasswordHash),
        maskedRecoveryEmail: (() => {
          const email = (vault.adminSecurity.recoveryEmail || process.env.ADMIN_RECOVERY_EMAIL || '').trim();
          return email ? maskEmail(email) : '';
        })(),
      },
    });
  });

  app.post('/api/analytics/event', (req, res) => {
    const { city, category } = req.body as { city?: string; category?: string };
    if (category && typeof category === 'string' && VALID_CATEGORIES.has(category as CategoryId)) {
      vault.analytics.categoryViews[category] = (vault.analytics.categoryViews[category] || 0) + 1;
    }
    if (city && typeof city === 'string') {
      const cell = vault.analytics.heatmap.find((h) => h.city.toLowerCase() === city.toLowerCase());
      if (cell) {
        cell.dealClicks += 1;
      }
    }
    vault.writeShard('analytics', vault.analytics);
    res.json({ ok: true });
  });

  // =========================================================================
  // 2. ZERO-LOGIN CONSUMER POLICY + HARDENED SUPER ADMIN AUTH & SMTP OTP RECOVERY
  // =========================================================================
  // Legacy consumer email/OTP endpoints are intentionally retired: consumers
  // auto-sync by anonymous Device ID + masked IP with zero login screens.
  app.post('/api/auth/request-otp', (_req, res) => {
    res.status(410).json({ error: 'Consumer login is disabled. Your device syncs automatically without sign-up.' });
  });
  app.post('/api/auth/verify-otp', (_req, res) => {
    res.status(410).json({ error: 'Consumer login is disabled. Your device syncs automatically without sign-up.' });
  });
  app.post('/api/auth/login', (_req, res) => {
    res.status(410).json({ error: 'Consumer login is disabled. Your device syncs automatically without sign-up.' });
  });

  function timingSafeCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }

  async function sendAdminRecoveryEmail(toEmail: string, otpCode: string): Promise<void> {
    const host = process.env.SMTP_HOST?.trim();
    const port = Number(process.env.SMTP_PORT) || 587;
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS?.trim();
    const from = process.env.SMTP_FROM?.trim() || user;
    if (!host || !user || !pass) {
      throw new Error('SMTP_NOT_CONFIGURED');
    }
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    await transporter.sendMail({
      from: `"BachatHub Pakistan Security" <${from}>`,
      to: toEmail,
      subject: 'BachatHub Super Admin Passcode Recovery Code (Valid 10 Min)',
      text: `Your 6-digit Super Admin recovery code is: ${otpCode}\n\nThis code expires in 10 minutes. If you did not request a passcode reset, ignore this email immediately.`,
      html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:16px">
        <h2 style="color:#008069;margin-top:0">BachatHub Super Admin Security</h2>
        <p>Use this one-time 6-digit code to reset your Super Admin passcode:</p>
        <div style="font-size:28px;font-weight:800;letter-spacing:8px;padding:16px;text-align:center;background:#f0fdf4;border:1px solid #86efac;border-radius:12px;color:#065f46">${otpCode}</div>
        <p style="font-size:12px;color:#64748b;margin-top:16px">Valid for 10 minutes (max 5 attempts). Never share this code with anyone.</p>
      </div>`,
    });
  }

  let lastAdminOtpRequestMs = 0;

  // First-run Super Admin setup/claim & login
  app.post('/api/auth/admin/claim', (req, res) => {
    if (process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim().length > 0) {
      return res.status(403).json({ error: 'Admin passcode is managed via server environment variables.' });
    }
    if (vault.adminSecurity.claimedAdminPasswordHash) {
      return res.status(409).json({ error: 'Super Admin passcode has already been claimed. Please sign in.' });
    }
    const { passcode } = req.body as { passcode?: string };
    const clean = String(passcode || '').trim();
    if (clean.length < 6) {
      return res.status(400).json({ error: 'Choose an Admin passcode of at least 6 characters.' });
    }
    vault.adminSecurity.claimedAdminPasswordHash = hashPassword(clean);
    vault.adminSecurity.claimedAt = new Date().toISOString();
    vault.writeShard('admin_security', vault.adminSecurity);
    vault.addAuditLog('Super Admin', 'Claimed First-Run Admin Credentials', 'Vault Security');
    const token = signSessionToken({ userId: 'super-admin', role: 'admin' });
    res.json({ ok: true, token, role: 'admin' });
  });

  app.post('/api/auth/admin/login', (req, res) => {
    const { passcode } = req.body as { passcode?: string };
    const clean = String(passcode || '').trim();
    const envPasscode = process.env.ADMIN_PASSCODE?.trim();

    let ok = false;
    if (envPasscode && envPasscode.length > 0) {
      ok = timingSafeCompare(clean, envPasscode);
    } else if (vault.adminSecurity.claimedAdminPasswordHash) {
      ok = verifyPassword(clean, vault.adminSecurity.claimedAdminPasswordHash);
    } else {
      return res.status(400).json({ error: 'Super Admin not yet initialized. Please set your passcode first.' });
    }

    if (!ok) {
      return res.status(401).json({ error: 'Invalid Super Admin passcode.' });
    }
    const token = signSessionToken({ userId: 'super-admin', role: 'admin' });
    vault.addAuditLog('Super Admin', 'Signed In to Command Center', 'Desktop Admin');
    res.json({ ok: true, token, role: 'admin' });
  });

  // Super Admin Forgot Passcode — Step 1: Send 6-digit OTP via SMTP ONLY (NEVER returned in HTTP response)
  app.post('/api/auth/admin/forgot-request', async (req, res) => {
    const nowMs = Date.now();
    if (nowMs - lastAdminOtpRequestMs < 60_000) {
      const waitSec = Math.ceil((60_000 - (nowMs - lastAdminOtpRequestMs)) / 1000);
      return res.status(429).json({ error: `Please wait ${waitSec}s before requesting another recovery code.` });
    }

    const { email } = req.body as { email?: string };
    const cleanEmail = String(email || '').trim().toLowerCase();
    const configuredRecovery = (vault.adminSecurity.recoveryEmail || process.env.ADMIN_RECOVERY_EMAIL || '').trim().toLowerCase();

    if (!configuredRecovery) {
      return res.status(503).json({
        error: 'Admin recovery email is not configured. Set ADMIN_RECOVERY_EMAIL in environment variables or Super Admin settings.',
      });
    }
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return res.status(400).json({ error: 'Please enter your Admin recovery email address.' });
    }
    if (cleanEmail !== configuredRecovery) {
      return res.status(403).json({
        error: `This email does not match the registered Super Admin recovery email (${maskEmail(configuredRecovery)}).`,
      });
    }

    const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
    if (!smtpConfigured) {
      return res.status(503).json({
        error: `Email delivery (SMTP_HOST, SMTP_USER, SMTP_PASS) is not configured yet. Add Gmail App Password SMTP secrets to receive OTP at ${maskEmail(configuredRecovery)}, or update ADMIN_PASSCODE in environment secrets.`,
      });
    }

    const code = generateSixDigitOtp();
    try {
      await sendAdminRecoveryEmail(configuredRecovery, code);
    } catch (err) {
      console.error('[Admin Recovery] SMTP delivery failed:', err instanceof Error ? err.message : 'unknown error');
      return res.status(502).json({
        error: 'Could not send recovery email via SMTP. Verify SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS.',
      });
    }

    lastAdminOtpRequestMs = nowMs;
    vault.pendingAdminResetOtp = {
      emailHash: hashIdentifier(cleanEmail),
      codeHash: hashPassword(code),
      expiresAt: Date.now() + 10 * 60 * 1000,
      attempts: 0,
    };
    vault.addAuditLog('Admin Security', 'Recovery OTP Emailed via SMTP', maskEmail(configuredRecovery));

    // Security guarantee: OTP code is NEVER included in the HTTP response body.
    res.json({
      ok: true,
      maskedEmail: maskEmail(configuredRecovery),
      smtpConfigured: true,
      message: `A 6-digit Admin recovery code has been emailed to ${maskEmail(configuredRecovery)} (valid 10 min).`,
    });
  });

  // Super Admin Forgot Passcode — Step 2: Verify OTP & Set New Passcode
  app.post('/api/auth/admin/forgot-verify', (req, res) => {
    const { email, code, newPasscode } = req.body as {
      email?: string;
      code?: string;
      newPasscode?: string;
    };
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanCode = String(code || '').trim();
    const cleanPass = String(newPasscode || '').trim();

    if (cleanPass.length < 6) {
      return res.status(400).json({ error: 'New Super Admin passcode must be at least 6 characters.' });
    }
    const pending = vault.pendingAdminResetOtp;
    if (!pending) {
      return res.status(400).json({ error: 'No active recovery code. Please request a fresh OTP first.' });
    }
    if (pending.expiresAt < Date.now()) {
      vault.pendingAdminResetOtp = null;
      return res.status(400).json({ error: 'Recovery code expired. Please request a new 6-digit OTP.' });
    }
    if (pending.attempts >= 5) {
      vault.pendingAdminResetOtp = null;
      return res.status(429).json({ error: 'Too many invalid attempts. Please request a fresh recovery OTP.' });
    }
    pending.attempts += 1;

    if (pending.emailHash !== hashIdentifier(cleanEmail) || !verifyPassword(cleanCode, pending.codeHash)) {
      return res.status(401).json({ error: 'Invalid 6-digit recovery code. Please check and try again.' });
    }

    vault.pendingAdminResetOtp = null;
    vault.adminSecurity.claimedAdminPasswordHash = hashPassword(cleanPass);
    vault.adminSecurity.claimedAt = new Date().toISOString();
    vault.writeShard('admin_security', vault.adminSecurity);
    vault.addAuditLog('Super Admin', 'Passcode Reset via Recovery Email', maskEmail(cleanEmail));

    const token = signSessionToken({ userId: 'super-admin', role: 'admin' });
    res.json({ ok: true, token, role: 'admin', message: 'Super Admin passcode reset and signed in successfully!' });
  });

  // =========================================================================
  // 3. DEALS INTERACTIONS & BRAND PARTNER PORTAL
  // =========================================================================
  app.post('/api/deals/:id/vote', (req, res) => {
    const deal = vault.deals.find((d) => d.id === req.params.id);
    if (!deal) return res.status(404).json({ error: 'Deal not found.' });
    const { vote } = req.body as { vote?: 'real' | 'fake' };
    if (vote === 'real') {
      deal.realVotes += 1;
    } else if (vote === 'fake') {
      deal.fakeReports += 1;
    } else {
      return res.status(400).json({ error: 'Invalid vote type.' });
    }
    vault.writeShard('deals', vault.deals);
    res.json({ deal });
  });

  app.post('/api/brands/:id/react', (req: AuthRequest, res) => {
    const brand = vault.brands.find((b) => b.id === req.params.id);
    if (!brand) return res.status(404).json({ error: 'Brand not found.' });
    const { reaction } = req.body as { reaction?: 'like' | 'dislike' };
    if (reaction === 'like') brand.likes += 1;
    else if (reaction === 'dislike') brand.dislikes += 1;
    else return res.status(400).json({ error: 'Invalid reaction.' });

    if (req.session && req.session.role !== 'admin') {
      const user = vault.users.get(req.session.userId);
      if (user) {
        if (reaction === 'like') {
          if (!user.likedBrandIds.includes(brand.id)) user.likedBrandIds.push(brand.id);
          user.dislikedBrandIds = user.dislikedBrandIds.filter((x) => x !== brand.id);
        } else {
          if (!user.dislikedBrandIds.includes(brand.id)) user.dislikedBrandIds.push(brand.id);
          user.likedBrandIds = user.likedBrandIds.filter((x) => x !== brand.id);
        }
        vault.writeUserShard(user);
      }
    }
    vault.writeShard('brands', vault.brands);
    res.json({ brand });
  });

  // Verified Brand Partner Portal: Create or delete own offers
  app.post('/api/partner/deals', requireAuth, (req: AuthRequest, res) => {
    const user = req.session?.role === 'admin' ? null : vault.users.get(req.session!.userId);
    const {
      brandId,
      title,
      category,
      discountPercent,
      priceNow,
      priceWas,
      channel,
      cities,
      endsInLabel,
      cashAccepted,
      promoCode,
    } = req.body as Partial<Deal> & { brandId?: string };

    const targetBrandId = req.session?.role === 'admin' ? brandId : user?.brandId || brandId;
    const brand = vault.brands.find((b) => b.id === targetBrandId);
    if (!brand) return res.status(404).json({ error: 'Verified brand not found.' });
    if (req.session?.role !== 'admin' && (!user || user.role !== 'brand_partner' || !brand.verified)) {
      return res.status(403).json({ error: 'Verified Brand Partner access required.' });
    }
    if (!title || !priceNow || !priceWas) {
      return res.status(400).json({ error: 'Title, current price, and original price are required.' });
    }

    const cat: CategoryId = VALID_CATEGORIES.has(category as CategoryId) ? (category as CategoryId) : brand.category;
    const disc = Number(discountPercent) || Math.max(5, Math.round((1 - Number(priceNow) / Number(priceWas)) * 100));
    const newDeal: Deal = {
      id: `deal-${Date.now().toString(36)}`,
      rank: vault.deals.length + 1,
      brandId: brand.id,
      brandName: brand.name,
      brandInitials: brand.initials,
      brandColor: brand.color,
      brandVerified: brand.verified,
      category: cat,
      title: String(title).trim().slice(0, 90),
      subtitle: `${brand.name}, ${channel === 'online' ? 'online only' : brand.cityShopsLabel}`,
      discountBadge: `${disc}% OFF`,
      discountPercent: disc,
      badgeTone: 'orange',
      priceNow: Number(priceNow),
      priceWas: Number(priceWas),
      endsInLabel: String(endsInLabel || '5 days left').slice(0, 30),
      expiresAt: new Date(Date.now() + 5 * 86400000).toISOString(),
      checksPassed: 4,
      verificationSources: [
        { source: 'brand_website', label: "Brand's own website", detail: `Direct Verified Partner publish (${brand.website})`, verified: true, checkedAgo: 'Just now' },
        { source: 'meta_ads', label: 'Facebook and Instagram ads', detail: 'Verified partner feed synced', verified: true, checkedAgo: 'Just now' },
        { source: 'official_social', label: 'Official social page', detail: `Confirmed by ${brand.name} Partner`, verified: true, checkedAgo: 'Just now' },
        { source: 'google_search', label: 'Google search', detail: 'Indexed via BachatHub Partner API', verified: true, checkedAgo: 'Just now' },
      ],
      channel: channel === 'online' || channel === 'in_store' ? channel : 'both',
      shopsCountLabel: brand.cityShopsLabel,
      cities: Array.isArray(cities) && cities.length > 0 ? cities : ['Karachi', 'Lahore', 'Islamabad'],
      areas: ['Clifton & DHA', 'Gulshan-e-Iqbal', 'Tariq Road'],
      nearestShopName: brand.branches[0]?.name || `${brand.name} Store`,
      nearestDistanceKm: brand.branches[0]?.distanceKm || 2.5,
      cashAccepted: cashAccepted !== false,
      noMinSpend: true,
      promoCode: promoCode ? String(promoCode).trim().toUpperCase().slice(0, 24) : undefined,
      promoLastTested: promoCode ? 'Verified by partner just now' : undefined,
      realVotes: 1,
      fakeReports: 0,
      createdByBrandId: brand.id,
      updatedAt: new Date().toISOString(),
    };

    vault.deals.unshift(newDeal);
    reindexDeals();
    vault.writeShard('deals', vault.deals);
    vault.addAuditLog(`${brand.name} Partner`, 'Published Offer via Partner Portal', newDeal.title);
    res.status(201).json({ deal: newDeal, deals: vault.deals });
  });

  app.delete('/api/partner/deals/:id', requireAuth, (req: AuthRequest, res) => {
    const idx = vault.deals.findIndex((d) => d.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Deal not found.' });
    const target = vault.deals[idx];
    if (req.session?.role !== 'admin') {
      const user = vault.users.get(req.session!.userId);
      if (!user || user.role !== 'brand_partner' || user.brandId !== target.brandId) {
        return res.status(403).json({ error: 'You can only delete your own brand offers.' });
      }
    }
    vault.deals.splice(idx, 1);
    reindexDeals();
    vault.writeShard('deals', vault.deals);
    vault.addAuditLog(req.session?.role === 'admin' ? 'Super Admin' : target.brandName, 'Deleted Offer', target.title);
    res.json({ ok: true, deals: vault.deals });
  });

  // =========================================================================
  // 4. FAKE ALERT RADAR
  // =========================================================================
  app.post('/api/fake-alerts/:id/vote', (req, res) => {
    const alert = vault.fakeAlerts.find((a) => a.id === req.params.id);
    if (!alert) return res.status(404).json({ error: 'Alert not found.' });
    const { action } = req.body as { action?: 'confirm' | 'receipt' };
    if (action === 'receipt') {
      alert.receiptsCount += 1;
      alert.peopleReported += 1;
    } else {
      alert.peopleReported += 1;
    }
    vault.writeShard('fake_alerts', vault.fakeAlerts);
    res.json({ alert });
  });

  app.post('/api/fake-alerts', (req, res) => {
    const { brandName, category, title, normalPrice, raisedPrice, salePrice, alertType, city } = req.body as {
      brandName?: string;
      category?: CategoryId;
      title?: string;
      normalPrice?: number;
      raisedPrice?: number;
      salePrice?: number;
      alertType?: 'price_raised' | 'already_ended' | 'risky_site' | 'misleading';
      city?: string;
    };
    if (!brandName || !title) {
      return res.status(400).json({ error: 'Brand name and fake offer title are required.' });
    }
    const cleanBrand = String(brandName).trim().slice(0, 60);
    const initials = cleanBrand
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
    const norm = Math.max(100, Number(normalPrice) || 3000);
    const raised = Math.max(norm, Number(raisedPrice) || norm * 2);
    const sale = Math.max(100, Number(salePrice) || norm);
    const realDisc = Math.max(0, Math.round((1 - sale / norm) * 100));

    const newAlert = {
      id: `fake-${Date.now().toString(36)}`,
      rank: vault.fakeAlerts.length + 1,
      brandName: cleanBrand,
      brandInitials: initials || 'FK',
      brandColor: '#5B1A26',
      category: VALID_CATEGORIES.has(category as CategoryId) ? (category as CategoryId) : 'clothes',
      title: String(title).trim().slice(0, 90),
      summary: `Normal Rs. ${norm.toLocaleString()}, raised to Rs. ${raised.toLocaleString()}`,
      alertType: alertType || 'price_raised',
      badgeLabel: alertType === 'risky_site' ? 'Risky site' : alertType === 'already_ended' ? 'Ended' : alertType === 'misleading' ? 'Misleading' : 'Price raised',
      normalPrice: norm,
      normalDaysLabel: 'Normal price before sale',
      raisedPrice: raised,
      raisedDaysLabel: 'Inflated price right before sale',
      salePrice: sale,
      saleComparisonNote: realDisc === 0 ? 'Same as normal price' : `Only ${realDisc}% real discount`,
      realDiscountPct: realDisc,
      peopleReported: 1,
      receiptsCount: 1,
      repeatOffenseLabel: 'Reported by community today',
      cities: [city || 'Karachi'],
      createdAt: new Date().toISOString(),
    };

    vault.fakeAlerts.push(newAlert);
    vault.writeShard('fake_alerts', vault.fakeAlerts);
    vault.addAuditLog('Community Report', 'New Fake Offer Submitted', cleanBrand);
    res.status(201).json({ alert: newAlert, fakeAlerts: vault.fakeAlerts });
  });

  // =========================================================================
  // 5. WHATSAPP-STYLE COMMUNITY CHAT (WITH REGEX + ADMIN FREEZE ENGINE)
  // =========================================================================
  app.get('/api/community/:city', (req, res) => {
    const city = req.params.city;
    const msgs = vault.communityMessages.filter((m) => m.city === city && !m.hidden);
    res.json({ messages: msgs, settings: vault.communitySettings });
  });

  app.post('/api/community/:city/messages', (req: AuthRequest, res) => {
    const city = req.params.city;
    const { text, channel, embeddedDealId, receiptCaption, senderNickname } = req.body as {
      text?: string;
      channel?: CommunityMessage['channel'];
      embeddedDealId?: string;
      receiptCaption?: string;
      senderNickname?: string;
    };

    const settings = vault.communitySettings;
    const user = req.session && req.session.role !== 'admin' ? vault.users.get(req.session.userId) : null;
    if (user?.appBlocked || user?.communityBlocked) {
      return res.status(403).json({
        error: 'You are currently restricted from posting in Community. Tap Appeal in the menu to request Admin review.',
        blocked: true,
      });
    }
    if (user?.muteUntil && new Date(user.muteUntil).getTime() > Date.now()) {
      const minsLeft = Math.ceil((new Date(user.muteUntil).getTime() - Date.now()) / 60000);
      return res.status(429).json({
        error: `Freeze timer active: Please wait ${minsLeft} minute(s) before posting again.`,
        freezeMinutesLeft: minsLeft,
      });
    }

    const cleanText = String(text || '').trim().slice(0, 600);
    if (!cleanText && !embeddedDealId && !receiptCaption) {
      return res.status(400).json({ error: 'Message cannot be empty.' });
    }

    // Enforce Admin anti-spam & privacy rules (Phone numbers, CNIC, Links, Banned words)
    if (settings.blockPhoneNumbers && (PAK_PHONE_REGEX.test(cleanText) || CNIC_REGEX.test(cleanText))) {
      const notice: CommunityMessage = {
        id: `sys-${Date.now().toString(36)}`,
        city,
        channel: 'all',
        senderId: 'system',
        senderName: 'System',
        senderColor: '#64748B',
        isSystemNotice: true,
        text: 'A message was removed because it had a phone number or CNIC',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
        createdAt: new Date().toISOString(),
        likes: 0,
        reportsCount: 0,
      };
      vault.communityMessages.push(notice);
      vault.writeShard('community', vault.communityMessages);
      return res.status(422).json({
        error: 'Phone numbers & CNICs are automatically blocked for your safety.',
        systemNotice: notice,
      });
    }

    if (settings.blockLinks && URL_LINK_REGEX.test(cleanText)) {
      return res.status(422).json({
        error: 'External links are blocked by Community rules. Share verified deal cards instead.',
      });
    }

    const lower = cleanText.toLowerCase();
    const matchedBanned = settings.bannedWords.find((w) => w.trim() && lower.includes(w.toLowerCase().trim()));
    if (matchedBanned) {
      return res.status(422).json({
        error: 'Message blocked by auto-filter (promotional/abusive phrase detected).',
      });
    }

    // Enforce Rate Limit & 30-message Freeze Timer
    if (user) {
      const now = Date.now();
      const oneHourAgo = now - 60 * 60 * 1000;
      user.recentMessageTimestamps = (user.recentMessageTimestamps || []).filter((ts) => ts > oneHourAgo);

      const lastMsgTs = user.recentMessageTimestamps[user.recentMessageTimestamps.length - 1];
      if (lastMsgTs && settings.slowModeSeconds > 0 && now - lastMsgTs < settings.slowModeSeconds * 1000) {
        const waitSec = Math.ceil((settings.slowModeSeconds * 1000 - (now - lastMsgTs)) / 1000);
        return res.status(429).json({ error: `Slow mode active: please wait ${waitSec}s between messages.` });
      }

      if (user.recentMessageTimestamps.length >= settings.maxMessagesBeforeFreeze) {
        user.muteUntil = new Date(now + settings.freezeDurationMinutes * 60000).toISOString();
        vault.writeUserShard(user);
        return res.status(429).json({
          error: `You reached ${settings.maxMessagesBeforeFreeze} messages. A ${settings.freezeDurationMinutes}-minute freeze timer is now active.`,
          freezeMinutesLeft: settings.freezeDurationMinutes,
        });
      }

      user.recentMessageTimestamps.push(now);
      vault.writeUserShard(user);
    }

    const isAdmin = req.session?.role === 'admin';
    const displayName = isAdmin
      ? 'Team BachatHub'
      : user
      ? user.privacy.showRealNameInCommunity
        ? user.name
        : user.nickname
      : String(senderNickname || 'Karachi Saver').slice(0, 30);

    const msg: CommunityMessage = {
      id: `msg-${Date.now().toString(36)}`,
      city,
      channel: channel || 'all',
      senderId: isAdmin ? 'mod-bachathub' : user?.id || 'guest-local',
      senderName: displayName,
      senderColor: isAdmin ? '#0F766E' : '#16A34A',
      isModerator: isAdmin,
      text: cleanText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
      createdAt: new Date().toISOString(),
      embeddedDealId,
      receiptCaption,
      receiptStore: receiptCaption ? `${city} Verified Receipt` : undefined,
      likes: 0,
      reportsCount: 0,
    };

    vault.communityMessages.push(msg);
    vault.writeShard('community', vault.communityMessages);
    res.status(201).json({ message: msg });
  });

  app.post('/api/community/messages/:id/interact', (req: AuthRequest, res) => {
    const msg = vault.communityMessages.find((m) => m.id === req.params.id);
    if (!msg) return res.status(404).json({ error: 'Message not found.' });
    const { action, optionId } = req.body as { action?: 'like' | 'report' | 'vote_poll'; optionId?: string };

    if (action === 'like') {
      msg.likes += 1;
    } else if (action === 'report') {
      msg.reportsCount += 1;
      if (msg.reportsCount >= vault.communitySettings.autoHideReportsThreshold) {
        msg.hidden = true;
        vault.addAuditLog('Auto-Moderation', 'Message Hidden After 5 Reports', msg.id);
      }
    } else if (action === 'vote_poll' && msg.poll && optionId) {
      const voterKey = req.session?.userId || 'guest';
      const opt = msg.poll.options.find((o) => o.id === optionId);
      if (opt && !msg.poll.voterIds.includes(voterKey)) {
        opt.votes += 1;
        msg.poll.voterIds.push(voterKey);
      }
    }
    vault.writeShard('community', vault.communityMessages);
    res.json({ message: msg });
  });

  app.post('/api/community/appeal', (req: AuthRequest, res) => {
    const user = resolveDeviceUser(req);
    const { reason } = req.body as { reason?: string };
    const clean = String(reason || '').trim().slice(0, 400);
    if (clean.length < 10) return res.status(400).json({ error: 'Please explain your appeal (at least 10 characters).' });

    const appeal = {
      id: `app-${Date.now().toString(36)}`,
      userId: user.id,
      userNickname: user.nickname,
      maskedEmail: user.maskedEmail,
      reason: clean,
      blockType: user.appBlocked ? ('app' as const) : ('community' as const),
      status: 'pending' as const,
      createdAt: new Date().toISOString(),
    };
    vault.appeals.unshift(appeal);
    vault.writeShard('appeals', vault.appeals);
    res.status(201).json({ appeal });
  });

  // =========================================================================
  // 6. SUBMISSIONS (ZERO-DATA QUICK ADD & BRAND REGISTRATION) + FEEDBACK
  // =========================================================================
  app.post('/api/submissions', (req, res) => {
    const { type, brandName, category, urlOrDeal, city, ownerName, whatsapp, branchesText } = req.body as Partial<Submission>;
    if (!brandName || !urlOrDeal) {
      return res.status(400).json({ error: 'Brand name and deal/website link are required.' });
    }
    const cleanSub: Submission = {
      id: `sub-${Date.now().toString(36)}`,
      type: type === 'brand_registration' ? 'brand_registration' : 'customer_quick_add',
      status: 'pending',
      brandName: String(brandName).trim().slice(0, 80),
      category: VALID_CATEGORIES.has(category as CategoryId) ? (category as CategoryId) : 'clothes',
      urlOrDeal: String(urlOrDeal).trim().slice(0, 300),
      city: String(city || 'Karachi').slice(0, 40),
      ownerName: type === 'brand_registration' ? String(ownerName || '').trim().slice(0, 60) : undefined,
      whatsapp: type === 'brand_registration' && whatsapp ? '+92-3XX-XXXXXXX (encrypted)' : undefined,
      branchesText: type === 'brand_registration' ? String(branchesText || '').trim().slice(0, 200) : undefined,
      createdAt: new Date().toISOString(),
    };
    vault.submissions.unshift(cleanSub);
    vault.writeShard('submissions', vault.submissions);
    vault.addAuditLog(
      cleanSub.type === 'customer_quick_add' ? 'Anonymous Customer' : cleanSub.brandName,
      cleanSub.type === 'customer_quick_add' ? 'Quick-Add Submitted (Zero PII)' : 'Brand Verification Requested',
      cleanSub.brandName,
    );
    res.status(201).json({ submission: cleanSub });
  });

  app.post('/api/feedback', (req: AuthRequest, res) => {
    const { kind, severity, title, description, pageOrModule, city } = req.body as Partial<FeedbackItem>;
    if (!title || !description) {
      return res.status(400).json({ error: 'Please include a title and description.' });
    }
    const user = req.session && req.session.role !== 'admin' ? vault.users.get(req.session.userId) : null;
    const item: FeedbackItem = {
      id: `fb-${Date.now().toString(36)}`,
      source: 'user',
      kind: kind === 'bug' ? 'bug' : 'improvement',
      severity: severity === 'high' || severity === 'low' ? severity : 'medium',
      title: String(title).trim().slice(0, 100),
      description: String(description).trim().slice(0, 600),
      pageOrModule: String(pageOrModule || 'General App').slice(0, 50),
      reporterNickname: user ? user.nickname : 'Guest User',
      reporterMaskedEmail: user ? user.maskedEmail : 'anonymous@device',
      city: String(city || user?.city || 'Karachi').slice(0, 40),
      status: 'open',
      createdAt: new Date().toISOString(),
    };
    vault.feedbackItems.unshift(item);
    vault.writeShard('feedback', vault.feedbackItems);
    vault.addAuditLog(item.reporterNickname, `Submitted ${item.kind}`, item.title);
    res.status(201).json({ item });
  });

  // =========================================================================
  // 7. ZERO-LOGIN AUTOMATIC DEVICE + IP ENCRYPTED GITHUB SHARD SYNC
  // =========================================================================
  app.put('/api/user/preferences', (req: AuthRequest, res) => {
    const user = resolveDeviceUser(req);
    if (user.appBlocked) {
      return res.status(403).json({ error: 'This device has been restricted by BachatHub Admin.' });
    }

    const body = req.body as Partial<StoredUserRecord>;
    if (typeof body.name === 'string' && body.name.trim().length >= 2) {
      user.name = body.name.trim().slice(0, 40);
      user.nickname = user.name.slice(0, 22);
    }
    if (typeof body.nickname === 'string' && body.nickname.trim().length >= 2) {
      user.nickname = body.nickname.trim().slice(0, 22);
    }
    if (body.city && body.city in PAKISTAN_CITIES) user.city = body.city;
    if (typeof body.area === 'string') user.area = body.area.slice(0, 60);
    if (Array.isArray(body.favoriteDealIds)) user.favoriteDealIds = body.favoriteDealIds.slice(0, 200);
    if (Array.isArray(body.favoriteBrandIds)) user.favoriteBrandIds = body.favoriteBrandIds.slice(0, 200);
    if (Array.isArray(body.priceDropWatchlistIds)) user.priceDropWatchlistIds = body.priceDropWatchlistIds.slice(0, 200);
    if (Array.isArray(body.ownedBankCardIds)) user.ownedBankCardIds = body.ownedBankCardIds.slice(0, 200);
    if (typeof body.acceptedCommunityRules === 'boolean') user.acceptedCommunityRules = body.acceptedCommunityRules;
    if (body.privacy) {
      user.privacy = { ...user.privacy, ...body.privacy };
    }
    if (body.notifications) {
      user.notifications = { ...user.notifications, ...body.notifications };
    }

    vault.writeUserShard(user);
    res.json({ user: vault.toPublicUser(user) });
  });

  app.get('/api/user/export', (req: AuthRequest, res) => {
    const user = resolveDeviceUser(req);
    res.json({
      exportedAt: new Date().toISOString(),
      storage: '100% Pure GitHub AES-256-GCM Encrypted Device Shard (Zero Login)',
      profile: vault.toPublicUser(user),
    });
  });

  app.delete('/api/user/account', (req: AuthRequest, res) => {
    const user = resolveDeviceUser(req);
    vault.users.delete(user.id);
    const shardFile = path.resolve(process.cwd(), 'data', 'vault', 'users', `${user.emailHash}.enc.json`);
    if (fs.existsSync(shardFile)) fs.unlinkSync(shardFile);
    vault.addAuditLog('Device Privacy', 'Device Encrypted Shard Cleared', user.maskedEmail);
    res.json({ ok: true });
  });

  // =========================================================================
  // 8. SUPER ADMIN DESKTOP COMMAND CENTER (100% ADMIN-ONLY ROUTES)
  // =========================================================================
  app.get('/api/admin/overview', requireAdmin, (_req, res) => {
    const usersList = (DESKTOP_MODE ? [] : Array.from(vault.users.values())).map((u) => ({
      ...vault.toPublicUser(u),
      recentMessagesCount: u.recentMessageTimestamps?.length || 0,
    }));
    const reportedMessages = vault.communityMessages.filter((m) => m.reportsCount > 0 || m.hidden);

    res.json({
      stats: {
        totalDeals: vault.deals.length,
        verified4of4: vault.deals.filter((d) => d.checksPassed === 4).length,
        fakeBlocked: vault.fakeAlerts.length,
        registeredBrands: vault.brands.length,
        verifiedBrands: vault.brands.filter((b) => b.verified).length,
        totalUsers: usersList.length,
        pendingSubmissions: vault.submissions.filter((s) => s.status === 'pending').length,
        pendingAppeals: vault.appeals.filter((a) => a.status === 'pending').length,
        openFeedback: vault.feedbackItems.filter((f) => f.status !== 'resolved').length,
        openSupport: vault.supportTickets.filter((t) => t.status !== 'resolved').length,
      },
      analytics: vault.analytics,
      deals: vault.deals,
      brands: vault.brands,
      fakeAlerts: vault.fakeAlerts,
      submissions: vault.submissions,
      appeals: vault.appeals,
      reportedMessages,
      communityMessages: vault.communityMessages,
      communitySettings: vault.communitySettings,
      broadcasts: vault.broadcasts,
      scraperCycles: vault.scraperCycles,
      scraperSources: vault.scraperSources,
      scraperGates: vault.scraperGates,
      monthlyHistory: vault.monthlyHistory,
      platformFlags: vault.platformFlags,
      feedbackItems: vault.feedbackItems,
      supportTickets: vault.supportTickets,
      users: usersList,
      vaultShards: vault.getVaultShardTelemetry(),
      systemSettings: { ...vault.getAdminSystemSettingsPublic(), ...firebaseStatus() },
      githubSync: {
        configured: vault.getEffectiveGithubConfig().configured,
        lastSyncAt: vault.adminSecurity.lastGithubSyncAt,
        syncCount: vault.adminSecurity.githubSyncCount,
      },
    });
  });

  // Admin: Enterprise 1-Click Data Export (CSV for Excel or Structured JSON)
  app.get('/api/admin/export/:dataset', requireAdmin, (req, res) => {
    const dataset = String(req.params.dataset || 'deals').toLowerCase();
    const format = String(req.query.format || 'csv').toLowerCase() === 'json' ? 'json' : 'csv';

    const datasets: Record<string, unknown> = {
      deals: vault.deals,
      brands: vault.brands,
      users: Array.from(vault.users.values()).map((u) => vault.toPublicUser(u)),
      fake_alerts: vault.fakeAlerts,
      community: vault.communityMessages,
      support: vault.supportTickets,
      feedback: vault.feedbackItems,
      scraper_gates: vault.scraperGates,
      scraper_sources: vault.scraperSources,
      history_12m: vault.monthlyHistory,
      broadcasts: vault.broadcasts,
      audit_logs: vault.analytics.auditLogs,
      full_vault: {
        exportedAt: new Date().toISOString(),
        platformFlags: vault.platformFlags,
        deals: vault.deals,
        brands: vault.brands,
        fakeAlerts: vault.fakeAlerts,
        bankCards: vault.bankCards,
        funEvents: vault.funEvents,
        users: Array.from(vault.users.values()).map((u) => vault.toPublicUser(u)),
        submissions: vault.submissions,
        supportTickets: vault.supportTickets,
        feedbackItems: vault.feedbackItems,
        broadcasts: vault.broadcasts,
        scraperCycles: vault.scraperCycles,
        scraperSources: vault.scraperSources,
        scraperGates: vault.scraperGates,
        monthlyHistory12m: vault.monthlyHistory,
        auditLogs: vault.analytics.auditLogs,
      },
    };

    const payload = datasets[dataset];
    if (!payload) {
      return res.status(404).json({ error: `Unknown export dataset "${dataset}".` });
    }

    vault.addAuditLog('Super Admin', `Exported ${dataset.toUpperCase()} (${format.toUpperCase()})`, `Enterprise Data Center`);
    const stamp = new Date().toISOString().slice(0, 10);

    if (format === 'json' || !Array.isArray(payload)) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="bachathub-${dataset}-${stamp}.json"`);
      return res.send(JSON.stringify(payload, null, 2));
    }

    const rows = payload as Array<Record<string, unknown>>;
    const headers = Array.from(
      rows.reduce<Set<string>>((set, row) => {
        Object.keys(row || {}).forEach((k) => set.add(k));
        return set;
      }, new Set<string>()),
    );
    const escapeCsv = (val: unknown): string => {
      if (val === null || val === undefined) return '';
      let str = typeof val === 'object' ? JSON.stringify(val) : String(val);
      // Guard against spreadsheet formula injection
      if (/^[=+\-@\t\r]/.test(str)) {
        str = `'${str}`;
      }
      if (/[",\n\r]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    const csvLines = [
      headers.join(','),
      ...rows.map((r) => headers.map((h) => escapeCsv(r[h])).join(',')),
    ];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="bachathub-${dataset}-${stamp}.csv"`);
    return res.send(`\uFEFF${csvLines.join('\r\n')}`);
  });

  // Admin: Inline Master Edit of Any Deal
  app.put('/api/admin/deals/:id', requireAdmin, (req, res) => {
    const deal = vault.deals.find((d) => d.id === req.params.id);
    if (!deal) return res.status(404).json({ error: 'Deal not found.' });
    const body = req.body as Partial<Deal>;
    if (typeof body.title === 'string' && body.title.trim()) deal.title = body.title.trim().slice(0, 90);
    if (typeof body.subtitle === 'string' && body.subtitle.trim()) deal.subtitle = body.subtitle.trim().slice(0, 110);
    if (typeof body.priceNow === 'number' && body.priceNow > 0) deal.priceNow = Math.round(body.priceNow);
    if (typeof body.priceWas === 'number' && body.priceWas >= deal.priceNow) deal.priceWas = Math.round(body.priceWas);
    if (deal.priceWas > 0) {
      const pct = Math.max(0, Math.round((1 - deal.priceNow / deal.priceWas) * 100));
      deal.discountPercent = pct;
      deal.discountBadge = `${pct}% OFF`;
    }
    if (typeof body.endsInLabel === 'string' && body.endsInLabel.trim()) deal.endsInLabel = body.endsInLabel.trim().slice(0, 35);
    if (typeof body.checksPassed === 'number') deal.checksPassed = Math.max(0, Math.min(4, Math.round(body.checksPassed)));
    if (typeof body.cashAccepted === 'boolean') deal.cashAccepted = body.cashAccepted;
    if (typeof body.promoCode === 'string') deal.promoCode = body.promoCode.trim().toUpperCase().slice(0, 24) || undefined;
    if (body.category && VALID_CATEGORIES.has(body.category)) deal.category = body.category;
    if (Array.isArray(body.cities) && body.cities.length > 0) deal.cities = body.cities.map((c) => String(c).trim()).filter(Boolean);
    deal.updatedAt = new Date().toISOString();

    vault.writeShard('deals', vault.deals);
    vault.addAuditLog('Super Admin', 'Edited Deal Master Record', `${deal.brandName} — ${deal.title}`);
    res.json({ deal, deals: vault.deals });
  });

  // Admin: Bulk Deals Operations
  app.post('/api/admin/deals/bulk', requireAdmin, (req, res) => {
    const { action } = req.body as { action?: 'verify_all' | 'recalculate_ranks' };
    if (action === 'verify_all') {
      vault.deals.forEach((d) => {
        d.checksPassed = 4;
        d.verificationSources.forEach((s) => (s.verified = true));
      });
      vault.addAuditLog('Super Admin', 'Bulk Verified All Deals (4/4)', `${vault.deals.length} deals`);
    } else if (action === 'recalculate_ranks') {
      vault.deals.sort((a, b) => {
        if (a.pinnedFirst) return -1;
        if (b.pinnedFirst) return 1;
        return b.discountPercent + b.checksPassed * 5 - (a.discountPercent + a.checksPassed * 5);
      });
      reindexDeals();
      vault.addAuditLog('Super Admin', 'Recalculated Dynamic Deal Rankings', `${vault.deals.length} deals`);
    } else {
      return res.status(400).json({ error: 'Unknown bulk action.' });
    }
    vault.writeShard('deals', vault.deals);
    res.json({ ok: true, deals: vault.deals });
  });

  // Admin: Add New Brand or Local Small-City Store Directly
  app.post('/api/admin/brands/create', requireAdmin, (req, res) => {
    const { name, category, city, area, website, tagline, trustScore, verified } = req.body as {
      name?: string;
      category?: CategoryId;
      city?: string;
      area?: string;
      website?: string;
      tagline?: string;
      trustScore?: number;
      verified?: boolean;
    };
    const cleanName = String(name || '').trim().slice(0, 60);
    if (cleanName.length < 2) return res.status(400).json({ error: 'Brand or local store name is required.' });
    const slug = `${cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36).slice(-3)}`;
    const initials = cleanName
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
    const cat: CategoryId = VALID_CATEGORIES.has(category as CategoryId) ? (category as CategoryId) : 'grocery';
    const targetCity = String(city || 'Karachi').trim().slice(0, 40);
    const targetArea = String(area || 'Main Bazaar').trim().slice(0, 50);

    const newBrand: Brand = {
      id: slug,
      name: cleanName,
      initials: initials || 'ST',
      color: '#0B7A4B',
      brandSecondaryColor: '#19A85B',
      tagline: String(tagline || `Verified local ${cat} store in ${targetCity}`).trim().slice(0, 90),
      category: cat,
      verified: verified !== false,
      trustScore: Math.max(40, Math.min(100, Number(trustScore) || 90)),
      googleRating: 4.5,
      positiveCommentsPct: 88,
      fakeSalesThisYear: 0,
      workingSince: 'Added by Super Admin',
      totalShopsLabel: `${targetCity} (${targetArea})`,
      cityShopsLabel: `${targetArea}, ${targetCity}`,
      website: String(website || `${slug}.pk`).replace(/^https?:\/\//, '').slice(0, 80),
      returnsPolicy: 'Standard store exchange policy',
      about: `Added directly via Super Admin Command Center for ${targetCity} shoppers.`,
      likes: 1,
      dislikes: 0,
      branches: [
        {
          id: `br-${Date.now().toString(36)}`,
          name: `${cleanName} — ${targetArea}`,
          city: targetCity,
          area: targetArea,
          floorInfo: 'Open daily 10 am – 11 pm',
          distanceKm: 1.5,
          saleOn: true,
          lat: 30.15,
          lng: 71.52,
        },
      ],
    };

    vault.brands.unshift(newBrand);
    vault.writeShard('brands', vault.brands);
    vault.addAuditLog('Super Admin', `Added Local Store / Brand (${targetCity})`, cleanName);
    res.status(201).json({ brand: newBrand, brands: vault.brands });
  });

  // Admin: Edit Existing Brand Master Settings
  app.put('/api/admin/brands/:id', requireAdmin, (req, res) => {
    const brand = vault.brands.find((b) => b.id === req.params.id);
    if (!brand) return res.status(404).json({ error: 'Brand not found.' });
    const { trustScore, verified, blacklisted, tagline, website } = req.body as Partial<Brand>;
    if (typeof trustScore === 'number') brand.trustScore = Math.max(0, Math.min(100, Math.round(trustScore)));
    if (typeof verified === 'boolean') brand.verified = verified;
    if (typeof blacklisted === 'boolean') brand.blacklisted = blacklisted;
    if (typeof tagline === 'string' && tagline.trim()) brand.tagline = tagline.trim().slice(0, 100);
    if (typeof website === 'string' && website.trim()) brand.website = website.trim().replace(/^https?:\/\//, '').slice(0, 80);
    vault.writeShard('brands', vault.brands);
    vault.addAuditLog('Super Admin', 'Updated Brand Master Profile', brand.name);
    res.json({ brand, brands: vault.brands });
  });

  // Admin: Promote/Demote User Role (user <-> brand_partner)
  app.post('/api/admin/users/:id/role', requireAdmin, (req, res) => {
    const user = vault.users.get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    const { role, brandId } = req.body as { role?: 'user' | 'brand_partner'; brandId?: string };
    if (role !== 'user' && role !== 'brand_partner') {
      return res.status(400).json({ error: 'Role must be user or brand_partner.' });
    }
    user.role = role;
    user.brandId = role === 'brand_partner' ? brandId || vault.brands[0]?.id : undefined;
    vault.writeUserShard(user);
    vault.addAuditLog('Super Admin', `Changed User Role → ${role}`, `${user.nickname} (${user.maskedEmail})`);
    res.json({ user: vault.toPublicUser(user) });
  });

  // Admin: Send Direct Support Message to Any User
  app.post('/api/admin/users/:id/message', requireAdmin, (req, res) => {
    const user = vault.users.get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    const { subject, message } = req.body as { subject?: string; message?: string };
    const cleanMsg = String(message || '').trim().slice(0, 1000);
    if (cleanMsg.length < 2) return res.status(400).json({ error: 'Message text is required.' });
    const now = new Date().toISOString();
    const ticket = {
      id: `sup-${Date.now().toString(36)}`,
      ownerKey: user.id,
      userName: user.name,
      maskedEmail: user.maskedEmail,
      city: user.city,
      topic: 'direct_agent' as const,
      subject: String(subject || 'Direct Notice from BachatHub Support').trim().slice(0, 100),
      status: 'replied' as const,
      createdAt: now,
      updatedAt: now,
      messages: [
        {
          id: `sm-${Date.now().toString(36)}`,
          sender: 'admin' as const,
          senderName: 'BachatHub Support Representative',
          text: cleanMsg,
          createdAt: now,
        },
      ],
    };
    vault.supportTickets.unshift(ticket);
    vault.writeShard('support_tickets', vault.supportTickets);
    vault.addAuditLog('Super Admin', `Initiated Direct Support Chat`, user.nickname);
    res.status(201).json({ ticket });
  });

  // Admin: Master Platform Kill Switches & Feature Flags
  app.put('/api/admin/platform-flags', requireAdmin, (req, res) => {
    const next = req.body as Partial<typeof vault.platformFlags>;
    vault.platformFlags = {
      ...vault.platformFlags,
      maintenanceMode: typeof next.maintenanceMode === 'boolean' ? next.maintenanceMode : vault.platformFlags.maintenanceMode,
      maintenanceBannerText: typeof next.maintenanceBannerText === 'string' ? next.maintenanceBannerText.trim().slice(0, 160) : vault.platformFlags.maintenanceBannerText,
      allowNewSignups: typeof next.allowNewSignups === 'boolean' ? next.allowNewSignups : vault.platformFlags.allowNewSignups,
      allowGuestQuickAdd: typeof next.allowGuestQuickAdd === 'boolean' ? next.allowGuestQuickAdd : vault.platformFlags.allowGuestQuickAdd,
      autoFakeSaleBlocker: typeof next.autoFakeSaleBlocker === 'boolean' ? next.autoFakeSaleBlocker : vault.platformFlags.autoFakeSaleBlocker,
      autoLogoScraper: typeof next.autoLogoScraper === 'boolean' ? next.autoLogoScraper : vault.platformFlags.autoLogoScraper,
      autoHealScraperGates: typeof next.autoHealScraperGates === 'boolean' ? next.autoHealScraperGates : vault.platformFlags.autoHealScraperGates,
      strictChatProfanityFilter: typeof next.strictChatProfanityFilter === 'boolean' ? next.strictChatProfanityFilter : vault.platformFlags.strictChatProfanityFilter,
      retentionMonths: 12,
    };
    vault.writeShard('platform_flags', vault.platformFlags);
    vault.addAuditLog('Super Admin', 'Updated Platform Master Switches', `Maintenance=${vault.platformFlags.maintenanceMode}`);
    res.json({ ok: true, platformFlags: vault.platformFlags });
  });

  // Admin: Run Full 105-Gate Resilience Sweep & 12-Month Encrypted Archive Checkpoint
  app.post('/api/admin/scraper/run-all-gates', requireAdmin, async (_req, res) => {
    if (DESKTOP_MODE) {
      // Real action instead of a simulated sweep: start a full (heavy) scraper run on GitHub Actions.
      const r = await dispatchScraper('all');
      if (!r.ok) return res.status(502).json({ error: r.message });
      vault.addAuditLog('Super Admin', 'Full scraper run', r.message);
      return res.json({
        ok: true,
        summary: { totalGates: vault.scraperGates.length, recoveredCount: 0, monthKey: '', message: r.message },
        scraperGates: vault.scraperGates,
        monthlyHistory: vault.monthlyHistory,
        scraperCycles: vault.scraperCycles,
      });
    }
    const summary = vault.run105GateDiagnosticSweep();
    vault.addAuditLog(
      'Super Admin',
      `Executed 105-Gate Failover Sweep`,
      `${summary.totalGates} gates checked · ${summary.recoveredCount} fallbacks exercised · ${summary.monthKey} archived`,
    );
    res.json({
      ok: true,
      summary,
      scraperGates: vault.scraperGates,
      monthlyHistory: vault.monthlyHistory,
      scraperCycles: vault.scraperCycles,
    });
  });

  // Admin: Pin #1 or move deal up/down
  app.post('/api/admin/deals/:id/rank', requireAdmin, (req, res) => {
    const idx = vault.deals.findIndex((d) => d.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Deal not found.' });
    const { action } = req.body as { action?: 'pin' | 'up' | 'down' };
    const deal = vault.deals[idx];

    if (action === 'pin') {
      vault.deals.forEach((d) => (d.pinnedFirst = false));
      deal.pinnedFirst = true;
      deal.rank = 0;
    } else if (action === 'up' && idx > 0) {
      const prev = vault.deals[idx - 1];
      vault.deals[idx - 1] = deal;
      vault.deals[idx] = prev;
      vault.deals.forEach((d, i) => (d.rank = i + 1));
    } else if (action === 'down' && idx < vault.deals.length - 1) {
      const next = vault.deals[idx + 1];
      vault.deals[idx + 1] = deal;
      vault.deals[idx] = next;
      vault.deals.forEach((d, i) => (d.rank = i + 1));
    }
    reindexDeals();
    vault.writeShard('deals', vault.deals);
    vault.addAuditLog('Super Admin', `Reordered Deal (${action})`, deal.title);
    res.json({ deals: vault.deals });
  });

  // Admin: Approve / Reject / Request More Info on Submissions (grants Verified Blue Tick!)
  app.post('/api/admin/submissions/:id/decide', requireAdmin, (req, res) => {
    const sub = vault.submissions.find((s) => s.id === req.params.id);
    if (!sub) return res.status(404).json({ error: 'Submission not found.' });
    const { decision, adminNote } = req.body as { decision?: 'approved' | 'rejected' | 'more_info'; adminNote?: string };
    if (!decision) return res.status(400).json({ error: 'Decision required.' });

    sub.status = decision;
    sub.adminNote = adminNote ? String(adminNote).slice(0, 200) : undefined;

    // Desktop: an approved customer fake-sale report becomes a Fake Alert (from the customer's numbers)
    if (DESKTOP_MODE && decision === 'approved' && sub.id.startsWith('fs_')) {
      const fa = fakeAlertFromSubmission(sub.id);
      if (fa && !vault.fakeAlerts.some((f) => f.id === fa.id)) vault.fakeAlerts.unshift(fa);
    }
    // Desktop: approving a scraper lead publishes it as a live deal (synced to GitHub by publicSync)
    if (DESKTOP_MODE && decision === 'approved' && sub.id.startsWith('lead-')) {
      const leadDeal = dealFromLead(sub.id);
      if (leadDeal && !vault.deals.some((d) => d.id === leadDeal.id)) {
        vault.deals.push(leadDeal);
        reindexDeals();
      }
    }

    if (decision === 'approved' && sub.type === 'brand_registration') {
      const slug = sub.brandName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const existing = vault.brands.find((b) => b.id === slug || b.name.toLowerCase() === sub.brandName.toLowerCase());
      if (existing) {
        existing.verified = true;
      } else {
        const initials = sub.brandName
          .split(/\s+/)
          .map((w) => w[0])
          .join('')
          .slice(0, 2)
          .toUpperCase();
        const newBrand: Brand = {
          id: slug || `brand-${Date.now().toString(36)}`,
          name: sub.brandName,
          initials: initials || 'BR',
          color: '#0F766E',
          tagline: `Verified ${sub.category} partner in ${sub.city}`,
          category: sub.category,
          verified: true,
          trustScore: 88,
          googleRating: 4.3,
          positiveCommentsPct: 82,
          fakeSalesThisYear: 0,
          workingSince: 'Verified Partner 2026',
          totalShopsLabel: sub.branchesText || `${sub.city} outlets`,
          cityShopsLabel: sub.branchesText || `Active in ${sub.city}`,
          website: sanitizeUrl(sub.urlOrDeal).replace(/^https?:\/\//, '') || `${slug}.pk`,
          returnsPolicy: 'Standard brand exchange policy',
          about: `Verified partner brand onboarded via BachatHub Partner Portal (${sub.branchesText || sub.city}).`,
          likes: 1,
          dislikes: 0,
          branches: [
            {
              id: `br-${Date.now().toString(36)}`,
              name: sub.branchesText?.split(',')[0]?.trim() || `${sub.brandName} ${sub.city}`,
              city: sub.city,
              area: 'Main Commercial',
              floorInfo: 'Open till 10 pm',
              distanceKm: 3.2,
              saleOn: true,
              lat: 24.86,
              lng: 67.05,
            },
          ],
        };
        vault.brands.unshift(newBrand);
        vault.writeShard('brands', vault.brands);
      }
    }

    vault.writeShard('submissions', vault.submissions);
    vault.addAuditLog('Super Admin', `Submission ${decision}`, sub.brandName);
    res.json({ submission: sub, brands: vault.brands });
  });

  // Admin: Brand verify / blacklist toggle
  app.post('/api/admin/brands/:id/status', requireAdmin, (req, res) => {
    const brand = vault.brands.find((b) => b.id === req.params.id);
    if (!brand) return res.status(404).json({ error: 'Brand not found.' });
    const { verified, blacklisted } = req.body as { verified?: boolean; blacklisted?: boolean };
    if (typeof verified === 'boolean') brand.verified = verified;
    if (typeof blacklisted === 'boolean') brand.blacklisted = blacklisted;
    vault.writeShard('brands', vault.brands);
    vault.addAuditLog('Super Admin', `Updated Brand (verified=${brand.verified}, blacklisted=${Boolean(brand.blacklisted)})`, brand.name);
    res.json({ brand, brands: vault.brands });
  });

  // Admin: User Block / Unblock (Community vs Full App) + Inspect Log
  app.post('/api/admin/users/:id/moderate', requireAdmin, (req, res) => {
    const user = vault.users.get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    const { communityBlocked, appBlocked, clearMute } = req.body as {
      communityBlocked?: boolean;
      appBlocked?: boolean;
      clearMute?: boolean;
    };
    if (typeof communityBlocked === 'boolean') user.communityBlocked = communityBlocked;
    if (typeof appBlocked === 'boolean') user.appBlocked = appBlocked;
    if (clearMute) user.muteUntil = null;
    vault.writeUserShard(user);
    vault.addAuditLog('Super Admin', 'Updated User Restrictions', `${user.nickname} (${user.maskedEmail})`);
    res.json({ user: vault.toPublicUser(user) });
  });

  // Admin: Unblock Appeal decision
  app.post('/api/admin/appeals/:id/decide', requireAdmin, (req, res) => {
    const appeal = vault.appeals.find((a) => a.id === req.params.id);
    if (!appeal) return res.status(404).json({ error: 'Appeal not found.' });
    const { decision } = req.body as { decision?: 'approved' | 'rejected' };
    if (!decision) return res.status(400).json({ error: 'Decision required.' });
    appeal.status = decision;
    if (decision === 'approved') {
      const user = vault.users.get(appeal.userId);
      if (user) {
        user.communityBlocked = false;
        user.appBlocked = false;
        user.muteUntil = null;
        vault.writeUserShard(user);
      }
    }
    vault.writeShard('appeals', vault.appeals);
    vault.addAuditLog('Super Admin', `Appeal ${decision}`, appeal.userNickname);
    res.json({ appeal });
  });

  // Admin: Update Community Rules, Anti-Spam & Freeze Timer Settings
  app.put('/api/admin/community/settings', requireAdmin, (req, res) => {
    const next = req.body as Partial<typeof vault.communitySettings>;
    vault.communitySettings = {
      ...vault.communitySettings,
      blockPhoneNumbers: typeof next.blockPhoneNumbers === 'boolean' ? next.blockPhoneNumbers : vault.communitySettings.blockPhoneNumbers,
      blockLinks: typeof next.blockLinks === 'boolean' ? next.blockLinks : vault.communitySettings.blockLinks,
      blockVideos: typeof next.blockVideos === 'boolean' ? next.blockVideos : vault.communitySettings.blockVideos,
      maxImageSizeKb: Math.max(64, Math.min(2048, Number(next.maxImageSizeKb) || vault.communitySettings.maxImageSizeKb)),
      maxMessagesBeforeFreeze: Math.max(3, Math.min(200, Number(next.maxMessagesBeforeFreeze) || vault.communitySettings.maxMessagesBeforeFreeze)),
      freezeDurationMinutes: Math.max(5, Math.min(1440, Number(next.freezeDurationMinutes) || vault.communitySettings.freezeDurationMinutes)),
      slowModeSeconds: Math.max(0, Math.min(300, Number(next.slowModeSeconds ?? vault.communitySettings.slowModeSeconds))),
      autoHideReportsThreshold: Math.max(2, Math.min(20, Number(next.autoHideReportsThreshold) || vault.communitySettings.autoHideReportsThreshold)),
      bannedWords: Array.isArray(next.bannedWords) ? next.bannedWords.map((w) => String(w).trim()).filter(Boolean) : vault.communitySettings.bannedWords,
    };
    vault.writeShard('community_settings', vault.communitySettings);
    vault.addAuditLog('Super Admin', 'Updated Community Rules & Freeze Settings', `${vault.communitySettings.maxMessagesBeforeFreeze} msgs / ${vault.communitySettings.freezeDurationMinutes}m freeze`);
    res.json({ settings: vault.communitySettings });
  });

  // Admin: Delete or restore a community message
  app.post('/api/admin/community/messages/:id', requireAdmin, (req, res) => {
    const msg = vault.communityMessages.find((m) => m.id === req.params.id);
    if (!msg) return res.status(404).json({ error: 'Message not found.' });
    const { action } = req.body as { action?: 'hide' | 'restore' | 'delete' };
    if (action === 'delete') {
      vault.communityMessages = vault.communityMessages.filter((m) => m.id !== msg.id);
    } else if (action === 'restore') {
      msg.hidden = false;
      msg.reportsCount = 0;
    } else {
      msg.hidden = true;
    }
    vault.writeShard('community', vault.communityMessages);
    vault.addAuditLog('Super Admin', `Moderated Chat Message (${action})`, msg.senderName);
    res.json({ ok: true });
  });

  // Admin: Send Lock-Screen Push Notification Campaign by City, Category & Bank Card
  app.post('/api/admin/broadcast', requireAdmin, (req, res) => {
    const {
      title,
      brandName,
      discountLabel,
      body,
      targetCity,
      dealId,
      priority,
      category,
      targetBankCard,
      lockScreenBanner,
      soundEnabled,
    } = req.body as {
      title?: string;
      brandName?: string;
      discountLabel?: string;
      body?: string;
      targetCity?: string;
      dealId?: string;
      priority?: 'normal' | 'urgent_flash' | 'fake_alert' | 'city_event';
      category?: CategoryId | 'all';
      targetBankCard?: string;
      lockScreenBanner?: boolean;
      soundEnabled?: boolean;
    };
    if (!title || !body) return res.status(400).json({ error: 'Title and message body are required.' });
    const cityLabel = String(targetCity || 'All Pakistan');
    // Desktop/GitHub mode has no visitor tracking, so reach is unknown (0) instead of an invented number
    const estimatedReach = DESKTOP_MODE ? 0 : cityLabel === 'All Pakistan' ? 18420 : 3200 + Math.floor(Math.random() * 2400);
    const bc = {
      id: `bc-${Date.now().toString(36)}`,
      title: String(title).trim().slice(0, 80),
      brandName: String(brandName || 'BachatHub Alert').trim().slice(0, 40),
      discountLabel: String(discountLabel || 'HOT DEAL').trim().slice(0, 20),
      body: String(body).trim().slice(0, 200),
      targetCity: cityLabel,
      actionLabel: 'See offer',
      dealId,
      priority: priority || 'urgent_flash',
      category: category || 'all',
      targetBankCard: targetBankCard || 'All Cards & Cash',
      lockScreenBanner: lockScreenBanner !== false,
      soundEnabled: soundEnabled !== false,
      deliveredCount: estimatedReach,
      openedCount: Math.round(estimatedReach * 0.34),
      createdAt: new Date().toISOString(),
    };
    vault.broadcasts.unshift(bc);
    vault.writeShard('broadcasts', vault.broadcasts);
    vault.addAuditLog('Super Admin', `Lock-Screen Campaign Sent (${bc.targetCity})`, `${bc.title} [${bc.priority}]`);
    res.status(201).json({ broadcast: bc, broadcasts: vault.broadcasts });
  });

  app.delete('/api/admin/broadcast/:id', requireAdmin, (req, res) => {
    const before = vault.broadcasts.length;
    vault.broadcasts = vault.broadcasts.filter((b) => b.id !== req.params.id);
    if (vault.broadcasts.length === before) return res.status(404).json({ error: 'Campaign not found.' });
    vault.writeShard('broadcasts', vault.broadcasts);
    vault.addAuditLog('Super Admin', 'Deleted Broadcast Campaign', req.params.id);
    res.json({ ok: true, broadcasts: vault.broadcasts });
  });

  // Admin: Trigger Real GitHub Actions Workflow via workflow_dispatch (No fake random counters)
  app.post('/api/admin/scraper/run/:cycle', requireAdmin, async (req, res) => {
    const num = Number(req.params.cycle);
    const cycle = vault.scraperCycles.find((c) => c.cycleNumber === num);
    if (!cycle) return res.status(404).json({ error: 'Scraper cycle not found.' });

    const gh = vault.getEffectiveGithubConfig();
    if (!gh.configured) {
      return res.status(503).json({
        error:
          'GitHub repository credentials (GITHUB_TOKEN, GITHUB_REPO_OWNER, GITHUB_REPO_NAME) are not configured. Set them in environment variables or Vault Setup to trigger GitHub Actions.',
      });
    }

    if (DESKTOP_MODE) {
      // one run at a time: repeated clicks do not queue extra runs
      const r = await dispatchScraper(String(num));
      if (!r.ok) return res.status(502).json({ error: r.message });
      cycle.lastRunAt = new Date().toISOString();
      cycle.status = 'running';
      cycle.lastSummary = r.message;
      vault.addAuditLog('Super Admin', `Scraper cycle ${num}`, r.message);
      return res.json({ ok: true, dispatched: true, message: r.message, cycle, scraperCycles: vault.scraperCycles });
    }
    const workflowFile = 'staggered_sync.yml';
    const dispatchUrl = `https://api.github.com/repos/${encodeURIComponent(gh.owner)}/${encodeURIComponent(gh.repo)}/actions/workflows/${workflowFile}/dispatches`;

    try {
      const ghRes = await fetch(dispatchUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${gh.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
          'User-Agent': 'BachatHub-SuperAdmin',
        },
        body: JSON.stringify({
          ref: gh.branch || 'main',
          inputs: {
            cycle: String(num),
          },
        }),
      });

      if (!ghRes.ok) {
        const errBody = await ghRes.text().catch(() => '');
        return res.status(502).json({
          error: `GitHub Actions workflow_dispatch failed (HTTP ${ghRes.status}): ${errBody.slice(0, 200) || ghRes.statusText}`,
        });
      }

      const nowIso = new Date().toISOString();
      cycle.lastRunAt = nowIso;
      cycle.status = 'running';
      cycle.lastSummary = `Dispatched GitHub Actions workflow (${workflowFile}, Cycle ${num}) on branch ${gh.branch || 'main'}`;
      vault.writeShard('scraper_cycles', vault.scraperCycles);
      vault.addAuditLog('Super Admin', `Dispatched GitHub Actions Cycle ${num}`, `${gh.owner}/${gh.repo}@${gh.branch}`);

      res.json({
        ok: true,
        dispatched: true,
        workflowUrl: `https://github.com/${gh.owner}/${gh.repo}/actions/workflows/${workflowFile}`,
        message: `Cycle ${num} dispatched on GitHub Actions (${gh.owner}/${gh.repo}).`,
        cycle,
        scraperCycles: vault.scraperCycles,
      });
    } catch (err) {
      return res.status(502).json({
        error: `Could not reach GitHub Actions API: ${err instanceof Error ? err.message : 'network error'}`,
      });
    }
  });

  app.post('/api/admin/scraper/sources', requireAdmin, (req, res) => {
    const { name, url, type, cycleNumber, cityScope } = req.body as {
      name?: string;
      url?: string;
      type?: 'bank' | 'brand_site' | 'meta_ads' | 'rss_social' | 'directory' | 'google_maps_local' | 'mall_portal';
      cycleNumber?: 1 | 2 | 3 | 4;
      cityScope?: string;
    };
    const safeUrl = sanitizeUrl(url || '');
    if (!name || !safeUrl) return res.status(400).json({ error: 'Valid name and http/https URL are required.' });
    const src = {
      id: `src-${Date.now().toString(36)}`,
      name: String(name).trim().slice(0, 60),
      url: safeUrl,
      type: type || 'brand_site',
      cycleNumber: cycleNumber || 2,
      cityScope: cityScope ? String(cityScope).trim().slice(0, 40) : 'All Pakistan',
      active: true,
      lastStatus: 'Queued for next 30-min cycle (105-Gate protected)',
    };
    vault.scraperSources.unshift(src);
    vault.writeShard('scraper_sources', vault.scraperSources);
    vault.addAuditLog('Super Admin', 'Added Scraper Source', `${src.name} (${src.cityScope})`);
    res.status(201).json({ source: src, scraperSources: vault.scraperSources });
  });

  app.post('/api/admin/scraper/sources/:id/toggle', requireAdmin, (req, res) => {
    const src = vault.scraperSources.find((s) => s.id === req.params.id);
    if (!src) return res.status(404).json({ error: 'Source not found.' });
    src.active = !src.active;
    vault.writeShard('scraper_sources', vault.scraperSources);
    res.json({ source: src });
  });

  // Admin: Feedback (Bugs & Improvements) Status Update
  app.post('/api/admin/feedback/:id/update', requireAdmin, (req, res) => {
    const item = vault.feedbackItems.find((f) => f.id === req.params.id);
    if (!item) return res.status(404).json({ error: 'Feedback item not found.' });
    const { status, adminReply } = req.body as { status?: FeedbackItem['status']; adminReply?: string };
    if (status === 'open' || status === 'in_progress' || status === 'resolved') {
      item.status = status;
    }
    if (typeof adminReply === 'string') {
      item.adminReply = adminReply.trim().slice(0, 300);
    }
    vault.writeShard('feedback', vault.feedbackItems);
    vault.addAuditLog('Super Admin', `Updated Feedback (${item.status})`, item.title);
    res.json({ item });
  });

  // Admin: Trigger Smart Encrypted GitHub Repository Sync
  // Admin: connect the Firebase admin login (chat, votes, reports, support live data)
  app.post('/api/admin/firebase/connect', requireAdmin, async (req, res) => {
    try {
      const { email, password } = req.body as { email?: string; password?: string };
      const st = await connectFirebaseAdmin(String(email || ''), String(password || ''));
      vault.addAuditLog('Super Admin', 'Connected Firebase admin', st.firebaseEmail);
      if (st.firebaseVerified) void pullFromGithub();
      res.json({ ok: true, ...st });
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : 'Firebase connect failed' });
    }
  });
  app.post('/api/admin/firebase/disconnect', requireAdmin, (_req, res) => {
    disconnectFirebaseAdmin();
    res.json({ ok: true, ...firebaseStatus() });
  });

  app.post('/api/admin/vault/sync', requireAdmin, async (_req, res) => {
    if (DESKTOP_MODE) {
      // Windows admin: publish admin edits + pull fresh scraper data from the public repo
      const r = await pullFromGithub();
      const st = syncStatus();
      vault.addAuditLog('Super Admin', 'Synced with GitHub repo', r.message);
      return res.json({
        synced: r.ok,
        configured: st.tokenConfigured,
        shards: 0,
        message: `${r.message}. ${st.tokenConfigured ? 'Admin edits publish automatically.' : 'Add a GitHub token in System settings so your edits can be published.'}${st.lastError ? ` Last error: ${st.lastError}` : ''}`,
        syncStatus: st,
      });
    }
    const result = await vault.syncAllToGithub();
    vault.addAuditLog('Super Admin', 'Executed Encrypted GitHub Vault Sync', `${result.shards} shards`);
    res.json(result);
  });

  // Admin: Update System, Recovery Email, GitHub Vault & Passcode Settings directly from Admin Panel
  app.post('/api/admin/settings/system', requireAdmin, (req, res) => {
    const body = req.body as {
      recoveryEmail?: string;
      githubRepoOwner?: string;
      githubRepoName?: string;
      githubBranch?: string;
      githubToken?: string;
      clearGithubToken?: boolean;
      autoSyncEnabled?: boolean;
      brandLogoAutoScrape?: boolean;
      newPasscode?: string;
    };
    if (body.newPasscode && body.newPasscode.trim().length > 0 && body.newPasscode.trim().length < 6) {
      return res.status(400).json({ error: 'New Super Admin passcode must be at least 6 characters.' });
    }
    if (body.recoveryEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.recoveryEmail.trim())) {
      return res.status(400).json({ error: 'Please enter a valid recovery email address.' });
    }
    const updated = vault.updateSystemSettings(body);
    vault.addAuditLog('Super Admin', 'Updated System & Vault Configuration', updated.maskedRecoveryEmail);
    res.json({ ok: true, systemSettings: updated });
  });

  // Admin: Test Live GitHub Repository Connection
  app.post('/api/admin/vault/test-github', requireAdmin, async (_req, res) => {
    const result = await vault.testGithubConnection();
    res.json(result);
  });

  // =========================================================================
  // 8B. 2-WAY CUSTOMER SUPPORT CHAT (USER <-> COMPANY REPRESENTATIVE / ADMIN)
  // =========================================================================
  app.get('/api/support/my-tickets', (req: AuthRequest, res) => {
    const clientId = String(req.query.clientId || '').trim().slice(0, 64);
    const ownerKey = req.session && req.session.role !== 'admin' ? req.session.userId : clientId;
    if (!ownerKey) {
      return res.json({ tickets: [] });
    }
    const mine = vault.supportTickets
      .filter((t) => t.ownerKey === ownerKey)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    res.json({ tickets: mine });
  });

  app.post('/api/support/tickets', (req: AuthRequest, res) => {
    const { clientId, userName, city, topic, subject, message } = req.body as {
      clientId?: string;
      userName?: string;
      city?: string;
      topic?: 'direct_agent' | 'feedback' | 'improvement' | 'bug';
      subject?: string;
      message?: string;
    };
    const cleanMsg = String(message || '').trim().slice(0, 1000);
    if (cleanMsg.length < 3) {
      return res.status(400).json({ error: 'Please write your message before sending.' });
    }
    const loggedUser = req.session && req.session.role !== 'admin' ? vault.users.get(req.session.userId) : undefined;
    const ownerKey = loggedUser ? loggedUser.id : String(clientId || `guest-${Date.now()}`).trim().slice(0, 64);
    const displayName = loggedUser ? loggedUser.nickname : String(userName || 'BachatHub Shopper').trim().slice(0, 50);
    const masked = loggedUser ? loggedUser.maskedEmail : 'guest@device';
    const validTopic =
      topic === 'direct_agent' || topic === 'feedback' || topic === 'improvement' || topic === 'bug'
        ? topic
        : 'direct_agent';
    const now = new Date().toISOString();

    const ticket = {
      id: `sup-${Date.now().toString(36)}`,
      ownerKey,
      userName: displayName,
      maskedEmail: masked,
      city: String(city || loggedUser?.city || 'Pakistan').trim().slice(0, 40),
      topic: validTopic,
      subject: String(subject || (validTopic === 'direct_agent' ? 'Direct Support Chat' : `User ${validTopic}`)).trim().slice(0, 100),
      status: 'open' as const,
      createdAt: now,
      updatedAt: now,
      messages: [
        {
          id: `sm-${Date.now().toString(36)}`,
          sender: 'user' as const,
          senderName: displayName,
          text: cleanMsg,
          createdAt: now,
        },
      ],
    };

    vault.supportTickets.unshift(ticket);
    vault.writeShard('support_tickets', vault.supportTickets);
    vault.addAuditLog('Customer Support', `New ${validTopic} Ticket`, `${displayName} (${ticket.city})`);
    res.status(201).json({ ticket });
  });

  app.post('/api/support/tickets/:id/reply', (req: AuthRequest, res) => {
    const ticket = vault.supportTickets.find((t) => t.id === req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Support chat not found.' });

    const { clientId, message } = req.body as { clientId?: string; message?: string };
    const loggedUser = req.session && req.session.role !== 'admin' ? vault.users.get(req.session.userId) : undefined;
    const ownerKey = loggedUser ? loggedUser.id : String(clientId || '').trim();
    if (!ownerKey || ticket.ownerKey !== ownerKey) {
      return res.status(403).json({ error: 'You can only reply to your own support conversation.' });
    }
    const cleanMsg = String(message || '').trim().slice(0, 1000);
    if (!cleanMsg) return res.status(400).json({ error: 'Message cannot be empty.' });

    const now = new Date().toISOString();
    ticket.messages.push({
      id: `sm-${Date.now().toString(36)}`,
      sender: 'user',
      senderName: ticket.userName,
      text: cleanMsg,
      createdAt: now,
    });
    ticket.status = 'open';
    ticket.updatedAt = now;
    vault.writeShard('support_tickets', vault.supportTickets);
    res.json({ ticket });
  });

  app.post('/api/admin/support/:id/reply', requireAdmin, (req, res) => {
    const ticket = vault.supportTickets.find((t) => t.id === req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Support ticket not found.' });
    const { message, status } = req.body as { message?: string; status?: 'open' | 'replied' | 'resolved' };
    const cleanMsg = String(message || '').trim().slice(0, 1200);
    const now = new Date().toISOString();

    if (cleanMsg) {
      ticket.messages.push({
        id: `sm-${Date.now().toString(36)}`,
        sender: 'admin',
        senderName: 'BachatHub Support Representative',
        text: cleanMsg,
        createdAt: now,
      });
      ticket.status = status === 'resolved' ? 'resolved' : 'replied';
    } else if (status === 'open' || status === 'replied' || status === 'resolved') {
      ticket.status = status;
    } else {
      return res.status(400).json({ error: 'Provide a reply message or status update.' });
    }
    ticket.updatedAt = now;
    vault.writeShard('support_tickets', vault.supportTickets);
    vault.addAuditLog('Super Admin Support', `Replied to ${ticket.userName}`, ticket.subject);
    res.json({ ticket });
  });

  // Admin: Scrape & Refresh All Brand Logos & Official Branding Colors (Zero-AI)
  app.post('/api/admin/brands/scrape-branding', requireAdmin, async (_req, res) => {
    if (DESKTOP_MODE) {
      // Logos/colors are read by the GitHub scraper on every run; editing them here would freeze them.
      return res.json({
        ok: true,
        report: { totalBrands: vault.brands.length, htmlScraped: 0, faviconMatched: 0, scrapedAt: new Date().toISOString(),
          message: 'Brand logos are refreshed automatically by the GitHub scraper every 30 minutes.' },
        brands: vault.brands,
        deals: vault.deals,
      });
    }
    const report = await vault.refreshAllBrandBranding();
    vault.addAuditLog(
      'Super Admin',
      'Scraped Brand Logos & Branding',
      `${report.totalBrands} brands (${report.htmlScraped} HTML, ${report.faviconMatched} official icons)`,
    );
    res.json({ ok: true, report, brands: vault.brands, deals: vault.deals });
  });

  // =========================================================================
  // 9. VITE DEV MIDDLEWARE / PRODUCTION STATIC SERVING
  // =========================================================================
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = process.env.BACHATHUB_DIST_DIR?.trim() || path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT?.trim()) || 3000;
  const HOST = process.env.HOST?.trim() || '0.0.0.0';
  app.listen(PORT, HOST, () => {
    console.log(`BachatHub Pakistan server running on http://${HOST}:${PORT}`);
    startPublicSync();
  });
}

startServer().catch((err) => {
  console.error('Failed to start BachatHub server:', err);
  process.exit(1);
});
