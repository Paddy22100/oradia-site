# Audit oradia.fr — Guide d'installation

## Ce que fait ce script

Il analyse **oradia.fr** en profondeur et produit un rapport HTML avec :
- ✅ État de toutes les pages (HTTP, accessibilité)
- 🔒 Sécurité (headers, HTTPS, clés exposées)
- 📱 Responsive (6 viewports, screenshots automatiques)
- 🔎 SEO (title, meta, H1, OG tags, sitemap)
- ⚖️  RGPD (mentions légales, CGV, cookies, footer)
- ⚡ API & Fonctionnel (tirage, Stripe, Brevo, Supabase)
- 🚀 Performance (temps de chargement, LCP, poids)
- 🔧 Divers (favicon, manifest, erreurs JS console)

Le rapport est envoyé automatiquement par email après chaque audit.

---

## Installation locale (première fois)

### Prérequis
- Node.js 18+ installé ([nodejs.org](https://nodejs.org))
- Accès à ton repo GitHub `Paddy22100/oradia-site`

### Étapes

```bash
# 1. Créer un dossier audit à la racine de ton repo
mkdir audit
cd audit

# 2. Copier les fichiers reçus dans ce dossier :
#    - audit-oradia.js
#    - package.json
#    - .env.audit.example

# 3. Installer les dépendances
npm install
npx playwright install chromium

# 4. Créer ta config locale
cp .env.audit.example .env.audit
# Puis éditer .env.audit avec tes vraies valeurs (voir ci-dessous)

# 5. Lancer l'audit
node audit-oradia.js
```

Le rapport s'ouvre dans `audit-reports/audit-[date].html`.

---

## Configuration .env.audit

```
AUDIT_TARGET_URL=https://oradia.fr
AUDIT_EMAIL_TO=ton@email.fr
AUDIT_SMTP_HOST=smtp-relay.brevo.com
AUDIT_SMTP_PORT=587
AUDIT_SMTP_SECURE=false
AUDIT_SMTP_USER=ton-login-brevo
AUDIT_SMTP_PASS=ta-clé-API-SMTP-Brevo
```

**Clé SMTP Brevo** : Espace Brevo → Paramètres → SMTP & API → Clés SMTP

---

## Automatisation GitHub Actions

### 1. Placer le workflow

Créer le dossier `.github/workflows/` à la racine du repo, et y copier `audit-oradia.yml`.

### 2. Créer les Secrets GitHub

Dans ton repo GitHub : **Settings → Secrets and variables → Actions → New repository secret**

Créer ces secrets (exactement ces noms) :

| Secret | Valeur |
|--------|--------|
| `AUDIT_EMAIL_TO` | ton adresse email |
| `AUDIT_SMTP_HOST` | `smtp-relay.brevo.com` |
| `AUDIT_SMTP_PORT` | `587` |
| `AUDIT_SMTP_SECURE` | `false` |
| `AUDIT_SMTP_USER` | ton login Brevo |
| `AUDIT_SMTP_PASS` | ta clé API SMTP Brevo |

### 3. Calendrier automatique

L'audit se lance **automatiquement** :
- Tous les **lundis à 7h00** (heure de Paris)
- Tous les **jeudis à 7h00** (heure de Paris)

Pour passer à 1×/semaine plus tard, supprimer simplement la ligne `cron` du jeudi dans le fichier `.yml`.

### 4. Lancement manuel

Dans GitHub → onglet **Actions** → "Audit oradia.fr" → **Run workflow**

### 5. Retrouver les rapports

Après chaque run : GitHub → Actions → clic sur le run → section **Artifacts** → télécharger `audit-report-XXX`
Les rapports sont conservés 90 jours.

---

## Structure du projet

```
audit/
├── audit-oradia.js          ← script principal
├── package.json             ← dépendances
├── .env.audit.example       ← template config (safe à committer)
├── .env.audit               ← ta vraie config (⚠️ NE PAS committer)
└── audit-reports/           ← rapports générés (gitignore conseillé)
    ├── audit-2026-06-10.html
    └── screenshots/
        ├── accueil-mobile-portrait.png
        └── ...

.github/
└── workflows/
    └── audit-oradia.yml     ← automatisation GitHub Actions
```

---

## .gitignore à ajouter

Dans ton `.gitignore` à la racine :

```
audit/.env.audit
audit/audit-reports/
audit/node_modules/
```

---

## Fréquence recommandée

| Phase | Fréquence | Cron à utiliser |
|-------|-----------|-----------------|
| Rodage (maintenant) | 2×/semaine | Lundi + Jeudi ✅ déjà configuré |
| Croisière | 1×/semaine | Supprimer la ligne jeudi |
| Post-lancement stable | 1×/mois | `0 5 1 * *` |
