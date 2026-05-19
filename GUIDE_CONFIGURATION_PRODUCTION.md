# 🚀 GUIDE DE CONFIGURATION PRODUCTION - ORADIA

**Date** : 19 mai 2026  
**Objectif** : Configurer le site en mode PRODUCTION

---

## ⚠️ PROBLÈMES ACTUELS DÉTECTÉS

### 1️⃣ **Stripe en mode TEST**
- ❌ Tu utilises `pk_test_...` dans le code
- ❌ Les paiements sont en "Environnement de test"
- ❌ Le webhook n'est pas configuré pour la production

### 2️⃣ **Mot de passe admin à configurer**
- ⚠️ Nouveau mot de passe à ajouter dans Vercel
- ⚠️ Script `update-admin.js` à exécuter après déploiement

---

## 🔑 ÉTAPE 1 : RÉCUPÉRER TES CLÉS STRIPE PRODUCTION

### **A. Basculer en mode Production sur Stripe**

1. Va sur https://dashboard.stripe.com
2. En haut à gauche, **désactive** le toggle "Mode test"
3. Tu es maintenant en **mode Production** (fond bleu foncé)

### **B. Récupérer les clés de production**

1. Va dans **Développeurs** → **Clés API**
2. Tu verras deux clés :

```
Clé publique : pk_live_51TAsp69jcRbNO5oy...XXXXXXXXXX
Clé secrète  : sk_live_51TAsp69jcRbNO5oy...XXXXXXXXXX (cliquer sur "Révéler la clé de test en production")
```

3. **COPIE CES DEUX CLÉS** (on va les utiliser après)

---

## 🔗 ÉTAPE 2 : CONFIGURER LE WEBHOOK STRIPE PRODUCTION

### **A. Créer le webhook**

1. Dans Stripe, va dans **Développeurs** → **Webhooks**
2. Clique sur **+ Ajouter un endpoint**
3. **URL de l'endpoint** : `https://TON-DOMAINE.vercel.app/api/stripe-webhook`
   - Exemple : `https://oradia-site-trail.vercel.app/api/stripe-webhook`
4. **Événements à écouter** :
   - `checkout.session.completed`
   - `payment_intent.succeeded`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
5. Clique sur **Ajouter un endpoint**

### **B. Récupérer le secret du webhook**

1. Clique sur le webhook que tu viens de créer
2. Dans la section **Clé de signature**, clique sur **Révéler**
3. **COPIE LE SECRET** : `whsec_XXXXXXXXXXXXXXXXXXXXXXXXXX`

---

## 🌐 ÉTAPE 3 : CONFIGURER VERCEL

### **A. Aller dans les variables d'environnement**

1. Va sur https://vercel.com/dashboard
2. Sélectionne ton projet ORADIA
3. Va dans **Settings** → **Environment Variables**

### **B. Ajouter TOUTES les variables**

Clique sur **Add New** pour chaque variable :

#### **STRIPE (PRODUCTION)**
```
Name: STRIPE_PUBLISHABLE_KEY
Value: pk_live_51TAsp69jcRbNO5oy...XXXXXXXXXX
Environment: Production, Preview, Development
```

```
Name: STRIPE_SECRET_KEY
Value: sk_live_51TAsp69jcRbNO5oy...XXXXXXXXXX
Environment: Production, Preview, Development
```

```
Name: STRIPE_WEBHOOK_SECRET
Value: whsec_XXXXXXXXXXXXXXXXXXXXXXXXXX
Environment: Production, Preview, Development
```

#### **ADMIN (TON NOUVEAU MOT DE PASSE)**
```
Name: ADMIN_EMAIL
Value: Oradia@protonmail.com
Environment: Production, Preview, Development
```

```
Name: ADMIN_PASSWORD
Value: [TON_NOUVEAU_MOT_DE_PASSE_FORT]
Environment: Production, Preview, Development
```

#### **JWT (GÉNÈRE UNE CLÉ ALÉATOIRE)**

**Générer la clé JWT** :
- Va sur https://generate-secret.vercel.app/32
- OU dans un terminal : `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- Copie le résultat (64 caractères)

```
Name: JWT_SECRET
Value: a7f3e9d2c8b1f4e6a9d3c7b2f5e8a1d4c9b6f3e7a2d5c8b1f4e9a3d7c2b6f5e8
Environment: Production, Preview, Development
```

```
Name: JWT_EXPIRE
Value: 7d
Environment: Production, Preview, Development
```

#### **SUPABASE**

Va sur https://supabase.com → Ton projet → Settings → API

```
Name: SUPABASE_URL
Value: https://xxxxxxxxxxxxx.supabase.co
Environment: Production, Preview, Development
```

```
Name: SUPABASE_SERVICE_ROLE_KEY
Value: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Environment: Production, Preview, Development
```

```
Name: SUPABASE_ANON_KEY
Value: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Environment: Production, Preview, Development
```

#### **BREVO (EMAILS)**

Va sur https://app.brevo.com → Settings → SMTP & API → API Keys

```
Name: BREVO_API_KEY
Value: xkeysib-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
Environment: Production, Preview, Development
```

```
Name: BREVO_SENDER_EMAIL
Value: noreply@oradia.fr
Environment: Production, Preview, Development
```

```
Name: BREVO_SENDER_NAME
Value: ORADIA
Environment: Production, Preview, Development
```

---

## 📝 ÉTAPE 4 : MODIFIER LE CODE FRONTEND

### **A. Remplacer la clé Stripe publique**

1. Ouvre `precommande-oracle.html`
2. Ligne 165, remplace :

```javascript
// AVANT
const stripeInstance = Stripe('pk_live_REMPLACER_PAR_VOTRE_CLE_PUBLIQUE_STRIPE');

// APRÈS (avec ta vraie clé pk_live_...)
const stripeInstance = Stripe('pk_live_51TAsp69jcRbNO5oy...XXXXXXXXXX');
```

⚠️ **IMPORTANT** : La clé publique (`pk_live_...`) peut être exposée dans le code client, c'est normal et sécurisé.

### **B. Vérifier les autres fichiers**

Cherche dans tous les fichiers HTML s'il y a d'autres références à `pk_test_` :

```bash
# Dans le terminal
grep -r "pk_test_" *.html
```

Remplace toutes les occurrences par ta clé `pk_live_...`

---

## 🚀 ÉTAPE 5 : DÉPLOYER

### **A. Commit et push**

```bash
git add .
git commit -m "feat: configure Stripe production mode"
git push origin main
```

### **B. Vercel va redéployer automatiquement**

1. Va sur https://vercel.com/dashboard
2. Tu verras le déploiement en cours
3. Attends que le statut passe à "Ready"

---

## 🔐 ÉTAPE 6 : CONFIGURER LE MOT DE PASSE ADMIN

### **A. Après le déploiement**

Une fois le site déployé, tu dois exécuter le script pour créer/mettre à jour l'admin.

### **B. Option 1 : Via Vercel CLI (recommandé)**

```bash
# Installer Vercel CLI si pas déjà fait
npm i -g vercel

# Se connecter
vercel login

# Exécuter le script sur Vercel
vercel exec -- node server/scripts/update-admin.js
```

### **C. Option 2 : Localement (si MongoDB accessible)**

```bash
# Dans ton terminal local
node server/scripts/update-admin.js
```

### **D. Vérification**

Tu devrais voir :
```
✅ Connecté à MongoDB
✅ Administrateur mis à jour avec succès
   📧 Email: Oradia@protonmail.com
   🔐 Mot de passe: [PROTÉGÉ]
```

---

## ✅ ÉTAPE 7 : TESTER

### **A. Tester le paiement Stripe**

1. Va sur ton site : `https://TON-DOMAINE.vercel.app/precommande-oracle.html`
2. Clique sur "Je précommande"
3. **Vérifie que tu vois** : "Payer Environnement de **PRODUCTION**" (pas "test")
4. Utilise une vraie carte bancaire (ou carte test Stripe si tu veux)
5. Vérifie dans ton dashboard Stripe que le paiement apparaît

### **B. Tester le webhook**

1. Après un paiement, va dans Stripe → Développeurs → Webhooks
2. Clique sur ton webhook
3. Vérifie que les événements sont bien reçus (statut 200)

### **C. Tester le dashboard admin**

1. Va sur `https://TON-DOMAINE.vercel.app/admin/login.html`
2. Connecte-toi avec :
   - Email : `Oradia@protonmail.com`
   - Mot de passe : [TON_NOUVEAU_MOT_DE_PASSE]
3. Vérifie que tu accèdes au dashboard

---

## 🔍 VÉRIFICATIONS FINALES

### **Checklist de sécurité**

- [ ] ✅ Clés Stripe de PRODUCTION configurées dans Vercel
- [ ] ✅ Webhook Stripe configuré avec URL production
- [ ] ✅ Clé publique `pk_live_...` dans le code frontend
- [ ] ✅ Aucune clé `pk_test_` dans le code
- [ ] ✅ Mot de passe admin fort (16+ caractères)
- [ ] ✅ JWT_SECRET généré (32+ caractères)
- [ ] ✅ Toutes les variables Vercel configurées
- [ ] ✅ Script `update-admin.js` exécuté
- [ ] ✅ Paiement test réussi en production
- [ ] ✅ Webhook reçoit bien les événements
- [ ] ✅ Dashboard admin accessible

---

## 🆘 EN CAS DE PROBLÈME

### **"Environnement de test" s'affiche toujours**

1. Vérifie que tu as bien remplacé `pk_test_` par `pk_live_` dans `precommande-oracle.html`
2. Vide le cache du navigateur (Ctrl+Shift+R)
3. Vérifie dans la console du navigateur (F12) que la clé commence par `pk_live_`

### **Webhook ne fonctionne pas**

1. Vérifie l'URL du webhook dans Stripe : `https://TON-DOMAINE.vercel.app/api/stripe-webhook`
2. Vérifie que `STRIPE_WEBHOOK_SECRET` est bien configuré dans Vercel
3. Teste avec Stripe CLI :
   ```bash
   stripe listen --forward-to https://TON-DOMAINE.vercel.app/api/stripe-webhook
   ```

### **Dashboard admin inaccessible**

1. Vérifie que `ADMIN_PASSWORD` est bien configuré dans Vercel
2. Vérifie que `JWT_SECRET` est configuré
3. Exécute à nouveau `node server/scripts/update-admin.js`
4. Vide les cookies du navigateur

### **Emails non reçus**

1. Vérifie `BREVO_API_KEY` dans Vercel
2. Vérifie que l'email expéditeur est vérifié dans Brevo
3. Checke les spams/promotions
4. Vérifie les logs dans Brevo

---

## 📞 SUPPORT

### **Stripe**
- Dashboard : https://dashboard.stripe.com
- Documentation : https://stripe.com/docs
- Support : https://support.stripe.com

### **Vercel**
- Dashboard : https://vercel.com/dashboard
- Documentation : https://vercel.com/docs
- Support : https://vercel.com/support

### **Supabase**
- Dashboard : https://supabase.com/dashboard
- Documentation : https://supabase.com/docs
- Discord : https://discord.supabase.com

---

## 🎯 RÉSUMÉ DES ACTIONS

1. ✅ Récupérer clés Stripe production (`pk_live_...`, `sk_live_...`)
2. ✅ Créer webhook Stripe production
3. ✅ Configurer TOUTES les variables dans Vercel
4. ✅ Remplacer `pk_test_` par `pk_live_` dans `precommande-oracle.html`
5. ✅ Commit + Push
6. ✅ Attendre déploiement Vercel
7. ✅ Exécuter `node server/scripts/update-admin.js`
8. ✅ Tester paiement + webhook + dashboard

**Temps estimé** : 30 minutes

---

**Bon lancement ! 🚀**
