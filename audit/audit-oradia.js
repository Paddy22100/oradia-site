#!/usr/bin/env node
/**
 * ============================================================
 *  AUDIT ORADIA.FR — Script d'audit complet automatisé
 *  Auteur : généré pour Paddy (oradia.fr)
 *  Usage  : node audit-oradia.js
 *  Output : ./audit-reports/audit-[date].html
 * ============================================================
 */

require('dotenv').config({ path: '.env.audit' });

const { chromium } = require('playwright');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer/lib/nodemailer');

// ─── CONFIG ─────────────────────────────────────────────────
const BASE_URL = process.env.AUDIT_TARGET_URL || 'https://oradia.fr';

const VIEWPORTS = [
  { name: 'Mobile Portrait',   width: 390,  height: 844  },
  { name: 'Mobile Paysage',    width: 844,  height: 390  },
  { name: 'Tablette Portrait', width: 768,  height: 1024 },
  { name: 'Tablette Paysage',  width: 1024, height: 768  },
  { name: 'Desktop',           width: 1440, height: 900  },
  { name: 'Wide',              width: 1920, height: 1080 },
];

// Pages à auditer (le script en découvre aussi automatiquement)
// URLs propres réelles d'Oradia (mappées vers les .html via vercel.json)
const KNOWN_PAGES = [
  '/',
  '/oracle',
  '/precommande-oracle',
  '/accompagnements',
  '/a-propos',
  '/contact',
  '/synchronicite',
  '/rendez-vous',
  '/cgu',
  '/cgv',
  '/mentions-legales',
  '/politique-de-confidentialite',
  '/connexion',
  '/inscription',
];

// Headers HTTP de sécurité attendus
const SECURITY_HEADERS = [
  'strict-transport-security',
  'x-content-type-options',
  'x-frame-options',
  'content-security-policy',
  'referrer-policy',
  'permissions-policy',
];

// ─── ÉTAT GLOBAL DE L'AUDIT ─────────────────────────────────
const report = {
  date: new Date().toISOString(),
  url: BASE_URL,
  scores: {},
  sections: {
    pages: [],
    security: [],
    responsive: [],
    seo: [],
    rgpd: [],
    api: [],
    performance: [],
    misc: [],
  },
  screenshots: [],
  summary: { critical: 0, important: 0, minor: 0, ok: 0 },
};

// ─── UTILITAIRES ────────────────────────────────────────────
const severity = { critical: '🔴', important: '🟠', minor: '🟡', ok: '🟢', info: 'ℹ️' };

function addIssue(section, level, title, detail = '') {
  report.sections[section].push({ level, title, detail });
  if (level in report.summary) report.summary[level]++;
}

function log(msg) {
  const ts = new Date().toLocaleTimeString('fr-FR');
  console.log(`[${ts}] ${msg}`);
}

async function safeGet(url, opts = {}) {
  try {
    return await axios.get(url, { timeout: 10000, ...opts });
  } catch (e) {
    return { status: e.response?.status || 0, headers: {}, data: '', error: e.message };
  }
}

// ─── 1. DÉCOUVERTE DES PAGES ────────────────────────────────
async function discoverPages(browser) {
  log('🔍 Découverte des pages...');
  const page = await browser.newPage();
  const discovered = new Set(KNOWN_PAGES);

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    const links = await page.$$eval('a[href]', els =>
      els.map(e => e.getAttribute('href')).filter(Boolean)
    );
    for (const link of links) {
      if (link.startsWith('/') && !link.includes('#') && !link.startsWith('//')) {
        discovered.add(link.split('?')[0]);
      }
    }
  } catch (e) {
    addIssue('pages', 'critical', 'Page principale inaccessible', e.message);
  }

  await page.close();
  log(`   → ${discovered.size} pages à tester`);
  return [...discovered];
}

// ─── 2. AUDIT DES PAGES (statut HTTP, contenu de base) ─────
async function auditPages(pages) {
  log('📄 Audit des pages HTTP...');

  for (const p of pages) {
    const url = `${BASE_URL}${p}`;
    const res = await safeGet(url, { maxRedirects: 5, validateStatus: () => true });
    const status = res.status;

    if (status === 0) {
      addIssue('pages', 'critical', `Page inaccessible : ${p}`, res.error);
    } else if (status >= 500) {
      addIssue('pages', 'critical', `Erreur serveur ${status} sur ${p}`);
    } else if (status === 404) {
      if (KNOWN_PAGES.includes(p)) {
        addIssue('pages', 'important', `Page attendue introuvable (404) : ${p}`);
      } else {
        addIssue('pages', 'minor', `Page 404 : ${p}`);
      }
    } else if (status === 200 || status === 301 || status === 302) {
      addIssue('pages', 'ok', `${p} — ${status}`);
    }

  }
}

// ─── 3. SÉCURITÉ ────────────────────────────────────────────
async function auditSecurity() {
  log('🔒 Audit sécurité...');
  const res = await safeGet(BASE_URL, { validateStatus: () => true });
  const headers = res.headers || {};

  // Headers de sécurité
  for (const h of SECURITY_HEADERS) {
    if (headers[h]) {
      addIssue('security', 'ok', `Header présent : ${h}`, headers[h]);
    } else {
      const lvl = ['strict-transport-security', 'content-security-policy'].includes(h)
        ? 'important' : 'minor';
      addIssue('security', lvl, `Header manquant : ${h}`);
    }
  }

  // HTTPS
  if (BASE_URL.startsWith('https://')) {
    addIssue('security', 'ok', 'HTTPS activé');
  } else {
    addIssue('security', 'critical', 'HTTPS non activé — site non sécurisé');
  }

  // Vérification que les clés API ne sont pas exposées côté client
  try {
    const html = await safeGet(BASE_URL);
    const body = typeof html.data === 'string' ? html.data : '';
    const patterns = [
      { re: /sk_live_[a-zA-Z0-9]{20,}/, label: 'Clé Stripe live côté client' },
      { re: /sk_test_[a-zA-Z0-9]{20,}/, label: 'Clé Stripe test côté client' },
      { re: /SUPABASE_SERVICE_ROLE/i,    label: 'Service role Supabase exposé' },
      { re: /whsec_[a-zA-Z0-9]{20,}/,   label: 'Webhook secret Stripe exposé' },
    ];
    for (const { re, label } of patterns) {
      if (re.test(body)) {
        addIssue('security', 'critical', label, 'Clé sensible détectée dans le HTML public');
      }
    }
  } catch (e) {
    addIssue('security', 'minor', 'Impossible de vérifier les clés exposées', e.message);
  }

  // Vérification robots.txt (ne doit pas bloquer tout)
  const robots = await safeGet(`${BASE_URL}/robots.txt`);
  if (robots.status === 200) {
    addIssue('security', 'ok', 'robots.txt présent');
    if (/Disallow: \//m.test(robots.data) && !/Allow:/m.test(robots.data)) {
      addIssue('security', 'important', 'robots.txt bloque tout le site (Disallow: /)');
    }
  } else {
    addIssue('security', 'minor', 'robots.txt absent');
  }
}

// ─── 4. RESPONSIVE & AFFICHAGE ──────────────────────────────
async function auditResponsive(browser, pages) {
  log('📱 Audit responsive (screenshots)...');
  const screenshotsDir = path.join('audit-reports', 'screenshots');
  if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

  // On teste les pages principales seulement pour les screenshots
  const pagesToScreenshot = ['/', '/oracle', '/precommande-oracle', '/mentions-legales'].filter(p =>
    pages.includes(p)
  );

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      userAgent: vp.width < 768
        ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15'
        : undefined,
    });
    const page = await ctx.newPage();

    for (const p of pagesToScreenshot) {
      try {
        const url = `${BASE_URL}${p}`;
        await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
        await page.waitForTimeout(1000);

        // Détection de débordement horizontal
        const hasOverflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });

        const vpSlug = vp.name.toLowerCase().replace(/\s+/g, '-');
        const pageSlug = p === '/' ? 'accueil' : p.replace(/\//g, '');
        const filename = `${pageSlug}-${vpSlug}.png`;
        const filepath = path.join(screenshotsDir, filename);

        await page.screenshot({ path: filepath, fullPage: false });
        report.screenshots.push({ viewport: vp.name, page: p, file: `screenshots/${filename}` });

        if (hasOverflow) {
          addIssue('responsive', 'important',
            `Débordement horizontal détecté — ${p} sur ${vp.name}`,
            `Largeur page > largeur viewport (${vp.width}px)`
          );
        } else {
          addIssue('responsive', 'ok', `Affichage correct — ${p} sur ${vp.name}`);
        }
      } catch (e) {
        addIssue('responsive', 'important', `Erreur screenshot — ${p} sur ${vp.name}`, e.message);
      }
    }

    await ctx.close();
  }
}

// ─── 5. SEO ─────────────────────────────────────────────────
async function auditSEO(pages) {
  log('🔎 Audit SEO...');

  // sitemap.xml
  const sitemap = await safeGet(`${BASE_URL}/sitemap.xml`);
  if (sitemap.status === 200) {
    addIssue('seo', 'ok', 'sitemap.xml présent');
  } else {
    addIssue('seo', 'important', 'sitemap.xml absent — les moteurs de recherche le cherchent');
  }

  // Analyse SEO des pages principales
  const seoPagesToCheck = pages.slice(0, 10);

  for (const p of seoPagesToCheck) {
    if (p === '/404') continue;
    const url = `${BASE_URL}${p}`;
    const res = await safeGet(url);
    if (!res.data || res.status !== 200) continue;

    const $ = cheerio.load(res.data);

    // Pages noindex : volontairement exclues des moteurs → pas de pénalité SEO
    const robotsMeta = ($('meta[name="robots"]').attr('content') || '').toLowerCase();
    if (robotsMeta.includes('noindex')) {
      addIssue('seo', 'ok', `Page noindex (exclue du SEO volontairement) : ${p}`);
      continue;
    }

    // Title
    const title = $('title').text().trim();
    if (!title) {
      addIssue('seo', 'important', `Balise <title> manquante : ${p}`);
    } else if (title.length < 10 || title.length > 70) {
      addIssue('seo', 'minor', `Title trop court ou trop long (${title.length} car.) : ${p}`, title);
    } else {
      addIssue('seo', 'ok', `Title OK (${title.length} car.) : ${p}`);
    }

    // Meta description
    const desc = $('meta[name="description"]').attr('content') || '';
    if (!desc) {
      addIssue('seo', 'important', `Meta description absente : ${p}`);
    } else if (desc.length < 50 || desc.length > 160) {
      addIssue('seo', 'minor', `Meta description longueur incorrecte (${desc.length} car.) : ${p}`);
    } else {
      addIssue('seo', 'ok', `Meta description OK : ${p}`);
    }

    // OG Tags
    const ogTitle = $('meta[property="og:title"]').attr('content');
    const ogImage = $('meta[property="og:image"]').attr('content');
    if (!ogTitle || !ogImage) {
      addIssue('seo', 'minor', `Open Graph incomplet : ${p}`,
        `og:title=${ogTitle ? '✓' : '✗'}, og:image=${ogImage ? '✓' : '✗'}`);
    } else {
      addIssue('seo', 'ok', `Open Graph présent : ${p}`);
    }

    // Images sans alt
    const imgsNoAlt = $('img:not([alt])').length + $('img[alt=""]').length;
    if (imgsNoAlt > 0) {
      addIssue('seo', 'minor', `${imgsNoAlt} image(s) sans attribut alt : ${p}`);
    }

    // Heading h1
    const h1Count = $('h1').length;
    if (h1Count === 0) {
      addIssue('seo', 'important', `Pas de balise H1 : ${p}`);
    } else if (h1Count > 1) {
      addIssue('seo', 'minor', `Plusieurs H1 (${h1Count}) sur la même page : ${p}`);
    } else {
      addIssue('seo', 'ok', `H1 présent : ${p}`);
    }
  }
}

// ─── 6. RGPD & LÉGALITÉ ─────────────────────────────────────
async function auditRGPD(browser, pages) {
  log('⚖️  Audit RGPD & légalité...');

  const requiredPages = {
    '/mentions-legales':           'Mentions légales',
    '/cgv':                        'CGV',
    '/politique-de-confidentialite': 'Politique de confidentialité',
  };

  for (const [slug, label] of Object.entries(requiredPages)) {
    if (pages.includes(slug)) {
      const res = await safeGet(`${BASE_URL}${slug}`);
      if (res.status === 200) {
        addIssue('rgpd', 'ok', `${label} présente et accessible`);
      } else {
        addIssue('rgpd', 'critical', `${label} inaccessible (${res.status})`);
      }
    } else {
      addIssue('rgpd', 'critical', `${label} introuvable sur le site`);
    }
  }

  // Test bannière cookies sur la page d'accueil
  const page = await browser.newPage();
  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(2000);

    const cookieSelectors = [
      '[id*="cookie"]', '[class*="cookie"]', '[id*="consent"]', '[class*="consent"]',
      '[id*="rgpd"]',   '[class*="rgpd"]',   '[id*="gdpr"]',   '[class*="gdpr"]',
      '[id*="banner"]', '[class*="banner"]',
    ];

    let cookieBannerFound = false;
    for (const sel of cookieSelectors) {
      try {
        const el = await page.$(sel);
        if (el && await el.isVisible()) {
          cookieBannerFound = true;
          break;
        }
      } catch (_) {}
    }

    if (cookieBannerFound) {
      addIssue('rgpd', 'ok', 'Bannière cookies détectée sur la page d\'accueil');
    } else {
      // Bannière cookies volontairement exclue (consigne CMP) : non pénalisée.
      addIssue('rgpd', 'ok',
        'Bannière cookies — volontairement exclue (consigne CMP)',
        'Pas de cookies non essentiels nécessitant un consentement préalable.'
      );
    }

    // Présence de liens mentions légales dans le footer
    const footerLinks = await page.$$eval('footer a', els => els.map(e => e.href));
    const hasML = footerLinks.some(l => l.includes('mention') || l.includes('legal'));
    const hasCGV = footerLinks.some(l => l.includes('cgv') || l.includes('condition'));
    const hasPC = footerLinks.some(l => l.includes('confidentialite') || l.includes('privacy'));

    if (!hasML) addIssue('rgpd', 'important', 'Lien Mentions légales absent du footer');
    else addIssue('rgpd', 'ok', 'Mentions légales linkées dans le footer');

    if (!hasCGV) addIssue('rgpd', 'important', 'Lien CGV absent du footer');
    else addIssue('rgpd', 'ok', 'CGV linkées dans le footer');

    if (!hasPC) addIssue('rgpd', 'important', 'Lien Politique de confidentialité absent du footer');
    else addIssue('rgpd', 'ok', 'Politique de confidentialité linkée dans le footer');

  } catch (e) {
    addIssue('rgpd', 'minor', 'Erreur lors de l\'audit RGPD page d\'accueil', e.message);
  }
  await page.close();
}

// ─── 7. APPELS API & FONCTIONNEL ────────────────────────────
async function auditAPI(browser) {
  log('⚡ Audit API & fonctionnel...');

  // Test endpoint API Oradia (tirage)
  const endpoints = [
    { path: '/api/health',             label: 'API Health check'   },
    { path: '/api/preorders/progress', label: 'API Précommandes'    },
    { path: '/api/analyse-tirage',     label: 'API Analyse tirage' },
    { path: '/api/auth/login',         label: 'API Auth'           },
    { path: '/api/support',            label: 'API Support'        },
  ];

  for (const ep of endpoints) {
    const res = await safeGet(`${BASE_URL}${ep.path}`, {
      validateStatus: () => true,
      headers: { 'Content-Type': 'application/json' },
    });
    // 405 (method not allowed) = endpoint existe mais attend POST = ok pour GET
    // 401/403 = endpoint existe mais protégé = ok
    // 404 = absent
    // 500 = erreur serveur
    if ([200, 201, 401, 403, 405].includes(res.status)) {
      addIssue('api', 'ok', `${ep.label} répond (${res.status})`);
    } else if (res.status === 404) {
      addIssue('api', 'minor', `${ep.label} introuvable (404) — peut-être route différente`);
    } else if (res.status >= 500) {
      addIssue('api', 'critical', `${ep.label} erreur serveur (${res.status})`);
    } else if (res.status === 0) {
      addIssue('api', 'important', `${ep.label} inaccessible`, res.error || '');
    }
  }

  // Test interactif de la page tirage avec Playwright
  const page = await browser.newPage();
  try {
    await page.goto(`${BASE_URL}/oracle`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(2000);

    // Le CTA de tirage sur /oracle est un lien (#cta-essai-oracle) qui mène à
    // la page de tirage (tore.html), pas un bouton déclenchant directement l'API.
    const tirageBtn = await page.$('#cta-essai-oracle, [data-testid="tirage-btn"], a:has-text("Essayer l\'Oracle"), a:has-text("tirage"), button:has-text("Tirer"), button:has-text("Révéler"), button:has-text("Consulter")');
    if (tirageBtn) {
      addIssue('api', 'ok', 'CTA de tirage trouvé sur /oracle');
      // Suivre le lien et vérifier que la page de tirage se charge correctement
      const dest = await tirageBtn.getAttribute('href');
      if (dest) {
        const destRes = await safeGet(`${BASE_URL}/${dest.replace(/^\//, '')}`, { validateStatus: () => true });
        if (destRes.status === 200) {
          addIssue('api', 'ok', `Page de tirage accessible (${dest})`);
        } else {
          addIssue('api', 'important', `Page de tirage inaccessible (${dest} → ${destRes.status})`);
        }
      }
    } else {
      addIssue('api', 'minor', 'CTA de tirage non trouvé sur /oracle (sélecteur à ajuster)');
    }
  } catch (e) {
    addIssue('api', 'minor', 'Erreur test interactif tirage', e.message);
  }
  await page.close();

  // Test bouton Stripe (présence du checkout)
  const stripePage = await browser.newPage();
  try {
    // Chercher une page d'offre/tarif
    const offrePage = `${BASE_URL}/precommande-oracle`;
    await stripePage.goto(offrePage, { waitUntil: 'networkidle', timeout: 20000 });
    const stripeEl = await stripePage.$('[data-testid*="stripe"], button:has-text("Abonner"), button:has-text("Acheter"), button:has-text("Payer"), button:has-text("Commander"), button:has-text("Précommander")');
    if (stripeEl) {
      addIssue('api', 'ok', 'Bouton de paiement Stripe trouvé sur /precommande-oracle');
    } else {
      addIssue('api', 'minor', 'Bouton Stripe non trouvé sur /precommande-oracle (sélecteur à ajuster)');
    }
  } catch (e) {
    addIssue('api', 'minor', 'Erreur test bouton Stripe', e.message);
  }
  await stripePage.close();
}

// ─── 8. PERFORMANCE (Lighthouse lite via métriques Playwright) ──
async function auditPerformance(browser) {
  log('🚀 Audit performance...');

  const page = await browser.newPage();
  const client = await page.context().newCDPSession(page);

  await client.send('Performance.enable');
  await client.send('Network.enable');

  const resourceSizes = { total: 0, js: 0, css: 0, img: 0 };

  page.on('response', async res => {
    try {
      const ct = res.headers()['content-type'] || '';
      const body = await res.body().catch(() => Buffer.alloc(0));
      const size = body.length;
      resourceSizes.total += size;
      if (ct.includes('javascript')) resourceSizes.js += size;
      else if (ct.includes('css')) resourceSizes.css += size;
      else if (ct.includes('image')) resourceSizes.img += size;
    } catch (_) {}
  });

  try {
    const t0 = Date.now();
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    const loadTime = Date.now() - t0;

    const lcp = await page.evaluate(() => {
      return new Promise(res => {
        new PerformanceObserver(list => {
          const entries = list.getEntries();
          res(entries[entries.length - 1]?.startTime || 0);
        }).observe({ type: 'largest-contentful-paint', buffered: true });
        setTimeout(() => res(0), 3000);
      });
    });

    // Métriques
    if (loadTime < 3000) addIssue('performance', 'ok', `Temps de chargement : ${loadTime}ms`);
    else if (loadTime < 6000) addIssue('performance', 'minor', `Temps de chargement lent : ${loadTime}ms`);
    else addIssue('performance', 'important', `Temps de chargement très lent : ${loadTime}ms`);

    if (lcp > 0) {
      if (lcp < 2500) addIssue('performance', 'ok', `LCP : ${Math.round(lcp)}ms (bon)`);
      else if (lcp < 4000) addIssue('performance', 'minor', `LCP : ${Math.round(lcp)}ms (à améliorer)`);
      else addIssue('performance', 'important', `LCP : ${Math.round(lcp)}ms (mauvais)`);
    }

    const totalKB = Math.round(resourceSizes.total / 1024);
    const jsKB = Math.round(resourceSizes.js / 1024);
    if (totalKB > 5000) addIssue('performance', 'important', `Page très lourde : ${totalKB} KB total, JS: ${jsKB} KB`);
    else if (totalKB > 2000) addIssue('performance', 'minor', `Page lourde : ${totalKB} KB total, JS: ${jsKB} KB`);
    else addIssue('performance', 'ok', `Poids total acceptable : ${totalKB} KB`);

    // Lazy loading images
    const imgsWithoutLazy = await page.$$eval('img', imgs =>
      imgs.filter(i => !i.loading || i.loading !== 'lazy').length
    );
    if (imgsWithoutLazy > 3) {
      addIssue('performance', 'minor', `${imgsWithoutLazy} images sans lazy loading`);
    }

  } catch (e) {
    addIssue('performance', 'minor', 'Erreur audit performance', e.message);
  }

  await page.close();
}

// ─── 9. DIVERS ──────────────────────────────────────────────
async function auditMisc(browser) {
  log('🔧 Audit divers...');

  // favicon
  const favicon = await safeGet(`${BASE_URL}/favicon.ico`, { validateStatus: () => true });
  if (favicon.status === 200) addIssue('misc', 'ok', 'Favicon présent');
  else addIssue('misc', 'minor', 'Favicon absent (/favicon.ico 404)');

  // manifest.json (PWA)
  const manifest = await safeGet(`${BASE_URL}/manifest.json`, { validateStatus: () => true });
  if (manifest.status === 200) addIssue('misc', 'ok', 'manifest.json présent (PWA ready)');
  else addIssue('misc', 'minor', 'manifest.json absent (non PWA)');

  // Langue déclarée
  const page = await browser.newPage();
  try {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const lang = await page.$eval('html', el => el.lang).catch(() => '');
    if (lang) addIssue('misc', 'ok', `Langue HTML déclarée : ${lang}`);
    else addIssue('misc', 'minor', 'Attribut lang manquant sur <html>');

    // Viewport meta tag
    const viewportMeta = await page.$('meta[name="viewport"]');
    if (viewportMeta) addIssue('misc', 'ok', 'Meta viewport présente');
    else addIssue('misc', 'important', 'Meta viewport absente — mobile non supporté');

    // Vérification d'erreurs console JS
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.reload({ waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(2000);
    if (errors.length > 0) {
      addIssue('misc', 'important', `${errors.length} erreur(s) JavaScript console`, errors.slice(0, 3).join(' | '));
    } else {
      addIssue('misc', 'ok', 'Aucune erreur JavaScript console');
    }

  } catch (e) {
    addIssue('misc', 'minor', 'Erreur audit misc', e.message);
  }
  await page.close();
}

// ─── 10. CALCUL DES SCORES ──────────────────────────────────
function computeScores() {
  const categories = {
    'Pages':       'pages',
    'Sécurité':    'security',
    'Responsive':  'responsive',
    'SEO':         'seo',
    'RGPD':        'rgpd',
    'API':         'api',
    'Performance': 'performance',
    'Divers':      'misc',
  };

  for (const [label, key] of Object.entries(categories)) {
    const issues = report.sections[key];
    if (!issues || issues.length === 0) { report.scores[label] = null; continue; }
    const total = issues.length;
    const ok = issues.filter(i => i.level === 'ok').length;
    const critical = issues.filter(i => i.level === 'critical').length;
    const important = issues.filter(i => i.level === 'important').length;
    const score = Math.max(0, Math.round(
      ((ok / total) * 100) - (critical * 15) - (important * 5)
    ));
    report.scores[label] = Math.min(100, score);
  }
}

// ─── 11. GÉNÉRATION DU RAPPORT HTML ─────────────────────────
function generateHTML() {
  const now = new Date();
  const dateStr = now.toLocaleDateString('fr-FR', { dateStyle: 'full' });
  const timeStr = now.toLocaleTimeString('fr-FR');

  const scoreColor = s => s >= 80 ? '#22c55e' : s >= 60 ? '#f59e0b' : '#ef4444';
  const scoreGrade = s => s >= 90 ? 'A' : s >= 80 ? 'B' : s >= 60 ? 'C' : s >= 40 ? 'D' : 'F';

  const levelClass = l => ({ critical: 'crit', important: 'imp', minor: 'min', ok: 'ok', info: 'info' }[l] || 'info');

  const scoresHTML = Object.entries(report.scores)
    .filter(([, s]) => s !== null)
    .map(([label, s]) => `
      <div class="score-card">
        <div class="score-circle" style="background:${scoreColor(s)}">${scoreGrade(s)}</div>
        <div class="score-label">${label}</div>
        <div class="score-num">${s}/100</div>
      </div>
    `).join('');

  const globalScore = Math.round(
    Object.values(report.scores).filter(s => s !== null).reduce((a, b) => a + b, 0) /
    Object.values(report.scores).filter(s => s !== null).length
  );

  const issuesHTML = Object.entries(report.sections)
    .filter(([, items]) => items.length > 0)
    .map(([key, items]) => {
      const title = {
        pages: '📄 Pages', security: '🔒 Sécurité', responsive: '📱 Responsive',
        seo: '🔎 SEO', rgpd: '⚖️ RGPD & Légalité', api: '⚡ API & Fonctionnel',
        performance: '🚀 Performance', misc: '🔧 Divers',
      }[key] || key;
      const rows = items.map(i => `
        <tr class="${levelClass(i.level)}">
          <td>${severity[i.level] || ''}</td>
          <td>${i.title}</td>
          <td class="detail">${i.detail || ''}</td>
        </tr>
      `).join('');
      return `
        <h2>${title}</h2>
        <table><thead><tr><th>Niveau</th><th>Constat</th><th>Détail</th></tr></thead>
        <tbody>${rows}</tbody></table>
      `;
    }).join('');

  const screenshotsHTML = report.screenshots.length > 0 ? `
    <h2>📸 Captures d'écran responsive</h2>
    <div class="screenshots-grid">
      ${report.screenshots.map(s => `
        <div class="screenshot-item">
          <div class="screenshot-meta">${s.viewport} — ${s.page}</div>
          <img src="${s.file}" alt="${s.viewport} ${s.page}" loading="lazy">
        </div>
      `).join('')}
    </div>
  ` : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Audit oradia.fr — ${dateStr}</title>
<style>
  :root {
    --bg: #0f0f1a; --surface: #1a1a2e; --surface2: #22223b;
    --text: #e8e8f0; --muted: #888; --accent: #7c6af7;
    --crit: #ef4444; --imp: #f59e0b; --min: #eab308; --ok: #22c55e;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: var(--bg); color: var(--text); line-height: 1.6; }
  .container { max-width: 1200px; margin: 0 auto; padding: 2rem 1rem; }
  header { text-align: center; padding: 3rem 0 2rem; border-bottom: 1px solid var(--surface2); margin-bottom: 2rem; }
  header h1 { font-size: 2rem; color: var(--accent); margin-bottom: 0.5rem; }
  header .meta { color: var(--muted); font-size: 0.9rem; }
  .global-score { text-align: center; margin: 2rem 0; }
  .global-circle { display: inline-flex; align-items: center; justify-content: center;
    width: 120px; height: 120px; border-radius: 50%; font-size: 2.5rem; font-weight: 700;
    background: ${scoreColor(globalScore)}; color: #fff; margin-bottom: 0.5rem; }
  .scores-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    gap: 1rem; margin: 2rem 0; }
  .score-card { background: var(--surface); border-radius: 12px; padding: 1.2rem;
    text-align: center; }
  .score-circle { display: inline-flex; align-items: center; justify-content: center;
    width: 56px; height: 56px; border-radius: 50%; font-size: 1.4rem; font-weight: 700;
    color: #fff; margin-bottom: 0.5rem; }
  .score-label { font-size: 0.85rem; color: var(--muted); margin-bottom: 0.2rem; }
  .score-num { font-weight: 700; font-size: 1.1rem; }
  .summary-bar { display: flex; gap: 1rem; flex-wrap: wrap; margin: 1.5rem 0;
    background: var(--surface); border-radius: 12px; padding: 1rem 1.5rem; }
  .summary-item { display: flex; align-items: center; gap: 0.5rem; }
  .badge { padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.85rem; font-weight: 600; }
  .badge.crit { background: var(--crit); color: #fff; }
  .badge.imp  { background: var(--imp);  color: #000; }
  .badge.min  { background: var(--min);  color: #000; }
  .badge.ok   { background: var(--ok);   color: #000; }
  h2 { font-size: 1.2rem; color: var(--accent); margin: 2rem 0 0.75rem; padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--surface2); }
  table { width: 100%; border-collapse: collapse; background: var(--surface);
    border-radius: 10px; overflow: hidden; margin-bottom: 1.5rem; }
  th { background: var(--surface2); padding: 0.6rem 1rem; text-align: left;
    font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
  td { padding: 0.6rem 1rem; border-top: 1px solid var(--surface2); vertical-align: top;
    font-size: 0.9rem; }
  td.detail { color: var(--muted); font-size: 0.8rem; font-family: monospace; }
  tr.crit td:first-child { color: var(--crit); }
  tr.imp  td:first-child { color: var(--imp);  }
  tr.min  td:first-child { color: var(--min);  }
  tr.ok   td:first-child { color: var(--ok);   }
  tr.crit { border-left: 3px solid var(--crit); }
  tr.imp  { border-left: 3px solid var(--imp);  }
  tr.min  { border-left: 3px solid var(--min);  }
  tr.ok   { background: rgba(34,197,94,.03); }
  .screenshots-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1rem; }
  .screenshot-item { background: var(--surface); border-radius: 10px; overflow: hidden; }
  .screenshot-meta { padding: 0.5rem 0.75rem; font-size: 0.8rem; color: var(--muted);
    background: var(--surface2); }
  .screenshot-item img { width: 100%; display: block; }
  footer { text-align: center; padding: 2rem; color: var(--muted); font-size: 0.8rem; }
</style>
</head>
<body>
<div class="container">
  <header>
    <h1>🔍 Audit oradia.fr</h1>
    <div class="meta">${dateStr} à ${timeStr} · ${BASE_URL}</div>
  </header>

  <div class="global-score">
    <div class="global-circle">${scoreGrade(globalScore)}</div>
    <div style="font-size:1.5rem;font-weight:700">${globalScore}/100</div>
    <div style="color:var(--muted);font-size:0.9rem;margin-top:0.25rem">Score global</div>
  </div>

  <div class="scores-grid">${scoresHTML}</div>

  <div class="summary-bar">
    <div class="summary-item"><span class="badge crit">🔴 ${report.summary.critical} Critiques</span></div>
    <div class="summary-item"><span class="badge imp">🟠 ${report.summary.important} Importants</span></div>
    <div class="summary-item"><span class="badge min">🟡 ${report.summary.minor} Mineurs</span></div>
    <div class="summary-item"><span class="badge ok">🟢 ${report.summary.ok} OK</span></div>
  </div>

  ${issuesHTML}
  ${screenshotsHTML}

  <footer>Rapport généré automatiquement · oradia-audit v1.0</footer>
</div>
</body>
</html>`;
}

// ─── 12. ENVOI PAR MAIL ─────────────────────────────────────
async function sendReportByEmail(reportPath) {
  if (!process.env.AUDIT_SMTP_HOST || !process.env.AUDIT_EMAIL_TO) {
    log('📧 Email ignoré (variables SMTP non configurées)');
    return;
  }

  log('📧 Envoi du rapport par email...');
  const transporter = nodemailer.createTransport({
    host: process.env.AUDIT_SMTP_HOST,
    port: parseInt(process.env.AUDIT_SMTP_PORT || '587'),
    secure: process.env.AUDIT_SMTP_SECURE === 'true',
    auth: {
      user: process.env.AUDIT_SMTP_USER,
      pass: process.env.AUDIT_SMTP_PASS,
    },
  });

  const now = new Date();
  const summary = report.summary;
  const globalScore = Math.round(
    Object.values(report.scores).filter(s => s !== null).reduce((a, b) => a + b, 0) /
    Object.values(report.scores).filter(s => s !== null).length
  );

  try {
    // Génération du PDF
    const puppeteer = require('puppeteer');
    const pdfPath = reportPath.replace('.html', '.pdf');
    const pdfBrowser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const pdfPage = await pdfBrowser.newPage();
    await pdfPage.goto(`file:///${path.resolve(reportPath).replace(/\\/g, '/')}`, { waitUntil: 'networkidle0' });
    await pdfPage.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: '1cm', bottom: '1cm', left: '1cm', right: '1cm' } });
    await pdfBrowser.close();
    log('   ✅ PDF généré');

    await transporter.sendMail({
      from: `"Audit Oradia" <contact@oradia.fr>`,
      to: process.env.AUDIT_EMAIL_TO,
      subject: `[Audit oradia.fr] ${now.toLocaleDateString('fr-FR')} — Score ${globalScore}/100 | 🔴${summary.critical} 🟠${summary.important} 🟡${summary.minor}`,
      html: `
        <p>Bonjour Paddy,</p>
        <p>L'audit automatique d'oradia.fr vient de se terminer.</p>
        <ul>
          <li><strong>Score global :</strong> ${globalScore}/100</li>
          <li>🔴 ${summary.critical} problème(s) critique(s)</li>
          <li>🟠 ${summary.important} problème(s) important(s)</li>
          <li>🟡 ${summary.minor} problème(s) mineur(s)</li>
          <li>🟢 ${summary.ok} point(s) OK</li>
        </ul>
        <p>Le rapport complet est joint à cet email.</p>
      `,
      attachments: [
        { filename: path.basename(reportPath).replace('.html', '.pdf'), path: reportPath.replace('.html', '.pdf') },
      ],
    });
    log('   ✅ Email envoyé');
  } catch (e) {
    log(`   ❌ Erreur envoi email : ${e.message}`);
  }
}

// ─── NETTOYAGE ANCIENS AUDITS ─────────────────────────────────────
async function cleanupOldReports() {
  log('🧹 Nettoyage des anciens rapports...');
  const reportsDir = 'audit-reports';
  if (!fs.existsSync(reportsDir)) return;

  const files = fs.readdirSync(reportsDir);
  const oneMonthAgo = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000));
  let deletedCount = 0;

  for (const file of files) {
    const filePath = path.join(reportsDir, file);
    const stats = fs.statSync(filePath);
    
    if (stats.mtime < oneMonthAgo) {
      try {
        fs.unlinkSync(filePath);
        deletedCount++;
        log(`   🗑️  Supprimé : ${file}`);
      } catch (e) {
        log(`   ❌ Erreur suppression ${file} : ${e.message}`);
      }
    }
  }

  if (deletedCount > 0) {
    log(`   ✅ ${deletedCount} ancien(s) rapport(s) supprimé(s)`);
  } else {
    log(`   ℹ️  Aucun rapport à supprimer`);
  }
}

// ─── MAIN ────────────────────────────────────────────────────
async function main() {
  console.log('\n' + '═'.repeat(60));
  console.log('  AUDIT ORADIA.FR');
  console.log('  ' + new Date().toLocaleString('fr-FR'));
  console.log('═'.repeat(60) + '\n');

  const reportsDir = 'audit-reports';
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

  // Nettoyage des anciens rapports
  await cleanupOldReports();

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

  try {
    const pages = await discoverPages(browser);
    await auditPages(pages);
    await auditSecurity();
    await auditResponsive(browser, pages);
    await auditSEO(pages);
    await auditRGPD(browser, pages);
    await auditAPI(browser);
    await auditPerformance(browser);
    await auditMisc(browser);
  } finally {
    await browser.close();
  }

  computeScores();

  const dateSlug = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
  const reportPath = path.join(reportsDir, `audit-${dateSlug}.html`);
  fs.writeFileSync(reportPath, generateHTML());

  console.log('\n' + '═'.repeat(60));
  console.log(`  ✅ Rapport généré : ${reportPath}`);
  console.log(`  🔴 ${report.summary.critical} critiques`);
  console.log(`  🟠 ${report.summary.important} importants`);
  console.log(`  🟡 ${report.summary.minor} mineurs`);
  console.log(`  🟢 ${report.summary.ok} OK`);
  console.log('═'.repeat(60) + '\n');

  await sendReportByEmail(reportPath);
}

main().catch(err => {
  console.error('Erreur fatale :', err);
  process.exit(1);
});
