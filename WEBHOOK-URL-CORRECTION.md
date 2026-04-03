# 🔧 WEBHOOK - CORRECTION URL PRODUCTION

## ✅ **URL WEBHOOK CORRECTE**

### **URL valide (déjà configurée dans Stripe)**
```
https://oradia.fr/api/stripe-webhook
```

### **URL invalide (404 DEPLOYMENT_NOT_FOUND)**
```
https://oradia.vercel.app/api/stripe-webhook
```

---

## 📋 **ACTIONS IMMÉDIATES**

### **1. Conserver l'URL existante**
- ✅ **Garder** : `https://oradia.fr/api/stripe-webhook` dans Stripe Dashboard
- ❌ **Ne pas changer** vers `oradia.vercel.app`
- ✅ **Déjà fonctionnel** : 200 OK

---

## 🔍 **VÉRIFICATIONS REQUISES**

### **2. Vérifier colonne `email_sent_at` dans `preorders`**
```sql
-- Vérification spécifique preorders
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'preorders' 
  AND column_name = 'email_sent_at';
```

### **3. Vérifier événements Stripe récents**
Dans **Stripe Dashboard → Developers → Webhooks** :

#### **Derniers événements**
- **Event ID** : `evt_xxx`
- **Type** : `checkout.session.completed`
- **Status** : 200 OK
- **Timestamp** : Date/heure

#### **Détails à vérifier**
```javascript
// Session payload
{
  "id": "cs_xxx",
  "customer_details": {
    "email": "client@email.com"
  },
  "metadata": {
    "offer": "early-bird"
  },
  "amount_total": 5900
}
```

---

## 📊 **VÉRIFICATION BASE DE DONNÉES**

### **4. Vérifier écriture en base**
```sql
-- Dernières précommandes
SELECT 
  stripe_session_id,
  email,
  offer,
  amount_total,
  paid_status,
  email_sent_at,
  created_at
FROM preorders 
ORDER BY created_at DESC 
LIMIT 5;

-- Derniers dons
SELECT 
  stripe_session_id,
  email,
  amount_total,
  paid_status,
  email_sent_at,
  created_at
FROM donors 
ORDER BY created_at DESC 
LIMIT 5;
```

### **5. Vérifier logs webhook**
Dans **Vercel Dashboard → Functions → Logs** :

```
🎯 Webhook event: checkout.session.completed
🛒 Session completed: cs_xxx
✅ Webhook traité: cs_xxx | DB:OK | Email:OK
```

---

## 🧪 **TEST DE VALIDATION**

### **Scénario de test**
1. **Faire une précommande** sur `https://oradia.fr`
2. **Vérifier dans Stripe** : Event reçu (200 OK)
3. **Vérifier dans Supabase** : 
   - Table `preorders` → nouvel enregistrement
   - `email_sent_at` renseigné
4. **Vérifier email reçu** : "Ta précommande ORADIA est confirmée"

---

## ✅ **CHECKLIST FINALE**

- [ ] URL webhook conservée : `https://oradia.fr/api/stripe-webhook`
- [ ] Colonne `email_sent_at` présente dans `preorders`
- [ ] Colonne `email_sent_at` présente dans `donors`
- [ ] Événement Stripe récent vérifié
- [ ] Écriture en base confirmée
- [ ] Email envoyé confirmé
- [ ] Logs Vercel cohérents

---

## 🎯 **CONCLUSION**

**Le webhook est déjà correctement configuré avec :**
- ✅ URL production valide : `https://oradia.fr/api/stripe-webhook`
- ✅ Stripe déjà pointant vers la bonne URL
- ✅ Pas de changement nécessaire dans Stripe

**Il reste à vérifier :**
- 🔍 Colonnes `email_sent_at` dans les deux tables
- 🔍 Événements récents et écriture en base
- 🔍 Logs et envoi d'emails

**Configuration déjà optimale, juste besoin de validation !**
