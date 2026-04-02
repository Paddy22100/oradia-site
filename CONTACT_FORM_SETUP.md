# 📧 Configuration Formulaire de Contact ORADIA

## ✅ Implémentation Complète

Le formulaire de contact est maintenant fonctionnel avec envoi d'email via Brevo (SendinBlue).

---

## 📁 Fichiers Créés/Modifiés

### **Nouveaux Fichiers**
1. **`/api/contact.js`** - Route API serverless pour l'envoi d'emails

### **Fichiers Modifiés**
1. **`contact.html`** - Script d'envoi AJAX avec feedback utilisateur

---

## 🔧 Variables d'Environnement Requises

Configurer ces variables dans le dashboard Vercel (Settings → Environment Variables) :

### **1. BREVO_API_KEY** (Obligatoire)
- **Description** : Clé API Brevo pour l'envoi d'emails transactionnels
- **Obtention** : 
  1. Créer un compte sur [Brevo](https://www.brevo.com/)
  2. Aller dans Settings → SMTP & API → API Keys
  3. Créer une nouvelle clé API
- **Format** : `xkeysib-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
- **Exemple** : `xkeysib-1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t1u2v3w4x5y6z`

### **2. CONTACT_TO_EMAIL** (Recommandé)
- **Description** : Email destinataire des messages de contact
- **Valeur par défaut** : `oradia@protonmail.com`
- **Format** : Adresse email valide
- **Exemple** : `oradia@protonmail.com`

### **3. CONTACT_FROM_EMAIL** (Recommandé)
- **Description** : Email expéditeur (doit être vérifié dans Brevo)
- **Valeur par défaut** : `contact@oradia.fr`
- **Format** : Adresse email valide et vérifiée dans Brevo
- **Exemple** : `contact@oradia.fr`
- **⚠️ Important** : Cette adresse doit être vérifiée dans votre compte Brevo

---

## 🚀 Configuration Brevo

### **Étape 1 : Créer un compte Brevo**
1. Aller sur [https://www.brevo.com/](https://www.brevo.com/)
2. Créer un compte gratuit (300 emails/jour gratuits)
3. Confirmer votre email

### **Étape 2 : Obtenir la clé API**
1. Connectez-vous à Brevo
2. Allez dans **Settings** (Paramètres)
3. Cliquez sur **SMTP & API**
4. Cliquez sur **API Keys**
5. Cliquez sur **Create a new API key**
6. Donnez un nom (ex: "ORADIA Contact Form")
7. Copiez la clé générée

### **Étape 3 : Vérifier l'email expéditeur**
1. Dans Brevo, allez dans **Senders & IP**
2. Cliquez sur **Senders**
3. Ajoutez `contact@oradia.fr` (ou votre domaine)
4. Suivez le processus de vérification DNS
5. Attendez la validation (quelques heures max)

**Alternative** : Utilisez l'email par défaut fourni par Brevo si vous n'avez pas de domaine personnalisé.

---

## 🔐 Configuration Vercel

### **Ajouter les variables d'environnement**

1. Allez sur [vercel.com](https://vercel.com/)
2. Sélectionnez votre projet ORADIA
3. Allez dans **Settings** → **Environment Variables**
4. Ajoutez les 3 variables :

```
BREVO_API_KEY=xkeysib-votre-cle-api-brevo
CONTACT_TO_EMAIL=oradia@protonmail.com
CONTACT_FROM_EMAIL=contact@oradia.fr
```

5. Sélectionnez les environnements : **Production**, **Preview**, **Development**
6. Cliquez sur **Save**
7. Redéployez votre application

---

## 🧪 Tests en Local

### **1. Créer un fichier `.env` à la racine**

```bash
BREVO_API_KEY=xkeysib-votre-cle-api-brevo
CONTACT_TO_EMAIL=oradia@protonmail.com
CONTACT_FROM_EMAIL=contact@oradia.fr
```

### **2. Installer Vercel CLI (si pas déjà fait)**

```bash
npm install -g vercel
```

### **3. Lancer le serveur de développement**

```bash
vercel dev
```

### **4. Tester le formulaire**

1. Ouvrez `http://localhost:3000/contact.html`
2. Remplissez le formulaire
3. Cliquez sur "Envoyer le message"
4. Vérifiez :
   - Message de succès affiché
   - Email reçu sur `oradia@protonmail.com`

---

## 📊 Fonctionnalités Implémentées

### **Frontend (`contact.html`)**
- ✅ Formulaire avec champs : nom, email, sujet, message
- ✅ Validation HTML5 native
- ✅ Envoi AJAX vers `/api/contact`
- ✅ États du bouton :
  - Normal : "Envoyer le message"
  - Envoi : "Envoi en cours..." (désactivé + spinner)
  - Succès : Message doré avec icône check
  - Erreur : Message rouge avec icône erreur
- ✅ Reset automatique du formulaire après succès
- ✅ Design cohérent avec l'univers ORADIA

### **Backend (`/api/contact.js`)**
- ✅ Accepte uniquement POST
- ✅ Validation des champs obligatoires
- ✅ Validation format email
- ✅ Validation longueur (nom max 100, message max 5000)
- ✅ Trim automatique des valeurs
- ✅ Envoi via API Brevo
- ✅ Email HTML formaté avec style ORADIA
- ✅ Email texte brut en fallback
- ✅ Reply-To configuré sur l'email de l'utilisateur
- ✅ Gestion d'erreurs complète
- ✅ Réponses JSON propres

---

## 📧 Format de l'Email Envoyé

### **Sujet**
```
[ORADIA Contact] {sujet choisi par l'utilisateur}
```

### **Contenu HTML**
- En-tête avec titre doré
- Bloc d'informations (nom, email, sujet)
- Message de l'utilisateur
- Footer avec mention du formulaire

### **Reply-To**
L'email de réponse est automatiquement configuré sur l'adresse email fournie par l'utilisateur.

---

## 🛡️ Sécurité

### **Validations Côté Serveur**
- ✅ Méthode POST uniquement
- ✅ Champs obligatoires vérifiés
- ✅ Format email validé (regex)
- ✅ Longueur maximale des champs
- ✅ Trim des espaces
- ✅ Pas d'exposition de clé API côté client

### **Protection Anti-Spam (Future)**
- Possibilité d'ajouter :
  - Rate limiting par IP
  - CAPTCHA (reCAPTCHA v3)
  - Honeypot field
  - Vérification du referer

---

## ✅ Vérifications Effectuées

### **Ce qui N'A PAS été touché**
- ✅ Stripe (aucune modification)
- ✅ Supabase (aucune modification)
- ✅ `/api/create-checkout-session` (intact)
- ✅ `/api/preorders/progress` (intact)
- ✅ CMP / TarteAuCitron (intact)
- ✅ Header global (intact)
- ✅ Footer global (intact)
- ✅ Design ORADIA (préservé)

### **Ce qui A été créé/modifié**
- ✅ `/api/contact.js` (nouveau)
- ✅ `contact.html` (script modifié uniquement)

---

## 🎯 Résultat Final

Le formulaire de contact est maintenant **100% fonctionnel** avec :

- ✅ Envoi d'email réel via Brevo
- ✅ Feedback utilisateur en temps réel
- ✅ Validation complète des données
- ✅ Sécurité côté serveur
- ✅ Design cohérent avec ORADIA
- ✅ Aucun impact sur les autres fonctionnalités

---

## 📞 Support

En cas de problème :

1. Vérifier que les variables d'environnement sont bien configurées dans Vercel
2. Vérifier que l'email expéditeur est vérifié dans Brevo
3. Consulter les logs Vercel : Dashboard → Deployments → Functions
4. Tester en local avec `vercel dev`

---

## 🔮 Améliorations Futures Possibles

- [ ] Ajouter un CAPTCHA (reCAPTCHA v3)
- [ ] Implémenter un rate limiting par IP
- [ ] Ajouter un honeypot field anti-spam
- [ ] Envoyer un email de confirmation à l'utilisateur
- [ ] Logger les messages dans une base de données
- [ ] Ajouter des templates d'email personnalisés par sujet
