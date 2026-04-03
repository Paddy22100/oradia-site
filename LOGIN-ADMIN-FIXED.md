# 🔧 LOGIN ADMIN - CORRECTION COMPLÈTE

## ✅ **CONTENU FINAL `api/admin/login.js`**

```javascript
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Cookie parser pour Vercel
const cookie = require('cookie');

export default async function handler(req, res) {
    // Logs de diagnostic
    console.log('🔐 LOGIN ADMIN - DIAGNOSTIC');
    console.log('  - ADMIN_EMAIL:', process.env.ADMIN_EMAIL ? '✅ Présent' : '❌ Manquant');
    console.log('  - ADMIN_PASSWORD_HASH:', process.env.ADMIN_PASSWORD_HASH ? '✅ Présent' : '❌ Manquant');
    console.log('  - ADMIN_SESSION_SECRET:', process.env.ADMIN_SESSION_SECRET ? '✅ Présent' : '❌ Manquant');
    console.log('  - NODE_ENV:', process.env.NODE_ENV || 'development');
    
    // Seulement les requêtes POST
    if (req.method !== 'POST') {
        console.log('❌ Méthode non autorisée:', req.method);
        return res.status(405).json({ 
            error: 'Method not allowed',
            message: 'Méthode non autorisée'
        });
    }

    try {
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
        
        console.log('📧 Email reçu:', email || '❌ Manquant');
        console.log('🔑 Mot de passe reçu:', password ? '✅ Présent' : '❌ Manquant');
        
        // Validation basique
        if (!email || !password) {
            console.log('❌ Email ou mot de passe manquant');
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Email et mot de passe requis'
            });
        }
        
        // Récupérer les identifiants admin depuis les variables d'environnement
        const adminEmail = process.env.ADMIN_EMAIL;
        const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
        const sessionSecret = process.env.ADMIN_SESSION_SECRET;
        
        // Validation des variables d'environnement
        if (!adminEmail || !adminPasswordHash || !sessionSecret) {
            console.error('❌ Variables d\'environnement manquantes');
            return res.status(500).json({
                error: 'Configuration Error',
                message: 'Erreur de configuration du serveur'
            });
        }
        
        // Vérifier si c'est l'email admin
        if (email !== adminEmail) {
            console.log('❌ Email incorrect:', email, 'attendu:', adminEmail);
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Identifiants incorrects'
            });
        }
        
        console.log('✅ Email admin vérifié');
        
        // Vérifier le mot de passe avec bcrypt
        const isValidPassword = await bcrypt.compare(password, adminPasswordHash);
        console.log('🔐 Résultat bcrypt.compare:', isValidPassword ? '✅ Valide' : '❌ Invalide');
        
        if (!isValidPassword) {
            console.log('❌ Mot de passe incorrect');
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Identifiants incorrects'
            });
        }
        
        console.log('✅ Mot de passe vérifié');
        
        // Créer le token JWT
        const token = jwt.sign(
            { 
                email: adminEmail,
                role: 'admin',
                loginTime: Date.now()
            },
            sessionSecret,
            { expiresIn: '2h' }
        );
        
        // Définir le cookie HttpOnly
        const cookieValue = cookie.serialize('oradia_admin_session', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/',
            maxAge: 2 * 60 * 60 * 1000 // 2 heures
        });
        
        console.log('✅ Cookie créé, connexion réussie');
        
        // Réponse succès
        res.setHeader('Set-Cookie', cookieValue);
        res.status(200).json({
            success: true,
            message: 'Connexion réussie',
            admin: {
                email: adminEmail,
                role: 'admin'
            }
        });
        
    } catch (error) {
        console.error('❌ Erreur login admin:', error.message);
        console.error('❌ Stack complet:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Erreur serveur lors de la connexion'
        });
    }
}
```

---

## 📦 **DÉPENDANCES REQUISES**

### **package.json (déjà correct)**
```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.38.4",
    "stripe": "^14.9.0",
    "jsonwebtoken": "^9.0.2",
    "bcrypt": "^5.1.1",
    "cookie": "^0.6.0"
  }
}
```

### **Packages utilisés**
- ✅ `bcrypt` (pas `bcryptjs`) - cohérent avec package.json
- ✅ `jsonwebtoken` - token JWT
- ✅ `cookie` - gestion cookies Vercel

---

## 📊 **LOGS À SURVEILLER DANS VERCEL**

### **Logs de diagnostic attendus**
```
🔐 LOGIN ADMIN - DIAGNOSTIC
  - ADMIN_EMAIL: ✅ Présent
  - ADMIN_PASSWORD_HASH: ✅ Présent
  - ADMIN_SESSION_SECRET: ✅ Présent
  - NODE_ENV: production
📧 Email reçu: contact@oradia.fr
🔑 Mot de passe reçu: ✅ Présent
✅ Email admin vérifié
🔐 Résultat bcrypt.compare: ✅ Valide
✅ Mot de passe vérifié
✅ Cookie créé, connexion réussie
```

### **Logs d'erreur possibles**
```
❌ ADMIN_EMAIL: ❌ Manquant
❌ Email incorrect: test@test.com attendu: contact@oradia.fr
❌ Résultat bcrypt.compare: ❌ Invalide
❌ Erreur parsing body: Unexpected token
```

---

## 🚀 **ACTION EXACTE POUR RETESTER**

### **1. Déploiement requis**
OUI - **Redéploiement obligatoire** après modification du code.

```bash
git add api/admin/login.js
git commit -m "fix: add diagnostic logs to admin login"
git push origin main
```

### **2. Vérifier variables Vercel**
Dans **Vercel Dashboard → Settings → Environment Variables** :
- ✅ `ADMIN_EMAIL=contact@oradia.fr`
- ✅ `ADMIN_PASSWORD_HASH=[hash bcrypt de Oradia2025!]`
- ✅ `ADMIN_SESSION_SECRET=[clé 32+ caractères]`

### **3. Test immédiat**
1. **Attendre déploiement** (1-2 minutes)
2. **Aller sur** : `https://oradia.fr/admin/login.html`
3. **Saisir** :
   - Email : `contact@oradia.fr`
   - Mot de passe : `Oradia2025!`
4. **Vérifier les logs** dans Vercel Dashboard

### **4. Logs à vérifier**
Dans **Vercel Dashboard → Functions → Logs** :
- Chercher `LOGIN ADMIN - DIAGNOSTIC`
- Vérifier chaque étape du diagnostic

---

## 🎯 **DIAGNOSTIC RAPIDE**

### **Si logs montrent** :
- `ADMIN_EMAIL: ❌ Manquant` → Configurer variable Vercel
- `Email reçu: ❌ Manquant` → Problème frontend
- `bcrypt.compare: ❌ Invalide` → Hash incorrect
- `Cookie créé, connexion réussie` → Succès !

### **Hash bcrypt pour vérification**
```bash
# Générer hash pour "Oradia2025!"
node -e "const bcrypt = require('bcrypt'); bcrypt.hash('Oradia2025!', 12).then(console.log)"
```

---

## ✅ **RÉSULTAT ATTENDU**

**Après déploiement et test :**
- ✅ Logs complets dans Vercel
- ✅ Connexion réussie
- ✅ Cookie `oradia_admin_session` posé
- ✅ Redirection vers dashboard admin

**Prêt pour déploiement et test immédiat !**
