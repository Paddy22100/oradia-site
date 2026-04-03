# 🔧 WEBHOOK - PRODUCTION READY

## ✅ **ÉTAPE 1 - AJOUT COLONNES SUPABASE**

### **SQL à exécuter dans Supabase SQL Editor**
```sql
-- Pour la table preorders
ALTER TABLE preorders 
ADD COLUMN IF NOT EXISTS email_sent_at timestamptz NULL;

-- Pour la table donors  
ALTER TABLE donors
ADD COLUMN IF NOT EXISTS email_sent_at timestamptz NULL;

-- Vérification
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name IN ('preorders', 'donors') 
  AND column_name = 'email_sent_at'
ORDER BY table_name;
```

### **Résultat attendu**
```
column_name   | data_type | is_nullable
--------------|-----------|------------
email_sent_at | timestamptz| YES
email_sent_at | timestamptz| YES
```

---

## 🌐 **ÉTAPE 2 - URL WEBHOOK RÉELLE**

### **Domaine de production ORADIA**
```
https://oradia.vercel.app/api/stripe-webhook
```

### **URL à configurer dans Stripe Dashboard**
1. **Stripe** → **Developers** → **Webhooks**
2. **Add endpoint** → `https://oradia.vercel.app/api/stripe-webhook`
3. **Events** : `checkout.session.completed`
4. **Copy signing secret** → `STRIPE_WEBHOOK_SECRET`

---

## 📋 **ÉTAPE 3 - VÉRIFICATION PRÉ-DÉPLOIEMENT**

### **Variables Vercel requises**
```bash
# Stripe (obligatoire)
STRIPE_SECRET_KEY=sk_live_*
STRIPE_WEBHOOK_SECRET=whsec_*

# Supabase (obligatoire)  
SUPABASE_URL=*
SUPABASE_SERVICE_ROLE_KEY=*

# Email (obligatoire)
BREVO_API_KEY=*
BREVO_SENDER_EMAIL=*
BREVO_SENDER_NAME=*

# Admin (obligatoire)
ADMIN_EMAIL=contact@oradia.fr
ADMIN_PASSWORD_HASH=[hash bcrypt]
ADMIN_SESSION_SECRET=[clé 32+ caractères]
```

### **Vérification colonnes**
- ✅ `preorders.email_sent_at` existe
- ✅ `donors.email_sent_at` existe

### **Vérification déploiement**
- ✅ `api/stripe-webhook.js` déployé
- ✅ `vercel.json` à jour
- ✅ Route `/api/stripe-webhook` active

---

## 🧪 **ÉTAPE 4 - TEST BOUT EN BOUT**

### **Test 1 : Précommande**
1. **Aller sur** : `https://oradia.vercel.app/precommande-oracle.html`
2. **Choisir offre** : Early Bird (59€)
3. **Payer avec** : Carte test Stripe
4. **Vérifier** :
   - Email reçu : "Ta précommande ORADIA est confirmée"
   - Supabase `preorders` : nouvel enregistrement
   - `email_sent_at` : renseigné

### **Test 2 : Contribution**
1. **Choisir** : "Contribution libre"
2. **Payer** : 25€ avec Stripe test
3. **Vérifier** :
   - Email reçu : "Merci pour ton soutien à ORADIA"
   - Supabase `donors` : nouvel enregistrement
   - `email_sent_at` : renseigné

### **Test 3 : Retry Stripe**
1. **Simuler échec DB** (temporairement)
2. **Payer à nouveau**
3. **Vérifier** :
   - Webhook retourne 500
   - Stripe retente automatiquement
   - Pas de doublon email

---

## 📊 **LOGS ATTENDUS**

### **Cas normal**
```
🎯 Webhook event: checkout.session.completed
🛒 Session completed: cs_xxx
✅ Webhook traité: cs_xxx | DB:OK | Email:OK
```

### **Cas retry**
```
🎯 Webhook event: checkout.session.completed
❌ Upsert Supabase échoué: [message]
🎯 Webhook event: checkout.session.completed (retry)
✅ Webhook traité: cs_xxx | DB:OK | Email:OK
```

---

## ✅ **CHECKLIST FINALE**

- [ ] Colonnes `email_sent_at` ajoutées dans Supabase
- [ ] Variables Vercel configurées
- [ ] Webhook déployé sur Vercel
- [ ] URL Stripe configurée : `https://oradia.vercel.app/api/stripe-webhook`
- [ ] Test précommande effectué
- [ ] Test contribution effectué
- [ ] Emails reçus sans doublons
- [ ] Logs production corrects

---

## 🎯 **VERDICT**

**Le webhook est prêt pour la production avec :**
- ✅ Architecture propre (9 fonctions ≤ 12)
- ✅ Protection doublons emails
- ✅ Retries Stripe automatiques
- ✅ Logs production optimisés
- ✅ URL réelle configurée

**Prêt pour déploiement et tests en production !**
