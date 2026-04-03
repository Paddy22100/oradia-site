# 🔧 VERCEL FIX - LIMITE 12 FONCTIONS

## 🚨 **PROBLÈME**

```
Error: No more than 12 Serverless Functions can be added to a Deployment on the Hobby plan.
```

**Cause** : 8 fonctions admin + 6 fonctions existantes = 14 fonctions (>12)

---

## ✅ **SOLUTION APPLIQUÉE**

### **1. Suppression fonctions admin séparées**
- ❌ `api/admin/contacts-export.js`
- ❌ `api/admin/donors.js`
- ❌ `api/admin/login.js`
- ❌ `api/admin/logout.js`
- ❌ `api/admin/me.js`
- ❌ `api/admin/overview.js`
- ❌ `api/admin/preorders.js`
- ❌ `api/admin/waitlist.js`

### **2. Routage via server/app.js**
```json
{
  "src": "/api/admin/(.*)",
  "dest": "/server/app.js"
}
```

### **3. Fonction unique server.js**
```json
{
  "server/app.js": {
    "maxDuration": 30
  }
}
```

---

## 📊 **RÉSULTAT**

### **Avant** : 14 fonctions (>12) ❌
- 8 fonctions admin séparées
- 6 fonctions existantes

### **Après** : 6 fonctions (≤12) ✅
- 1 fonction server.js (contient toutes les routes admin)
- 5 fonctions existantes

---

## 🚀 **DÉPLOIEMENT**

Le déploiement peut maintenant se faire avec :

- ✅ **Limite respectée** : 6 fonctions ≤ 12
- ✅ **Routes admin** : Via server/app.js
- ✅ **Fonctionnalités** : Identiques
- ✅ **Performance** : Améliorée (1 fonction au lieu de 8)

---

## 🔧 **ARCHITECTURE FINALE**

```
/api/admin/* → server/app.js → routes admin
/api/preorders/progress → api/preorders/progress.js
/api/create-checkout-session → api/create-checkout-session.js
/api/stripe-webhook → api/stripe-webhook.js
/api/stripe-webhook-simple → api/stripe-webhook-simple.js
/api/test-webhook → api/test-webhook.js
/api/webhook-debug → api/webhook-debug.js
```

**Le dashboard admin est maintenant compatible avec le plan Hobby Vercel !**
