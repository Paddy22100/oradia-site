# 🚀 ACTIONS IMMÉDIATES - ORADIA

**Date** : 19 mai 2026  
**Temps estimé** : 30 minutes

---

## 🎯 PROBLÈMES ACTUELS

1. ❌ **Stripe en mode TEST** → "Environnement de test" s'affiche
2. ⚠️ **Mot de passe admin** → À configurer dans Vercel
3. ⚠️ **Webhook non configuré** → Pas de confirmation de paiement

---

## ✅ SOLUTION EN 7 ÉTAPES

### **ÉTAPE 1 : Récupérer tes clés Stripe PRODUCTION** (5 min)

1. Va sur https://dashboard.stripe.com
2. **Désactive** le toggle "Mode test" (en haut à gauche)
3. Va dans **Développeurs** → **Clés API**
4. **COPIE** ces deux clés :

```
Clé publique  : pk_live_51TAsp69jcRbNO5oy...XXXXXXXXXX
Clé secrète   : sk_live_51TAsp69jcRbNO5oy...XXXXXXXXXX
```

---

### **ÉTAPE 2 : Créer le webhook Stripe** (3 min)

1. Dans Stripe, va dans **Développeurs** → **Webhooks**
2. Clique sur **+ Ajouter un endpoint**
3. **URL** : `https://oradia-site-trail.vercel.app/api/stripe-webhook`
   (remplace par ton vrai domaine Vercel)
4. **Événements** : Sélectionne :
   - `checkout.session.completed`
   - `payment_intent.succeeded`
5. Clique sur **Ajouter**
6. **COPIE** le secret : `whsec_XXXXXXXXXXXXXXXXXXXXXXXXXX`

---

### **ÉTAPE 3 : Générer JWT_SECRET** (1 min)

**Option 1** : Va sur https://generate-secret.vercel.app/32

**Option 2** : Dans un terminal :
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**COPIE** le résultat (64 caractères) :
```
a7f3e9d2c8b1f4e6a9d3c7b2f5e8a1d4c9b6f3e7a2d5c8b1f4e9a3d7c2b6f5e8
```

---

### **ÉTAPE 4 : Configurer Vercel** (10 min)

1. Va sur https://vercel.com/dashboard
2. Sélectionne ton projet ORADIA
3. Va dans **Settings** → **Environment Variables**
4. Ajoute **TOUTES** ces variables (clique sur "Add New" pour chaque) :

```bash
# STRIPE PRODUCTION
STRIPE_PUBLISHABLE_KEY = pk_live_51TAsp69jcRbNO5oy...XXXXXXXXXX
STRIPE_SECRET_KEY = sk_live_51TAsp69jcRbNO5oy...XXXXXXXXXX
STRIPE_WEBHOOK_SECRET = whsec_XXXXXXXXXXXXXXXXXXXXXXXXXX

# ADMIN (TON NOUVEAU MOT DE PASSE)
ADMIN_EMAIL = Oradia@protonmail.com
ADMIN_PASSWORD = [TON_NOUVEAU_MOT_DE_PASSE_FORT_16_CARACTERES]

# JWT
JWT_SECRET = a7f3e9d2c8b1f4e6a9d3c7b2f5e8a1d4c9b6f3e7a2d5c8b1f4e9a3d7c2b6f5e8
JWT_EXPIRE = 7d

# SUPABASE (depuis ton dashboard Supabase)
SUPABASE_URL = https://xxxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# BREVO (depuis ton dashboard Brevo)
BREVO_API_KEY = xkeysib-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
BREVO_SENDER_EMAIL = noreply@oradia.fr
BREVO_SENDER_NAME = ORADIA
```

⚠️ **IMPORTANT** : Pour chaque variable, sélectionne **Production, Preview, Development**

---

### **ÉTAPE 5 : Modifier le code frontend** (2 min)

1. Ouvre `precommande-oracle.html`
2. Ligne 165, remplace :

```javascript
// AVANT
const stripeInstance = Stripe('pk_live_REMPLACER_PAR_VOTRE_CLE_PUBLIQUE_STRIPE');

// APRÈS (colle ta vraie clé pk_live_...)
const stripeInstance = Stripe('pk_live_51TAsp69jcRbNO5oy...XXXXXXXXXX');
```

3. **Sauvegarde** le fichier

---

### **ÉTAPE 6 : Déployer** (5 min)

```bash
git add .
git commit -m "feat: configure Stripe production + secure admin password"
git push origin main
```

Vercel va redéployer automatiquement. Attends que le statut passe à "Ready" (2-3 min).

---

### **ÉTAPE 7 : Configurer l'admin** (2 min)

**Option A - Via Vercel CLI** (recommandé) :
```bash
# Installer Vercel CLI si pas déjà fait
npm i -g vercel

# Se connecter
vercel login

# Exécuter le script
vercel exec -- node server/scripts/update-admin.js
```

**Option B - Localement** (si MongoDB accessible) :
```bash
node server/scripts/update-admin.js
```

Tu devrais voir :
```
✅ Administrateur mis à jour avec succès
   📧 Email: Oradia@protonmail.com
   🔐 Mot de passe: [PROTÉGÉ]
```

---

## ✅ VÉRIFICATION FINALE (2 min)

### **1. Tester le paiement**

1. Va sur ton site : `https://TON-DOMAINE.vercel.app/precommande-oracle.html`
2. Clique sur "Je précommande"
3. **VÉRIFIE** : Tu dois voir "Payer Environnement de **PRODUCTION**" (pas "test")
4. Si tu vois encore "test", vide le cache (Ctrl+Shift+R)

### **2. Tester le dashboard admin**

1. Va sur `https://TON-DOMAINE.vercel.app/admin/login.html`
2. Connecte-toi avec :
   - Email : `Oradia@protonmail.com`
   - Mot de passe : [TON_NOUVEAU_MOT_DE_PASSE]
3. Tu dois accéder au dashboard

### **3. Tester le webhook**

1. Fais un paiement test (1€)
2. Va dans Stripe → Développeurs → Webhooks
3. Clique sur ton webhook
4. Vérifie que l'événement `checkout.session.completed` a été reçu (statut 200)

---

## 🆘 PROBLÈMES FRÉQUENTS

### **"Environnement de test" s'affiche toujours**

1. Vérifie que tu as bien remplacé `pk_test_` par `pk_live_` dans `precommande-oracle.html`
2. Vide le cache : Ctrl+Shift+R (Windows) ou Cmd+Shift+R (Mac)
3. Vérifie dans la console (F12) que la clé commence par `pk_live_`

### **Dashboard admin inaccessible**

1. Vérifie que `ADMIN_PASSWORD` est bien dans Vercel
2. Vérifie que `JWT_SECRET` est configuré
3. Exécute à nouveau `node server/scripts/update-admin.js`
4. Vide les cookies du navigateur

### **Webhook ne reçoit pas les événements**

1. Vérifie l'URL : `https://TON-DOMAINE.vercel.app/api/stripe-webhook`
2. Vérifie que `STRIPE_WEBHOOK_SECRET` est dans Vercel
3. Redéploie le site
4. Teste avec Stripe CLI :
   ```bash
   stripe listen --forward-to https://TON-DOMAINE.vercel.app/api/stripe-webhook
   ```

---

## 📋 CHECKLIST RAPIDE

- [ ] Clés Stripe production récupérées
- [ ] Webhook Stripe créé
- [ ] JWT_SECRET généré
- [ ] Toutes les variables dans Vercel
- [ ] Code frontend modifié (`pk_live_...`)
- [ ] Git commit + push
- [ ] Déploiement terminé
- [ ] Script `update-admin.js` exécuté
- [ ] Paiement test réussi
- [ ] Dashboard admin accessible
- [ ] Webhook reçoit les événements

---

## 🎯 RÉSULTAT ATTENDU

Après ces 7 étapes, tu auras :

✅ Paiements Stripe en **PRODUCTION** (plus de "test")
✅ Webhook fonctionnel (confirmations de paiement)
✅ Dashboard admin accessible avec ton nouveau mot de passe
✅ Site 100% opérationnel et sécurisé

---

## 📚 DOCUMENTATION COMPLÈTE

Pour plus de détails, consulte :

- `GUIDE_CONFIGURATION_PRODUCTION.md` : Guide complet pas-à-pas
- `SECURITE_VERIFICATION.md` : Audit de sécurité complet
- `CONFIGURATION_SECURISEE.md` : Configuration détaillée

---

**🚀 C'est parti ! Suis ces 7 étapes et ton site sera opérationnel en 30 minutes.**

**Besoin d'aide ?** Consulte la section "🆘 PROBLÈMES FRÉQUENTS" ci-dessus.
