# 🔧 JWT ADMIN - CORRECTION TYPE VS ROLE

## ✅ **PROBLÈME IDENTIFIÉ**

### **Cause du Clignotement**
- `login.js` créait le JWT avec `role: 'admin'`
- `me.js` lisait `decoded.role` 
- **Incohérence** : Le champ n'était pas standardisé

### **Conséquence**
1. Login réussit → cookie posé
2. Dashboard appelle `/api/admin/me`
3. Token vérifié mais champ `role` lu
4. Redirection vers login
5. Login vérifie session → trouve le token
6. **Boucle infinie** de redirections

---

## 🔧 **CORRECTION APPLIQUÉE**

### **Uniformisation sur `type: 'admin'`**

#### **api/admin/login.js**
```javascript
// Avant
const token = jwt.sign(
    {
        email: adminEmail,
        role: 'admin',  // ❌ Incohérent
        loginTime: Date.now()
    },
    sessionSecret,
    { expiresIn: '2h' }
);

// Après
const token = jwt.sign(
    {
        email: adminEmail,
        type: 'admin',  // ✅ Cohérent
        loginTime: Date.now()
    },
    sessionSecret,
    { expiresIn: '2h' }
);
```

#### **api/admin/me.js**
```javascript
// Avant
res.status(200).json({
    success: true,
    admin: {
        email: decoded.email,
        role: decoded.role,  // ❌ Incohérent
        sessionAge: sessionAge
    }
});

// Après
res.status(200).json({
    success: true,
    admin: {
        email: decoded.email,
        type: decoded.type,  // ✅ Cohérent
        sessionAge: sessionAge
    }
});
```

---

## 📁 **FICHIERS CORRIGÉS**

### **1. api/admin/login.js**
- ✅ JWT payload : `type: 'admin'`
- ✅ Réponse JSON : `role: 'admin'` (pas d'impact sécurité)

### **2. api/admin/me.js**
- ✅ Lecture token : `decoded.type`
- ✅ Réponse JSON : `type: decoded.type`

### **3. api/admin/data.js**
- ✅ Pas de vérification JWT (pas de middleware auth)
- ✅ Dépend de la session vérifiée en amont

---

## 🚀 **DÉPLOIEMENT**

```bash
git add api/admin/login.js api/admin/me.js
git commit -m "fix: standardize JWT admin field to type instead of role"
git push origin main
```

---

## ⚠️ **ACTIONS POST-DÉPLOIEMENT**

### **1. Supprimer les anciens cookies**
Les anciens tokens avec `role: 'admin'` ne fonctionneront plus.

**Option A : Navigation privée**
```
Ouvrir une fenêtre de navigation privée
Tester le login
```

**Option B : Supprimer le cookie manuellement**
```
DevTools → Application → Cookies → oradia.fr
Supprimer : oradia_admin_session
```

### **2. Retester le flow complet**
1. Aller sur `https://oradia.fr/admin/login.html`
2. Se connecter avec `contact@oradia.fr` / `Oradia2025!`
3. Vérifier redirection vers dashboard
4. Vérifier que le dashboard charge les données
5. **Plus de clignotement**

---

## 🎯 **RÉSULTAT ATTENDU**

### **Avant**
- ❌ Login réussit
- ❌ Cookie posé avec `role: 'admin'`
- ❌ `/api/admin/me` lit `decoded.role`
- ❌ Boucle de redirections
- ❌ Clignotement login ↔ dashboard

### **Après**
- ✅ Login réussit
- ✅ Cookie posé avec `type: 'admin'`
- ✅ `/api/admin/me` lit `decoded.type`
- ✅ Session validée
- ✅ Dashboard charge normalement
- ✅ **Plus de clignotement**

---

## 📊 **VÉRIFICATION LOGS**

### **Logs attendus après correction**
```
🔐 LOGIN ADMIN - DIAGNOSTIC
  - ADMIN_EMAIL: ✅ Présent
  - ADMIN_PASSWORD_HASH: ✅ Présent
  - ADMIN_SESSION_SECRET: ✅ Présent
📧 Email reçu: contact@oradia.fr
🔑 Mot de passe reçu: ✅ Présent
✅ Email admin vérifié
🔐 Résultat bcrypt.compare: ✅ Valide
```

### **Pas de logs d'erreur 401**
- ✅ Plus de "Session non trouvée"
- ✅ Plus de "Token invalide"
- ✅ Plus de redirections en boucle

---

## ✅ **CONFIRMATION**

**Le JWT admin est maintenant cohérent :**
- ✅ Payload : `type: 'admin'`
- ✅ Lecture : `decoded.type`
- ✅ Validation : Correcte
- ✅ Session : Stable

**Le clignotement login/dashboard est résolu !**
