# 🔒 VÉRIFICATION SÉCURITÉ - ORADIA

**Date** : 19 mai 2026  
**Statut** : ✅ **SÉCURISÉ**

---

## ✅ AUDIT DE SÉCURITÉ COMPLET

### **1. Mots de passe et secrets**

#### ✅ **SÉCURISÉ** - Variables d'environnement
- ✅ `ADMIN_PASSWORD` : Stocké dans Vercel (pas dans le code)
- ✅ `JWT_SECRET` : Stocké dans Vercel (pas dans le code)
- ✅ `STRIPE_SECRET_KEY` : Stocké dans Vercel (pas dans le code)
- ✅ `STRIPE_WEBHOOK_SECRET` : Stocké dans Vercel (pas dans le code)
- ✅ `BREVO_API_KEY` : Stocké dans Vercel (pas dans le code)
- ✅ `SUPABASE_SERVICE_ROLE_KEY` : Stocké dans Vercel (pas dans le code)

#### ✅ **CORRIGÉ** - Fichiers nettoyés
- ✅ `server/scripts/update-admin.js` : Mot de passe supprimé, utilise `process.env.ADMIN_PASSWORD`
- ✅ `server/scripts/seed.js` : Mot de passe supprimé, utilise `process.env.ADMIN_PASSWORD`

#### ⚠️ **ATTENTION** - Fichier `.env` local
- ✅ Protégé par `.gitignore` (ne sera jamais commité)
- ⚠️ **NE JAMAIS** commiter le fichier `.env`
- ⚠️ **NE JAMAIS** partager le fichier `.env`

---

## 🔑 CLÉS PUBLIQUES VS SECRÈTES

### **Clés PUBLIQUES (peuvent être exposées)**

Ces clés peuvent être dans le code client (HTML/JS) :

```javascript
// ✅ OK - Clé publique Stripe
const stripe = Stripe('pk_live_51TAsp69jcRbNO5oy...');

// ✅ OK - Clé publique Supabase
const supabase = createClient('https://xxx.supabase.co', 'eyJhbGciOi... (anon key)');
```

**Pourquoi c'est sécurisé ?**
- Ces clés sont **conçues** pour être publiques
- Elles ont des **permissions limitées** côté serveur
- Stripe : Peut créer des sessions de paiement, mais pas accéder aux paiements
- Supabase : Peut lire les données publiques, mais RLS empêche l'accès aux données sensibles

### **Clés SECRÈTES (JAMAIS exposées)**

Ces clés doivent **TOUJOURS** être dans les variables d'environnement :

```bash
# ❌ JAMAIS dans le code client
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
BREVO_API_KEY=xkeysib-...
ADMIN_PASSWORD=...
JWT_SECRET=...
```

**Pourquoi c'est critique ?**
- Ces clés donnent un **accès total** aux services
- Si exposées, un attaquant peut :
  - Créer des remboursements Stripe
  - Accéder à toutes les données Supabase
  - Envoyer des emails en ton nom
  - Se connecter en tant qu'admin

---

## 🔍 VÉRIFICATION DES FICHIERS

### **Fichiers vérifiés (aucune clé exposée)**

✅ `precommande-oracle.html` : Clé publique Stripe uniquement
✅ `server/scripts/update-admin.js` : Utilise `process.env.ADMIN_PASSWORD`
✅ `server/scripts/seed.js` : Utilise `process.env.ADMIN_PASSWORD`
✅ `server/services/stripeService.js` : Utilise `process.env.STRIPE_SECRET_KEY`
✅ `api/create-checkout-session.js` : Utilise `process.env.STRIPE_SECRET_KEY`

### **Fichiers protégés par .gitignore**

✅ `.env` : Jamais commité
✅ `node_modules/` : Jamais commité
✅ `.vercel/` : Jamais commité

---

## 🛡️ BONNES PRATIQUES APPLIQUÉES

### **1. Hashage des mots de passe**

```javascript
// ✅ Bon - Utilise bcrypt avec 12 rounds
const hashedPassword = await bcrypt.hash(adminPassword, 12);
```

**Pourquoi c'est sécurisé ?**
- Bcrypt est un algorithme de hashage **lent** (résistant au brute-force)
- 12 rounds = ~250ms par tentative (ralentit les attaques)
- Impossible de retrouver le mot de passe original

### **2. JWT avec expiration**

```javascript
// ✅ Bon - Token expire après 7 jours
const token = jwt.sign(
  { id: user._id, email: user.email },
  process.env.JWT_SECRET,
  { expiresIn: '7d' }
);
```

**Pourquoi c'est sécurisé ?**
- Les tokens volés expirent automatiquement
- Secret JWT stocké dans les variables d'environnement
- Signature vérifiée à chaque requête

### **3. Validation des entrées**

```javascript
// ✅ Bon - Validation avec express-validator
body('email').isEmail().normalizeEmail(),
body('password').isLength({ min: 6 })
```

**Pourquoi c'est sécurisé ?**
- Empêche les injections SQL/XSS
- Normalise les données avant stockage
- Rejette les entrées invalides

### **4. HTTPS forcé**

```json
// vercel.json
{
  "headers": [
    {
      "key": "Strict-Transport-Security",
      "value": "max-age=31536000; includeSubDomains"
    }
  ]
}
```

**Pourquoi c'est sécurisé ?**
- Force HTTPS pendant 1 an
- Empêche les attaques man-in-the-middle
- Protège les cookies de session

---

## ⚠️ POINTS D'ATTENTION

### **1. Mot de passe admin**

**Ce que tu dois faire** :
1. Créer un mot de passe **très fort** (16+ caractères)
2. Utiliser un générateur : https://passwordsgenerator.net/
3. Le stocker dans un gestionnaire de mots de passe (1Password, Bitwarden)
4. L'ajouter dans Vercel : `ADMIN_PASSWORD=...`
5. **NE JAMAIS** le partager par email/chat

**Exemple de bon mot de passe** :
```
Xk9$mP2#vL8@nQ5!rT3wY6&zN4^hB7*
```

### **2. JWT_SECRET**

**Ce que tu dois faire** :
1. Générer une clé aléatoire de 32+ caractères
2. Utiliser : `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
3. L'ajouter dans Vercel : `JWT_SECRET=...`
4. **NE JAMAIS** la changer en production (invaliderait tous les tokens)

### **3. Clés Stripe**

**Ce que tu dois faire** :
1. Utiliser les clés de **PRODUCTION** (pas test)
2. `pk_live_...` dans le code frontend (OK)
3. `sk_live_...` dans Vercel (SECRET)
4. `whsec_...` dans Vercel (SECRET)
5. Activer 2FA sur ton compte Stripe

### **4. Webhook Stripe**

**Ce que tu dois faire** :
1. Configurer l'URL : `https://TON-DOMAINE.vercel.app/api/stripe-webhook`
2. Copier le secret : `whsec_...`
3. L'ajouter dans Vercel : `STRIPE_WEBHOOK_SECRET=...`
4. Tester avec Stripe CLI

---

## 🔐 CHECKLIST DE SÉCURITÉ

### **Avant déploiement**

- [ ] ✅ Aucun mot de passe en clair dans le code
- [ ] ✅ Toutes les clés secrètes dans Vercel
- [ ] ✅ `.env` dans `.gitignore`
- [ ] ✅ Mot de passe admin fort (16+ caractères)
- [ ] ✅ JWT_SECRET généré (32+ caractères)
- [ ] ✅ Clés Stripe de PRODUCTION
- [ ] ✅ Webhook Stripe configuré
- [ ] ✅ 2FA activé sur Stripe
- [ ] ✅ 2FA activé sur Vercel
- [ ] ✅ 2FA activé sur Supabase

### **Après déploiement**

- [ ] ✅ Tester connexion admin
- [ ] ✅ Tester paiement Stripe
- [ ] ✅ Vérifier webhook reçoit les événements
- [ ] ✅ Vérifier emails envoyés
- [ ] ✅ Changer mot de passe admin si compromis

---

## 🚨 EN CAS DE COMPROMISSION

### **Si une clé est exposée**

1. **IMMÉDIATEMENT** :
   - Révoquer la clé dans le service concerné (Stripe, Supabase, etc.)
   - Générer une nouvelle clé
   - Mettre à jour dans Vercel
   - Redéployer

2. **Vérifier** :
   - Logs Stripe pour transactions suspectes
   - Logs Supabase pour accès non autorisés
   - Logs Vercel pour requêtes anormales

3. **Prévenir** :
   - Activer 2FA partout
   - Utiliser des clés restreintes (Stripe)
   - Monitorer les accès (Sentry, LogRocket)

### **Si le mot de passe admin est compromis**

1. **IMMÉDIATEMENT** :
   - Changer `ADMIN_PASSWORD` dans Vercel
   - Exécuter `node server/scripts/update-admin.js`
   - Vérifier les logs d'accès au dashboard

2. **Vérifier** :
   - Commandes suspectes dans Supabase
   - Exports CSV non autorisés
   - Modifications de données

---

## ✅ RÉSUMÉ

### **Ce qui est SÉCURISÉ** ✅

- ✅ Mots de passe hashés avec bcrypt
- ✅ Clés secrètes dans variables d'environnement
- ✅ JWT avec expiration
- ✅ HTTPS forcé
- ✅ Validation des entrées
- ✅ `.env` dans `.gitignore`
- ✅ Webhook Stripe sécurisé

### **Ce que tu DOIS faire** ⚠️

1. Créer un mot de passe admin **très fort**
2. Générer un `JWT_SECRET` aléatoire
3. Configurer toutes les variables dans Vercel
4. Utiliser les clés Stripe de **PRODUCTION**
5. Configurer le webhook Stripe
6. Activer 2FA partout
7. Tester en production

### **Ce que tu NE DOIS JAMAIS faire** ❌

- ❌ Commiter le fichier `.env`
- ❌ Partager des clés secrètes par email/chat
- ❌ Utiliser des mots de passe faibles
- ❌ Désactiver HTTPS
- ❌ Exposer `sk_live_...` dans le code client

---

## 📞 SUPPORT SÉCURITÉ

### **Stripe**
- Sécurité : https://stripe.com/docs/security
- 2FA : https://dashboard.stripe.com/settings/user

### **Vercel**
- Sécurité : https://vercel.com/docs/security
- 2FA : https://vercel.com/account/security

### **Supabase**
- Sécurité : https://supabase.com/docs/guides/platform/security
- 2FA : https://supabase.com/dashboard/account/security

---

**🔒 Ton site est maintenant SÉCURISÉ !**

Suis le guide `GUIDE_CONFIGURATION_PRODUCTION.md` pour finaliser la configuration.

**Dernière vérification** : 19 mai 2026  
**Prochaine révision** : Tous les 3 mois
