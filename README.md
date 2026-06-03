# 🌟 ORADIA - La Boussole Intérieure

## Robots.txt pour ORADIA - La Boussole Intérieureatoire moderne qui puise dans la sagesse des cartes pour offrir guidance et introspection. Conçu comme un pont entre la tradition des oracles et nos quêtes contemporaines de sens.

### 🎯 Mission

* « L'oracle ne dicte pas votre avenir, il illumine votre présent. La véritable magie réside dans votre capacité à écouter votre propre sagesse. »

## 🏗️ Architecture Technique

### 📁 Structure du Projet

```
oradia-site-Travail/
├── 📄 Pages principales
│   ├── index.html              # Page d'accueil avec offres
│   ├── oracle.html             # Présentation des 3 voies
│   ├── pelerin.html             # Tirage gratuit (4 cartes)
│   ├── traversee.html          # Tirage guidé (5 cartes)
│   └── tore.html                # Abonnement premium
├── 🔐 Administration
│   ├── admin/login.html         # Login admin sécurisé
│   └── member/dashboard.html    # Dashboard protégé
├── 📜 Pages légales
│   ├── cgv.html                 # Conditions Générales de Vente
│   ├── cgu.html                 # Conditions Générales d'Utilisation
│   ├── mentions-legales.html    # Mentions légales
│   └── politique-confidentialite.html # RGPD
├── 💳 Paiements & Commerce
│   ├── precommande-oracle.html  # Précommande oracle physique
│   ├── success-traversee.html   # Page succès paiement
│   └── success-tore.html        # Page succès abonnement
├── 🎨 Assets
│   ├── images/                  # Images et logos
│   ├── style.css                # Styles personnalisés
│   └── responsive.css           # Styles responsive
├── ⚙️ Backend (Node.js)
│   ├── server/
│   │   ├── app.js              # Serveur principal
│   │   ├── models/             # Modèles de données
│   │   ├── routes/             # Routes API
│   │   ├── services/           # Services métier
│   │   └── middleware/         # Middlewares
│   └── freemium.js            # Logique freemium client
└── 🔧 Configuration
    ├── vercel.json             # Configuration Vercel
    └── .env.vercel             # Variables environnement
```

### 🛠️ Technologies Utilisées

#### Frontend
- **HTML5** - Sémantique et accessibilité
- **Tailwind CSS** - Design system moderne
- **JavaScript Vanilla** - Logique client
- **Font Awesome** - Icônes vectorielles

#### Backend
- **Node.js** - Runtime serveur
- **Express.js** - Framework web
- **MongoDB** - Base de données NoSQL
- **Stripe** - Paiements sécurisés

#### Déploiement
- **Vercel** - Hébergement serverless
- **CORS** - Partage de ressources
- **HTTPS** - Connexion sécurisée

## 💎 Fonctionnalités Principales

### 🔮 Trois Voies Oracle

1. **Le Pèlerin** - Gratuit
   - 4 cartes : Émotion, Besoin, Transmutation, Mémoire Cosmos
   - Accès immédiat sans inscription
   - Interprétation synthétique

2. **La Traversée** - 3€
   - 5 cartes guidées avec Révélation
   - Synthèse personnalisée
   - Mantra personnel
   - 5 tirages inclus

3. **Le Tore** - 8€/mois
   - Tirages illimités
   - Interprétation complète
   - Historique et analyse
   - Fonctionnalités avancées
   - Mantra quotidien

### 🔐 Sécurité

- **Authentification** admin avec sessionStorage
- **Protection anti-abus** multi-couches
- **Rate limiting** différencié
- **Validation et sanitization** des entrées
- **Headers HTTP sécurisés** (CSP, HSTS, etc.)

### 💰 Commerce Électronique

- **Paiements Stripe** intégrés et sécurisés
- **Webhooks** pour synchronisation
- **Abonnements** et paiements ponctuels
- **Conformité RGPD** complète
- **Pages légales** à jour

## 🚀 Installation et Déploiement

### 📋 Prérequis

- Node.js 18+
- MongoDB Atlas
- Compte Stripe
- Compte Vercel

### ⚙️ Configuration

1. **Variables environnement** :
```bash
# Stripe
STRIPE_SECRET_KEY=sk_live_*
STRIPE_PUBLISHABLE_KEY=pk_live_*
STRIPE_WEBHOOK_SECRET=whsec_*

# Base de données
MONGODB_URI=mongodb+srv://*

# Sécurité
JWT_SECRET=minimum-32-caracteres
NODE_ENV=production
```

2. **Configuration Stripe** :
- Créer les produits et prix
- Configurer les webhooks
- Tester l'intégration

### 🚀 Déploiement Vercel

```bash
# Installer les dépendances
npm install

# Déployer sur Vercel
vercel --prod
```

## 📱 Responsive Design

- **Mobile First** - 320px et plus
- **Tablette** - 768px et plus
- **Desktop** - 1024px et plus
- **Touch targets** - 44px minimum
- **Accessibilité** - WCAG 2.1 AA

## 🎨 Univers Visuel

### 🎨 Palette de Couleurs
- **Night Blue** - `#0a192f` (fond principal)
- **Dark Blue** - `#051428` (contraste)
- **Gold** - `#d4af37` (accent primaire)
- **Light Gold** - `#f5e7a1` (accent secondaire)
- **Celtic Blue** - `#1a365d` (variation)

### 📝 Typographie
- **Cormorant Garamond** - Titres et citations
- **Poppins** - Textes et interfaces
- **Font Awesome** - Icônes vectorielles

## 🔧 Maintenance

### 📊 Monitoring

- **Logs Vercel** pour erreurs
- **Analytics Stripe** pour paiements
- **Monitoring MongoDB** pour performance

### 🔄 Mises à jour

1. **Contenu** : Textes et images
2. **Prix** : Via configuration Stripe
3. **Fonctionnalités** : Via déploiement Vercel
4. **Sécurité** : Mises à jour régulières

## 📞 Support

- **Email** : Oradia@protonmail.com
- **Instagram** : @oradia_oracle
- **Site web** : https://oradia.fr

## 📄 Licence

© 2026 ORADIA - Tous droits réservés

---

**Créé avec ❤️ par Rudy Boucheron**  
*17 Cardevily - 22100 TRÉVRON*
