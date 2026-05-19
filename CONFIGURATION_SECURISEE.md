# 🔐 GUIDE DE CONFIGURATION SÉCURISÉE - ORADIA

**Date** : 19 mai 2026  
**Objectif** : Configuration production sécurisée avant lancement

---

## ⚠️ ACTIONS CRITIQUES AVANT DÉPLOIEMENT

### 1️⃣ **Changer le mot de passe administrateur**

Le mot de passe admin était en clair dans le code. Il a été corrigé mais **VOUS DEVEZ** :

1. **Créer un nouveau mot de passe fort** :
   - Minimum 16 caractères
   - Majuscules + minuscules + chiffres + symboles
   - Exemple : `Xk9$mP2#vL8@nQ5!rT3`
   - Générateur : https://passwordsgenerator.net/

2. **Configurer dans Vercel** :
   ```bash
   ADMIN_EMAIL=votre-email@protonmail.com
   ADMIN_PASSWORD=votre-nouveau-mot-de-passe-fort
   ```

3. **Exécuter le script** (une fois déployé) :
   ```bash
   node server/scripts/update-admin.js
   ```

4. **Sauvegarder le mot de passe** dans un gestionnaire sécurisé (1Password, Bitwarden)

---

## 🔑 VARIABLES D'ENVIRONNEMENT VERCEL

### **Configuration complète à ajouter dans Vercel**

Aller sur : https://vercel.com/votre-projet/settings/environment-variables

```bash
# ========================================
# STRIPE (PAIEMENTS)
# ========================================
STRIPE_SECRET_KEY=sk_live_VOTRE_CLE_SECRETE_STRIPE
STRIPE_PUBLISHABLE_KEY=pk_live_VOTRE_CLE_PUBLIQUE_STRIPE
STRIPE_WEBHOOK_SECRET=whsec_VOTRE_SECRET_WEBHOOK_STRIPE

# ========================================
# SUPABASE (BASE DE DONNÉES)
# ========================================
SUPABASE_URL=https://votre-projet.supabase.co
SUPABASE_SERVICE_ROLE_KEY=VOTRE_CLE_SERVICE_ROLE_SUPABASE
SUPABASE_ANON_KEY=VOTRE_CLE_ANON_SUPABASE

# ========================================
# BREVO (EMAILS)
# ========================================
BREVO_API_KEY=xkeysib-VOTRE_CLE_API_BREVO
BREVO_SENDER_EMAIL=noreply@oradia.fr
BREVO_SENDER_NAME=ORADIA

# ========================================
# ADMIN (SÉCURITÉ)
# ========================================
ADMIN_EMAIL=Oradia@protonmail.com
ADMIN_PASSWORD=VOTRE_MOT_DE_PASSE_FORT_16_CARACTERES_MINIMUM

# ========================================
# JWT (AUTHENTIFICATION)
# ========================================
JWT_SECRET=GENERER_UNE_CLE_ALEATOIRE_32_CARACTERES_MINIMUM
JWT_EXPIRE=7d

# ========================================
# MONGODB (SI UTILISÉ)
# ========================================
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/oradia?retryWrites=true&w=majority

# ========================================
# ENVIRONNEMENT
# ========================================
NODE_ENV=production
```

---

## 🔐 GÉNÉRATION DE CLÉS SÉCURISÉES

### **JWT_SECRET** (32+ caractères aléatoires)

**Option 1 - Node.js** :
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Option 2 - OpenSSL** :
```bash
openssl rand -hex 32
```

**Option 3 - En ligne** :
https://generate-secret.vercel.app/32

**Exemple de résultat** :
```
a7f3e9d2c8b1f4e6a9d3c7b2f5e8a1d4c9b6f3e7a2d5c8b1f4e9a3d7c2b6f5e8
```

---

## 🌐 CONFIGURATION STRIPE PRODUCTION

### **1. Activer le mode Production**

1. Aller sur https://dashboard.stripe.com
2. Basculer en **mode Production** (toggle en haut à gauche)
3. Récupérer les clés :
   - **Clé publique** : `pk_live_...`
   - **Clé secrète** : `sk_live_...`

### **2. Configurer le Webhook**

1. Aller dans **Développeurs** → **Webhooks**
2. Cliquer sur **+ Ajouter un endpoint**
3. **URL** : `https://oradia.fr/api/stripe-webhook`
4. **Événements à écouter** :
   - `checkout.session.completed`
   - `payment_intent.succeeded`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
5. **Copier le secret** : `whsec_...`
6. Ajouter dans Vercel : `STRIPE_WEBHOOK_SECRET=whsec_...`

### **3. Tester le Webhook**

```bash
# Installer Stripe CLI
brew install stripe/stripe-brew/stripe

# Se connecter
stripe login

# Écouter les événements
stripe listen --forward-to https://oradia.fr/api/stripe-webhook

# Déclencher un événement test
stripe trigger checkout.session.completed
```

---

## 📧 CONFIGURATION BREVO (EMAILS)

### **1. Créer un compte Brevo**

1. Aller sur https://www.brevo.com/fr/
2. Créer un compte gratuit (300 emails/jour)
3. Vérifier votre domaine `oradia.fr`

### **2. Configurer SPF et DKIM**

**SPF** (Sender Policy Framework) :
```
v=spf1 include:spf.brevo.com ~all
```

**DKIM** : Suivre les instructions Brevo pour ajouter les enregistrements DNS

### **3. Récupérer la clé API**

1. Aller dans **Paramètres** → **Clés API**
2. Créer une nouvelle clé : **"ORADIA Production"**
3. Copier la clé : `xkeysib-...`
4. Ajouter dans Vercel : `BREVO_API_KEY=xkeysib-...`

### **4. Configurer l'expéditeur**

```bash
BREVO_SENDER_EMAIL=noreply@oradia.fr
BREVO_SENDER_NAME=ORADIA
```

---

## 🗄️ CONFIGURATION SUPABASE

### **1. Créer le projet**

1. Aller sur https://supabase.com
2. Créer un nouveau projet : **"oradia-production"**
3. Choisir la région : **Europe (Frankfurt)** pour RGPD
4. Définir un mot de passe base de données fort

### **2. Exécuter le SQL**

1. Aller dans **SQL Editor**
2. Exécuter le script : `SQL_SHIPPING_TRACKING.sql`
3. Vérifier que les tables existent :
   - `preorders`
   - `donors`
   - `waitlist_tirages`

### **3. Récupérer les clés**

1. Aller dans **Settings** → **API**
2. Copier :
   - **URL** : `https://xxx.supabase.co`
   - **anon public** : `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
   - **service_role** : `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (secret)

3. Ajouter dans Vercel :
```bash
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOi...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi... (SECRET)
```

### **4. Configurer RLS (Row Level Security)**

```sql
-- Activer RLS sur toutes les tables
ALTER TABLE preorders ENABLE ROW LEVEL SECURITY;
ALTER TABLE donors ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist_tirages ENABLE ROW LEVEL SECURITY;

-- Politique pour l'admin (service_role)
CREATE POLICY "Admin full access" ON preorders
  FOR ALL USING (auth.role() = 'service_role');
```

---

## 🔒 SÉCURITÉ SUPPLÉMENTAIRE

### **1. Activer 2FA sur tous les comptes**

- ✅ Vercel
- ✅ Stripe
- ✅ Supabase
- ✅ Brevo
- ✅ GitHub
- ✅ Domaine (OVH, Cloudflare, etc.)

### **2. Limiter les accès**

- **Vercel** : Inviter uniquement les collaborateurs nécessaires
- **Stripe** : Créer des clés restreintes par fonctionnalité
- **Supabase** : Utiliser RLS (Row Level Security)

### **3. Monitoring et Alertes**

**Vercel** :
- Activer les notifications d'erreur
- Configurer Sentry ou LogRocket

**Stripe** :
- Activer les alertes de paiement échoué
- Surveiller les webhooks manqués

**Supabase** :
- Activer les logs d'audit
- Surveiller les requêtes lentes

---

## 📋 CHECKLIST DE CONFIGURATION

### **Avant déploiement**

- [ ] ✅ Mot de passe admin changé et fort
- [ ] ✅ Variables Vercel configurées (toutes)
- [ ] ✅ Stripe en mode Production
- [ ] ✅ Webhook Stripe configuré et testé
- [ ] ✅ Brevo configuré (SPF + DKIM)
- [ ] ✅ Supabase configuré (tables + RLS)
- [ ] ✅ JWT_SECRET généré (32+ caractères)
- [ ] ✅ 2FA activé sur tous les comptes
- [ ] ✅ Backup base de données effectué

### **Après déploiement**

- [ ] ✅ Test paiement Stripe production
- [ ] ✅ Test email confirmation (Brevo)
- [ ] ✅ Test email suivi expédition
- [ ] ✅ Test dashboard admin (connexion)
- [ ] ✅ Test export CSV
- [ ] ✅ Test export Mondial Relay
- [ ] ✅ Monitoring actif (logs Vercel)

---

## 🚨 EN CAS DE PROBLÈME

### **Webhook Stripe ne fonctionne pas**

1. Vérifier l'URL : `https://oradia.fr/api/stripe-webhook`
2. Vérifier le secret dans Vercel
3. Tester avec Stripe CLI :
   ```bash
   stripe listen --forward-to https://oradia.fr/api/stripe-webhook
   ```
4. Vérifier les logs Vercel

### **Emails non reçus**

1. Vérifier SPF/DKIM configurés
2. Vérifier clé API Brevo
3. Vérifier email expéditeur vérifié
4. Checker spam/promotions
5. Vérifier logs Brevo

### **Dashboard admin inaccessible**

1. Vérifier mot de passe changé
2. Vérifier JWT_SECRET configuré
3. Vérifier cookies autorisés
4. Tester en navigation privée
5. Vérifier logs Vercel

---

## 📞 SUPPORT

### **Stripe**
- Documentation : https://stripe.com/docs
- Support : https://support.stripe.com

### **Supabase**
- Documentation : https://supabase.com/docs
- Discord : https://discord.supabase.com

### **Brevo**
- Documentation : https://developers.brevo.com
- Support : support@brevo.com

### **Vercel**
- Documentation : https://vercel.com/docs
- Support : https://vercel.com/support

---

**🔐 SÉCURITÉ AVANT TOUT**

Ne **JAMAIS** :
- ❌ Commiter des clés dans Git
- ❌ Partager des clés par email
- ❌ Utiliser des mots de passe faibles
- ❌ Désactiver HTTPS
- ❌ Exposer des endpoints admin sans auth

**Toujours** :
- ✅ Utiliser des variables d'environnement
- ✅ Activer 2FA partout
- ✅ Changer les mots de passe régulièrement
- ✅ Monitorer les logs
- ✅ Faire des backups réguliers

---

**Dernière mise à jour** : 19 mai 2026  
**Prochaine révision** : Tous les 3 mois
