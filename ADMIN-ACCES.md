# 🔐 ACCÈS DASHBOARD ADMIN

## 📋 **URL DIRECTE**

Le dashboard admin n'est **pas lié publiquement** sur le site (c'est normal pour la sécurité).

### **URL d'accès direct**
```
https://votre-domaine.vercel.app/admin/login.html
```

### **En local**
```
http://localhost:3000/admin/login.html
```

---

## 🔑 **IDENTIFIANTS**

### **Email**
```
contact@oradia.fr
```

### **Mot de passe**
```
Oradia2025!
```

---

## ⚙️ **PRÉ-REQUIS**

### **Variables Vercel configurées**
```bash
ADMIN_EMAIL=contact@oradia.fr
ADMIN_PASSWORD_HASH=[hash bcrypt de "Oradia2025!"]
ADMIN_SESSION_SECRET=[clé secrète 32+ caractères]
SUPABASE_URL=[URL Supabase]
SUPABASE_SERVICE_ROLE_KEY=[clé service Supabase]
```

### **Générer le hash**
```bash
node -e "console.log(require('bcrypt').hashSync('Oradia2025!', 10))"
```

---

## 🚀 **ÉTAPES DE CONNEXION**

1. **Aller à l'URL directe** : `/admin/login.html`
2. **Entrer les identifiants** ci-dessus
3. **Redirection automatique** vers `/admin/dashboard-admin.html`

---

## 🔒 **SÉCURITÉ**

- ✅ **Pas de lien public** - Accès uniquement par URL directe
- ✅ **Authentification requise** - Identifiants nécessaires
- ✅ **Cookie sécurisé** - HttpOnly, Secure, SameSite
- ✅ **Session limitée** - 2 heures d'inactivité

---

## 📱 **BOOKMARK**

Pour faciliter l'accès, ajoutez un bookmark :
```
Nom: Dashboard Admin ORADIA
URL: https://votre-domaine.vercel.app/admin/login.html
```

---

## 🎯 **SI ERREUR**

### **"Identifiants incorrects"**
- Vérifiez les variables Vercel configurées
- Vérifiez le hash bcrypt généré correctement

### **"Page introuvable"**
- Vérifiez que le déploiement contient les fichiers admin/
- Vérifiez la route `/admin/*` dans vercel.json

---

## 📝 **NOTE**

**L'absence de lien public est une mesure de sécurité normale.** L'accès se fait uniquement par URL directe avec identifiants.
