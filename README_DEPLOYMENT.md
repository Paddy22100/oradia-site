# 🚀 ORADIA Dashboard - Guide de Déploiement

## 📋 Prérequis

### Système
- **Node.js** 16+ (recommandé 18+)
- **MongoDB** 5.0+
- **Git**

### Outils
- **Navigateur moderne** (Chrome, Firefox, Safari, Edge)
- **Terminal** / **Invite de commandes**

---

## 🛠️ Installation

### 1. Cloner le projet
```bash
git clone <repository-url>
cd oradia-site
```

### 2. Installer les dépendances backend
```bash
cd server
npm install
```

### 3. Configurer les variables d'environnement
```bash
# Copier le fichier d'exemple
cp .env.example .env

# Éditer le fichier .env avec vos configurations
nano .env
```

**Variables obligatoires :**
```env
NODE_ENV=development
PORT=3001
MONGODB_URI=mongodb://localhost:27017/oradia
JWT_SECRET=votre-secret-super-securise-ici
```

**Variables recommandées :**
```env
SMTP_HOST=smtp-relay.brevo.com
SMTP_USER=votre-email@domain.com
SMTP_PASS=votre-mot-de-passe-smtp
EMAIL_FROM=ORADIA <contact@oradia.com>
```

### 4. Démarrer MongoDB
```bash
# Avec Docker (recommandé)
docker run -d -p 27017:27017 --name mongodb mongo:latest

# Ou installation locale
# Suivre la documentation officielle MongoDB
```

### 5. Initialiser la base de données
```bash
# Exécuter le script de seed
npm run seed
```

---

## 🚀 Démarrage

### Mode Développement
```bash
# Démarrer le serveur backend
cd server
npm run dev

# Le serveur démarre sur http://localhost:3001
```

### Mode Production
```bash
# Démarrer le serveur en production
cd server
npm start
```

---

## 🌐 Accès aux Applications

### Dashboard Admin
- **URL** : http://localhost:3001/admin/dashboard
- **Login** : Oradia@protonmail.com
- **Password** : RafalE12#12

### Espace Client
- **URL** : http://localhost:3001/user/dashboard
- **Login** : user1@test.com à user20@test.com
- **Password** : password123

### Page de Connexion
- **URL** : http://localhost:3001/auth/login

### Site Original
- **URL** : http://localhost:3001 (redirige vers index.html)

---

## 📊 Fonctionnalités Implémentées

### ✅ Backend API
- **Authentification** JWT sécurisée
- **Gestion utilisateurs** avec rôles
- **CRUD Tirages** complet
- **System Feedbacks** avancé
- **Newsletter** avec segmentation
- **Analytics** et statistiques
- **Export CSV** utilisateurs

### ✅ Dashboard Admin
- **Vue d'ensemble** avec KPIs
- **Gestion utilisateurs** (filtrage, recherche)
- **Statistiques avancées** avec graphiques
- **Feedbacks** et modération
- **Newsletter** et campagnes
- **Export** des données

### ✅ Espace Client
- **Profil** modifiable
- **Historique tirages** détaillé
- **Feedbacks** personnalisés
- **Statistiques** personnelles
- **Préférences** et consentements

### ✅ Base de Données
- **Modèles** optimisés avec indexes
- **Relations** entre collections
- **Validation** des données
- **Soft delete** implémenté

---

## 🔧 Configuration Avancée

### MongoDB Atlas (Cloud)
```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/oradia?retryWrites=true&w=majority
```

### Email Service (Brevo)
```env
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=votre-email@brevo.com
SMTP_PASS=votre-cle-api-brevo
```

### Sécurité Production
```env
NODE_ENV=production
JWT_EXPIRE=7d
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX=100
```

---

## 📱 Structure des Fichiers

```
oradia-site/
├── server/                    # Backend Node.js
│   ├── models/                # Modèles MongoDB
│   ├── routes/                # Routes API
│   ├── middleware/            # Middlewares
│   ├── scripts/               # Scripts utilitaires
│   ├── config/                # Configuration
│   └── app.js                 # Point d'entrée
├── admin/                     # Dashboard Admin
│   └── dashboard.html         # Interface admin
├── user/                      # Espace Client
│   └── dashboard.html         # Interface client
├── auth/                      # Authentification
│   └── login.html             # Page de connexion
├── *.html                     # Pages originales
├── style.css                  # Styles globaux
└── README_DEPLOYMENT.md       # Ce fichier
```

---

## 🔍 Débogage

### Logs du serveur
```bash
# Voir les logs en temps réel
npm run dev

# Logs production
pm2 logs oradia-server
```

### Base de données
```bash
# Connecter à MongoDB
mongosh mongodb://localhost:27017/oradia

# Vérifier les collections
show collections
db.users.find().limit(5)
```

### API Testing
```bash
# Test login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"Oradia@protonmail.com","password":"RafalE12#12"}'

# Test dashboard
curl -X GET http://localhost:3001/api/admin/dashboard \
  -H "Authorization: Bearer VOTRE_TOKEN"
```

---

## 🚨 Erreurs Communes

### "MongoDB connection failed"
```bash
# Vérifier que MongoDB est démarré
docker ps | grep mongodb

# Vérifier l'URI dans .env
echo $MONGODB_URI
```

### "JWT token invalid"
```bash
# Se reconnecter pour obtenir un nouveau token
# Vérifier JWT_SECRET dans .env
```

### "Port already in use"
```bash
# Tuer le processus sur le port 3001
lsof -ti:3001 | xargs kill -9

# Ou changer le port dans .env
PORT=3002
```

---

## 📈 Monitoring

### Health Check
```bash
# Vérifier si le serveur répond
curl http://localhost:3001/api/auth/me
```

### Performance
```bash
# Installer PM2 pour production
npm install -g pm2

# Démarrer avec PM2
pm2 start server/app.js --name oradia-server

# Monitorer
pm2 monit
```

---

## 🔐 Sécurité

### En Production
1. **Changer** les mots de passe par défaut
2. **Utiliser** des variables d'environnement fortes
3. **Activer** HTTPS avec SSL/TLS
4. **Configurer** le firewall
5. **Sauvegarder** régulièrement la base de données

### Recommandations
- **Mots de passe** : 12+ caractères, symboles inclus
- **JWT Secret** : 256+ bits aléatoires
- **MongoDB** : Authentification activée
- **Rate Limiting** : Configuré et testé

---

## 📞 Support

### Documentation
- **API Docs** : http://localhost:3001/api-docs (si disponible)
- **Code Source** : Commentaires dans les fichiers
- **Issues** : GitHub Issues

### Contacts
- **Développeur** : [votre-email]
- **Support** : [support-email]

---

## 🔄 Mises à Jour

### Mise à jour des dépendances
```bash
cd server
npm update
npm audit fix
```

### Migration base de données
```bash
# Sauvegarder avant migration
mongodump --db oradia --out backup/

# Exécuter les scripts de migration
npm run migrate
```

---

## 🎯 Prochaines Étapes

1. **Configuration** production avec MongoDB Atlas
2. **Intégration** service emailing (Brevo/SendGrid)
3. **Déploiement** sur serveur (Heroku/DigitalOcean)
4. **Monitoring** avancé (Sentry/New Relic)
5. **Tests** automatisés (Jest/Cypress)

---

## ✅ Checklist Déploiement

- [ ] Node.js 16+ installé
- [ ] MongoDB configuré
- [ ] Variables d'environnement configurées
- [ ] Base de données initialisée
- [ ] Serveur démarré
- [ ] Dashboard admin accessible
- [ ] Espace client fonctionnel
- [ **Succès** ! 🎉

---

**Félicitations ! Votre dashboard ORADIA est maintenant opérationnel !**
