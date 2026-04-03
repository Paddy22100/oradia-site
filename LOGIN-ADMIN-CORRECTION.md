# 🔧 LOGIN ADMIN - CORRECTION PARSING

## ✅ **CORRECTION APPLIQUÉE**

### **Ancien parsing complexe**
```javascript
// Parser le body pour Vercel
let email, password;

if (req.body) {
    email = req.body.email;
    password = req.body.password;
} else if (req.body === undefined) {
    // Essayer de parser depuis string si nécessaire
    try {
        const parsed = JSON.parse(req.body);
        email = parsed.email;
        password = parsed.password;
    } catch (e) {
        console.error('❌ Erreur parsing body:', e.message);
    }
}
```

### **Nouveau parsing simple et saine**
```javascript
// Parsing simple et saine du body
const { email, password } = req.body || {};
```

---

## 🚀 **ACTION IMMÉDIATE**

### **1. Déployer la correction**
```bash
git add api/admin/login.js
git commit -m "fix: simplify body parsing for Vercel"
git push origin main
```

### **2. Attendre déploiement**
- **Temps** : 1-2 minutes
- **Vérifier** : Vercel Dashboard → Deployments

### **3. Retester immédiatement**
1. **URL** : `https://oradia.fr/admin/login.html`
2. **Identifiants** :
   - Email : `contact@oradia.fr`
   - Mot de passe : `Oradia2025!`
3. **Vérifier logs** : Vercel Dashboard → Functions → Logs

---

## 📊 **LOGS ATTENDUS APRÈS CORRECTION**

### **Cas normal**
```
🔐 LOGIN ADMIN - DIAGNOSTIC
  - ADMIN_EMAIL: ✅ Présent
  - ADMIN_PASSWORD_HASH: ✅ Présent
  - ADMIN_SESSION_SECRET: ✅ Présent
📧 Email reçu: contact@oradia.fr
🔑 Mot de passe reçu: ✅ Présent
✅ Email admin vérifié
🔐 Résultat bcrypt.compare: ✅ Valide
✅ Cookie créé, connexion réussie
```

### **Si problème persiste**
```
📧 Email reçu: ❌ Manquant
🔑 Mot de passe reçu: ❌ Manquant
❌ Email ou mot de passe manquant
```

---

## 🎯 **DIAGNOSTIC SI ÉCHEC PERSISTE**

### **Vérifier dans Vercel Dashboard**
1. **Settings → Environment Variables**
   - `ADMIN_EMAIL=contact@oradia.fr`
   - `ADMIN_PASSWORD_HASH=[hash bcrypt]`
   - `ADMIN_SESSION_SECRET=[clé 32+ car]`

2. **Functions → Logs**
   - Chercher `LOGIN ADMIN - DIAGNOSTIC`
   - Vérifier `ADMIN_PASSWORD_HASH` est bien un hash bcrypt

### **Générer hash si nécessaire**
```bash
node -e "const bcrypt = require('bcrypt'); bcrypt.hash('Oradia2025!', 12).then(console.log)"
```

---

## ✅ **RÉSULTAT ATTENDU**

**Après déploiement :**
- ✅ Parsing body simplifié
- ✅ Logs de diagnostic complets
- ✅ Connexion admin fonctionnelle
- ✅ Cookie posé et redirection

**Correction exécutable immédiatement !**
