# 🚨 WEBHOOK STRIPE - ALERTE CRITIQUE

## ⚠️ **PROBLÈME IDENTIFIÉ**

**Le webhook Stripe a été supprimé mais le flux métier dépend encore de lui !**

---

## 🔍 **ANALYSE CRITIQUE**

### **Ce qui a été supprimé**
- ❌ `api/stripe-webhook.js` - **SUPPRIMÉ**

### **Ce qui existe encore**
- ✅ `server/routes/payments.js` - **CONTIENT le webhook**
- ✅ Route `/api/payments/webhook` - **ACTIVE**

---

## 🎯 **VÉRITÉ DU WEBHOOK**

### **Le webhook EST PRÉSENT**
```javascript
// Dans server/routes/payments.js (lignes 254-303)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    
    switch (event.type) {
        case 'checkout.session.completed':
            // TODO: Mettre à jour la base de données
            break;
    }
});
```

### **Mais il est INCOMPLET**
```javascript
// Lignes 279-282 - COMMENTÉES !
// - Envoyer un email de confirmation
// - Mettre à jour votre base de données  
// - Traiter la commande
```

---

## 🚨 **PROBLÈMES RÉELS**

### **1. Webhook incomplet**
- ✅ Route présente
- ❌ Logique métier COMMENTÉE
- ❌ Pas d'écriture dans Supabase
- ❌ Pas d'emails post-paiement

### **2. Double architecture**
- ✅ `server/routes/payments.js` (Express)
- ❌ `api/stripe-webhook.js` (Vercel) - supprimé
- 🤔 **Lequel est utilisé en production ?**

---

## 📋 **QUESTIONS CRITIQUES**

### **1. Quelle architecture est active ?**
- **Vercel serverless** → `api/stripe-webhook.js` (supprimé)
- **Express server** → `server/routes/payments.js` (incomplet)

### **2. Comment les paiements sont-ils enregistrés ?**
- Si Vercel : **FICHIER SUPPRIMÉ = FLUX CASSÉ**
- Si Express : **WEBHOOK INCOMPLE = FLUX CASSÉ**

### **3. Quelle est la configuration Stripe ?**
- Dashboard Stripe → URL webhook configurée
- Pointe-t-elle vers `/api/stripe-webhook` ou `/api/payments/webhook` ?

---

## 🔧 **SOLUTIONS IMMÉDIATES**

### **Option 1 : Compléter le webhook Express**
```javascript
// Dans server/routes/payments.js
case 'checkout.session.completed':
    const session = event.data.object;
    
    // Écrire dans Supabase
    await supabase.from('preorders').insert({
        email: session.customer_email,
        amount_total: session.amount_total / 100,
        paid_status: 'completed',
        // ... autres champs
    });
    
    // Envoyer email
    await sendConfirmationEmail(session.customer_email);
    break;
```

### **Option 2 : Restaurer le webhook Vercel**
- Recréer `api/stripe-webhook.js`
- Compléter la logique métier
- Mettre à jour `vercel.json`

---

## 🎯 **DIAGNOSTIC RAPIDE**

### **Vérifier Stripe Dashboard**
1. Aller dans Stripe → Developers → Webhooks
2. Regarder l'URL endpoint configurée
3. Si URL = `/api/stripe-webhook` → **FLUX CASSÉ**
4. Si URL = `/api/payments/webhook` → **FLUX INCOMPLET**

---

## ⚡ **ACTION REQUISE**

### **AVANT tout déploiement**

1. **Vérifier l'URL webhook** dans Stripe Dashboard
2. **Compléter la logique** dans le webhook utilisé
3. **Tester un paiement** de bout en bout
4. **Vérifier l'écriture** dans Supabase
5. **Vérifier l'email** de confirmation

---

## 🚨 **RISQUE**

Si le webhook est cassé :
- ❌ Les paiements ne sont pas enregistrés
- ❌ Les clients ne reçoivent pas d'email
- ❌ Les précommandes ne sont pas marquées "paid"
- ❌ Le dashboard admin affiche des données fausses

---

## 📝 **CONCLUSION**

**Le webhook est PARTIELLEMENT PRÉSENT mais INCOMPLET.**

Il faut :
1. Identifier quelle architecture est utilisée
2. Compléter la logique métier
3. Tester avant déploiement

**Le flux de paiement est potentiellement cassé !**
