# 🔧 WEBHOOK STRIPE - CONFIGURATION FINALE

## ✅ **CORRECTIONS APPLIQUÉES**

### **1. Retour 500 si échec DB**
- ✅ Si `upsertError` → `res.status(500)` 
- ✅ Stripe retentera automatiquement
- ❌ Plus de retour 200 si DB échouée

### **2. Protection emails en doublon**
- ✅ Vérification `email_sent_at` avant envoi
- ✅ Table `preorders` : `email_sent_at` ajouté
- ✅ Table `donors` : `email_sent_at` ajouté
- ✅ Pas de renvoi si déjà envoyé

### **3. Logs réduits en production**
- ❌ Supprimé : session Stripe complète
- ❌ Supprimé : logs adresse/téléphone/payload
- ✅ Conservé : session ID, event type, DB status, email status

### **4. Architecture webhook unique**
- ✅ Fichier retenu : `api/stripe-webhook.js`
- ✅ URL Stripe : `/api/stripe-webhook`
- ❌ Plus d'utilisation de `server/routes/payments.js`

---

## 📋 **FICHERS CONCERNÉS**

### **Webhook principal**
```
api/stripe-webhook.js
```

### **Configuration Vercel**
```
vercel.json
- Route : /api/stripe-webhook → api/stripe-webhook.js
- Function : api/stripe-webhook.js (maxDuration: 30s)
```

---

## 🌐 **URL EXACTE À CONFIGURER DANS STRIPE**

```
https://votre-domaine.vercel.app/api/stripe-webhook
```

### **Étapes Stripe Dashboard**
1. **Stripe** → **Developers** → **Webhooks**
2. **Add endpoint** → URL ci-dessus
3. **Events à écouter** :
   - `checkout.session.completed`
   - `payment_intent.succeeded` (optionnel)
   - `payment_intent.payment_failed` (optionnel)
4. **Signing secret** → Copier dans `STRIPE_WEBHOOK_SECRET`

---

## 📊 **NOMBRE DE FONCTIONS FINAL**

### **Total : 9 fonctions (≤12) ✅**
1. `api/stripe-webhook.js` - Webhook Stripe
2. `api/admin/login.js` - Auth admin
3. `api/admin/logout.js` - Logout admin
4. `api/admin/me.js` - Session admin
5. `api/admin/data.js` - Données admin fusionnées
6. `api/admin/contacts-export.js` - Export CSV
7. `api/preorders/progress.js` - Progression précommandes
8. `api/create-checkout-session.js` - Sessions Stripe
9. `api/contact.js` - Formulaire contact

---

## 🧪 **TEST DE BOUT EN BOUT**

### **1. Configuration pré-requis**
```bash
# Variables Vercel obligatoires
STRIPE_SECRET_KEY=sk_live_*
STRIPE_WEBHOOK_SECRET=whsec_*
SUPABASE_URL=*
SUPABASE_SERVICE_ROLE_KEY=*
BREVO_API_KEY=*
BREVO_SENDER_EMAIL=*
BREVO_SENDER_NAME=*
```

### **2. Test paiement**
1. **Aller sur la page de précommande**
2. **Choisir une offre** (ex: Early Bird)
3. **Payer avec Stripe Test**
4. **Vérifier dans Supabase** :
   - Table `preorders` → enregistrement créé
   - `paid_status = 'completed'`
   - `email_sent_at` renseigné après email

### **3. Test contribution**
1. **Choisir "Contribution libre"**
2. **Payer avec Stripe Test**
3. **Vérifier dans Supabase** :
   - Table `donors` → enregistrement créé
   - `paid_status = 'completed'`
   - `email_sent_at` renseigné après email

### **4. Test email reçu**
- ✅ Sujet : "Ta précommande ORADIA est confirmée"
- ✅ Expéditeur : config BREVO_SENDER_EMAIL
- ✅ Contenu : offre + montant

### **5. Test erreurs**
- **DB down** → Webhook retourne 500 → Stripe retente
- **Email échoue** → Webhook continue (pas de 500)
- **Signature invalide** → Webhook retourne 400

---

## 🔍 **LOGS PRODUCTION**

### **Format réduit**
```
🎯 Webhook event: checkout.session.completed
🛒 Session completed: cs_xxx
✅ Webhook traité: cs_xxx | DB:OK | Email:OK
```

### **Erreurs**
```
❌ Upsert Supabase échoué: [message]
❌ Brevo API error: [status]
❌ Webhook processing error: [message]
```

---

## 🎯 **VERDICT FINAL**

### **✅ Points validés**
- **Limite Hobby** : 9 fonctions ≤ 12
- **Flux métier** : Complet et robuste
- **Retries Stripe** : Configuration correcte
- **Protection doublons** : Implémentée
- **Logs optimisés** : Production-ready

### **🚀 Prêt pour déploiement**
Le webhook est maintenant :
- **Fiable** : Retries automatiques si DB échoue
- **Efficace** : Pas d'emails en doublon
- **Propre** : Logs réduits en production
- **Compatible** : Architecture Vercel Hobby

**Configuration terminée et prête pour production !**
