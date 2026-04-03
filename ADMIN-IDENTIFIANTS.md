# 🔐 ADMIN DASHBOARD - IDENTIFIANTS

## 📋 **IDENTIFIANTS ADMIN**

### **Email**
```
contact@oradia.fr
```

### **Mot de passe**
```
Oradia2025!
```

---

## ⚠️ **IMPORTANT**

Les identifiants admin sont configurés via **variables d'environnement Vercel** :

```bash
ADMIN_EMAIL=contact@oradia.fr
ADMIN_PASSWORD_HASH=bcrypt_hash_ici
ADMIN_SESSION_SECRET=minimum_32_caracteres_aleatoires
```

---

## 🔧 **GÉNÉRATION DU HASH**

Pour générer le hash bcrypt du mot de passe :

```bash
node -e "console.log(require('bcrypt').hashSync('Oradia2025!', 10))"
```

**Résultat à copier dans `ADMIN_PASSWORD_HASH` :**
```
$2b$10$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## 🚀 **CONFIGURATION VERCEL**

Dans le dashboard Vercel > Settings > Environment Variables :

1. **ADMIN_EMAIL** = `contact@oradia.fr`
2. **ADMIN_PASSWORD_HASH** = `[hash bcrypt généré ci-dessus]`
3. **ADMIN_SESSION_SECRET** = `[clé secrète 32+ caractères]`

---

## 🎯 **UTILISATION**

1. Allez sur `https://votre-domaine.vercel.app/admin/login.html`
2. Entrez : `contact@oradia.fr`
3. Entrez : `votre_mot_de_passe_admin`
4. Vous serez redirigé vers le dashboard

---

## 🔒 **SÉCURITÉ**

- Le mot de passe n'est **jamais stocké en clair**
- Seul le **hash bcrypt** est conservé
- Session sécurisée avec **cookie HttpOnly**
- Token JWT avec **expiration 2 heures**

---

## 📝 **NOTES**

- Changez le mot de passe pour la production
- Utilisez un mot de passe fort (12+ caractères)
- Générer un nouveau hash pour chaque changement
- Le `ADMIN_SESSION_SECRET` doit être unique et secret
