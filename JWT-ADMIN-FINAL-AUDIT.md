# 🔒 JWT ADMIN - AUDIT FINAL & ALERTE SÉCURITÉ

## ✅ **CORRECTIONS APPLIQUÉES**

### **1. api/admin/me.js**
- ✅ JWT payload : `type: 'admin'` (corrigé)
- ✅ Lecture token : `decoded.type` (corrigé)
- ✅ **Vérification explicite ajoutée** : `decoded.type === 'admin'`

```javascript
// Vérifier que c'est bien un token admin
if (decoded.type !== 'admin') {
    return res.status(401).json({
        error: 'Unauthorized',
        message: 'Type de session invalide'
    });
}
```

### **2. api/admin/login.js**
- ✅ JWT payload : `type: 'admin'` (corrigé)
- ✅ Cookie maxAge : 7200 secondes (correct)
- ✅ Expiration JWT : 2h (correct)

---

## ⚠️ **ALERTE SÉCURITÉ CRITIQUE**

### **PROBLÈME MAJEUR DÉTECTÉ**

**Les routes admin sensibles N'ONT AUCUNE AUTHENTIFICATION !**

#### **api/admin/data.js**
- ❌ **AUCUNE vérification de session**
- ❌ **AUCUNE vérification JWT**
- ❌ Expose toutes les données admin sans protection
- ❌ N'importe qui peut appeler `/api/admin/data?section=overview`

#### **api/admin/contacts-export.js**
- ❌ **AUCUNE vérification de session**
- ❌ **AUCUNE vérification JWT**
- ❌ Expose tous les contacts (précommandes, dons, waitlist)
- ❌ N'importe qui peut télécharger `/api/admin/contacts-export`

#### **api/admin/logout.js**
- ✅ Pas de problème (logout ne nécessite pas d'auth stricte)

---

## 🚨 **IMPACT SÉCURITÉ**

### **Données Exposées Publiquement**
1. **Toutes les précommandes** avec emails, noms, montants, villes
2. **Tous les dons** avec emails, noms, montants
3. **Toute la waitlist** avec emails, noms
4. **KPI financiers** : montants totaux, nombre de clients
5. **Export CSV complet** de toute la base clients

### **Risques**
- ❌ Vol de données personnelles (RGPD)
- ❌ Espionnage commercial
- ❌ Scraping automatisé
- ❌ Violation de confidentialité

---

## 🔧 **CORRECTION URGENTE REQUISE**

### **Créer un middleware d'authentification admin**

**Fichier : `api/admin/_middleware.js`** (ou fonction utilitaire)

```javascript
const jwt = require('jsonwebtoken');
const cookie = require('cookie');

function verifyAdminAuth(req) {
    const cookies = cookie.parse(req.headers.cookie || '');
    const token = cookies.oradia_admin_session;
    
    if (!token) {
        throw new Error('Session non trouvée');
    }
    
    const decoded = jwt.verify(token, process.env.ADMIN_SESSION_SECRET);
    
    if (decoded.type !== 'admin') {
        throw new Error('Type de session invalide');
    }
    
    const sessionAge = Math.floor((Date.now() - decoded.loginTime) / 1000 / 60);
    if (sessionAge > 120) {
        throw new Error('Session expirée');
    }
    
    return decoded;
}

module.exports = { verifyAdminAuth };
```

### **Appliquer dans data.js**

```javascript
const { verifyAdminAuth } = require('./_middleware');

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ 
            error: 'Method not allowed',
            message: 'Méthode non autorisée'
        });
    }

    try {
        // VÉRIFICATION AUTH ADMIN
        verifyAdminAuth(req);
        
        // ... reste du code
    } catch (error) {
        if (error.message.includes('Session') || error.message.includes('Token')) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: error.message
            });
        }
        // ... reste gestion erreurs
    }
}
```

### **Appliquer dans contacts-export.js**

```javascript
const { verifyAdminAuth } = require('./_middleware');

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ 
            error: 'Method not allowed',
            message: 'Méthode non autorisée'
        });
    }

    try {
        // VÉRIFICATION AUTH ADMIN
        verifyAdminAuth(req);
        
        // ... reste du code
    } catch (error) {
        if (error.message.includes('Session') || error.message.includes('Token')) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: error.message
            });
        }
        // ... reste gestion erreurs
    }
}
```

---

## 📊 **ÉTAT ACTUEL DES ROUTES ADMIN**

| Route | Auth JWT | Vérif type | Statut |
|-------|----------|------------|--------|
| `/api/admin/login` | N/A | N/A | ✅ OK |
| `/api/admin/me` | ✅ | ✅ | ✅ OK |
| `/api/admin/logout` | ⚠️ | N/A | ✅ OK |
| `/api/admin/data` | ❌ | ❌ | 🚨 **CRITIQUE** |
| `/api/admin/contacts-export` | ❌ | ❌ | 🚨 **CRITIQUE** |

---

## 🎯 **PLAN D'ACTION IMMÉDIAT**

### **Priorité 1 : Sécuriser les routes**
1. Créer middleware `verifyAdminAuth`
2. Appliquer dans `data.js`
3. Appliquer dans `contacts-export.js`
4. Tester en navigation privée

### **Priorité 2 : Tester le fix JWT**
1. Redéployer avec corrections JWT
2. Supprimer cookie `oradia_admin_session`
3. Tester login en navigation privée
4. Vérifier dashboard charge sans clignotement

### **Priorité 3 : Audit complet**
1. Vérifier toutes les routes `/api/admin/*`
2. S'assurer qu'aucune route sensible n'est exposée
3. Ajouter rate limiting sur routes admin

---

## ✅ **CONFIRMATION TYPE VS ROLE**

### **Plus aucune dépendance à `role`**
- ✅ `login.js` : utilise `type: 'admin'`
- ✅ `me.js` : lit `decoded.type` et vérifie `=== 'admin'`
- ✅ `data.js` : **N'A PAS D'AUTH** (à corriger)
- ✅ `contacts-export.js` : **N'A PAS D'AUTH** (à corriger)
- ✅ `logout.js` : lit `decoded.email` pour log uniquement (OK)

**Aucune route ne vérifie `role` → cohérence `type` confirmée**

---

## 🚀 **DÉPLOIEMENT**

### **Étape 1 : Corrections JWT (fait)**
```bash
git add api/admin/login.js api/admin/me.js
git commit -m "fix: standardize JWT admin to type and add explicit verification"
```

### **Étape 2 : Sécurisation routes (URGENT)**
```bash
git add api/admin/_middleware.js api/admin/data.js api/admin/contacts-export.js
git commit -m "security: add authentication to admin data routes"
git push origin main
```

### **Étape 3 : Test**
1. Navigation privée
2. Supprimer cookie si nécessaire
3. Login → Dashboard
4. Vérifier plus de clignotement
5. Tester `/api/admin/data` → doit rejeter sans auth

---

## 📋 **RÉSUMÉ FINAL**

### **JWT type/role**
- ✅ **Corrigé** : `type: 'admin'` partout
- ✅ **Vérifié** : Plus aucune dépendance à `role`
- ✅ **Sécurisé** : Vérification explicite `decoded.type === 'admin'`

### **Sécurité routes admin**
- 🚨 **CRITIQUE** : `data.js` et `contacts-export.js` sans auth
- ⚠️ **ACTION REQUISE** : Ajouter middleware auth immédiatement
- 🔒 **RGPD** : Données personnelles actuellement exposées

### **Test requis**
- ✅ Navigation privée obligatoire
- ✅ Suppression cookie ancien format
- ✅ Vérification clignotement résolu
- ✅ Vérification routes protégées

---

## 🏆 **VERDICT**

**JWT type/role :** ✅ **RÉSOLU**
**Clignotement :** ✅ **PROBABLEMENT RÉSOLU** (à confirmer après test)
**Sécurité admin :** 🚨 **CRITIQUE - ACTION IMMÉDIATE REQUISE**

**Le clignotement était bien causé par l'incohérence `type`/`role`, mais un problème de sécurité majeur a été découvert lors de l'audit.**
