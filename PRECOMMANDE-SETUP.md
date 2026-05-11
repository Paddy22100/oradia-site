# 🚀 Configuration Inscription Précommande - ORADIA

Ce guide explique comment configurer l'inscription à la précommande avec Supabase et Brevo.

---

## 📋 Prérequis

- Compte Supabase (gratuit) : https://supabase.com
- Compte Brevo (gratuit jusqu'à 300 emails/jour) : https://www.brevo.com
- Node.js 16+ installé

---

## 🔧 Étape 1 : Configuration Supabase

### 1.1 Créer un projet Supabase

1. Aller sur https://supabase.com et créer un compte
2. Créer un nouveau projet
3. Choisir un nom, une région et un mot de passe

### 1.2 Créer la base de données

1. Dans votre projet Supabase, aller dans **SQL Editor**
2. Ouvrir le fichier `server/supabase-schema.sql`
3. Copier tout le contenu et le coller dans l'éditeur SQL
4. Cliquer sur **Run** pour exécuter le script

Cela créera :
- Table `precommande_subscribers` pour stocker les inscriptions
- Table `analytics_events` pour le tracking
- Index pour optimiser les performances
- Politiques de sécurité RLS

### 1.3 Récupérer les clés API

1. Aller dans **Settings** > **API**
2. Copier :
   - **Project URL** (ex: `https://xxxxx.supabase.co`)
   - **anon public** key (commence par `eyJ...`)

---

## 📧 Étape 2 : Configuration Brevo

### 2.1 Créer un compte Brevo

1. Aller sur https://www.brevo.com
2. Créer un compte gratuit
3. Vérifier votre email

### 2.2 Configurer SMTP

1. Aller dans **Settings** > **SMTP & API**
2. Cliquer sur **SMTP**
3. Copier les informations :
   - **SMTP server** : `smtp-relay.brevo.com`
   - **Port** : `587`
   - **Login** : votre email Brevo
   - **SMTP key** : Générer une nouvelle clé

### 2.3 Vérifier l'expéditeur

1. Aller dans **Senders** > **Add a sender**
2. Ajouter l'email `contact@oradia.fr` (ou votre domaine)
3. Vérifier l'email via le lien de confirmation

---

## ⚙️ Étape 3 : Configuration du serveur

### 3.1 Créer le fichier .env

Dans le dossier `server/`, créer un fichier `.env` :

```bash
# Configuration ORADIA Server
NODE_ENV=development
PORT=3001

# Base de données MongoDB (existant)
MONGODB_URI=mongodb://localhost:27017/oradia

# Supabase Configuration
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# JWT Configuration (existant)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRE=7d

# Brevo Email Configuration
BREVO_SMTP_HOST=smtp-relay.brevo.com
BREVO_SMTP_PORT=587
BREVO_SMTP_USER=votre-email@brevo.com
BREVO_SMTP_PASS=votre-smtp-key-brevo
EMAIL_FROM=ORADIA <contact@oradia.fr>

# Configuration Cal.com (existant)
CAL_WEBHOOK_SECRET=your-cal-webhook-secret

# Configuration Analytics (existant)
ANALYTICS_ENABLED=true
TRACKING_CONVERSIONS=true

# Rate Limiting (existant)
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX=100

# Upload Configuration (existant)
MAX_FILE_SIZE=5242880
UPLOAD_PATH=./uploads
```

### 3.2 Installer les dépendances

```bash
cd server
npm install
```

Cela installera notamment `@supabase/supabase-js`.

### 3.3 Démarrer le serveur

```bash
npm run dev
```

Le serveur devrait démarrer sur `http://localhost:3001`

---

## 🧪 Étape 4 : Tester l'inscription

### 4.1 Test via le formulaire

1. Ouvrir `precommande-oracle.html` dans un navigateur
2. Faire défiler jusqu'au formulaire d'inscription
3. Entrer un email de test
4. Cliquer sur "Je veux être informé"

### 4.2 Vérifier dans Supabase

1. Aller dans votre projet Supabase
2. Cliquer sur **Table Editor**
3. Sélectionner `precommande_subscribers`
4. Vous devriez voir votre inscription

### 4.3 Vérifier l'email

1. Vérifier votre boîte email
2. Vous devriez recevoir un email de confirmation
3. Si l'email n'arrive pas, vérifier :
   - Les logs du serveur
   - Les paramètres SMTP Brevo
   - Le dossier spam

---

## 📊 Étape 5 : Visualiser les statistiques

### 5.1 Requêtes SQL utiles

Dans Supabase SQL Editor :

```sql
-- Nombre total d'inscrits
SELECT COUNT(*) FROM precommande_subscribers;

-- Derniers inscrits
SELECT email, name, status, subscribed_at 
FROM precommande_subscribers 
ORDER BY subscribed_at DESC 
LIMIT 10;

-- Statistiques par statut
SELECT status, COUNT(*) as count 
FROM precommande_subscribers 
GROUP BY status;

-- Inscrits des 7 derniers jours
SELECT COUNT(*) 
FROM precommande_subscribers 
WHERE subscribed_at >= NOW() - INTERVAL '7 days';
```

### 5.2 API Stats (pour admin)

Endpoint : `GET /api/precommande/stats`

Retourne :
```json
{
  "success": true,
  "stats": {
    "total": 150,
    "confirmed": 145,
    "pending": 5,
    "recent_7_days": 23
  }
}
```

---

## 🚀 Étape 6 : Déploiement en production

### 6.1 Variables d'environnement Vercel

Dans votre projet Vercel :

1. Aller dans **Settings** > **Environment Variables**
2. Ajouter toutes les variables du fichier `.env`
3. Redéployer le projet

### 6.2 Vérifier la configuration

- ✅ SUPABASE_URL configuré
- ✅ SUPABASE_ANON_KEY configuré
- ✅ BREVO_SMTP_HOST configuré
- ✅ BREVO_SMTP_USER configuré
- ✅ BREVO_SMTP_PASS configuré
- ✅ EMAIL_FROM configuré

---

## 📧 Personnalisation des emails

Les templates d'emails sont dans `server/services/brevoService.js` :

- `generatePrecommandeConfirmationHTML()` : Email de confirmation
- `generateLaunchNotificationHTML()` : Email de lancement

Vous pouvez modifier :
- Le design (couleurs, structure)
- Les textes
- Les liens
- Les images

---

## 🔒 Sécurité

### Protections implémentées

- ✅ Rate limiting : 10 inscriptions max par heure par IP
- ✅ Validation email stricte
- ✅ Sanitization des entrées
- ✅ Protection CSRF
- ✅ Headers de sécurité
- ✅ RLS Supabase activé

### Bonnes pratiques

- Ne jamais exposer `SUPABASE_ANON_KEY` côté client (déjà géré)
- Utiliser HTTPS en production
- Surveiller les logs Supabase
- Activer les alertes Brevo

---

## 🐛 Dépannage

### Erreur : "SUPABASE_URL manquant"

- Vérifier que le fichier `.env` existe dans `server/`
- Vérifier que les variables sont bien définies
- Redémarrer le serveur

### Erreur : "Email non envoyé"

- Vérifier les credentials Brevo dans `.env`
- Vérifier que l'expéditeur est vérifié dans Brevo
- Vérifier les logs du serveur
- Tester la connexion SMTP

### Erreur : "Inscription déjà existante"

- C'est normal, l'email est déjà inscrit
- L'API retourne `alreadySubscribed: true`

### Base de données vide

- Vérifier que le script SQL a bien été exécuté
- Vérifier les politiques RLS dans Supabase
- Vérifier les logs du serveur

---

## 📞 Support

Pour toute question :
- Documentation Supabase : https://supabase.com/docs
- Documentation Brevo : https://developers.brevo.com
- Support ORADIA : contact@oradia.fr

---

## ✅ Checklist finale

- [ ] Projet Supabase créé
- [ ] Script SQL exécuté
- [ ] Clés Supabase récupérées
- [ ] Compte Brevo créé
- [ ] SMTP Brevo configuré
- [ ] Expéditeur vérifié
- [ ] Fichier `.env` créé
- [ ] Dépendances installées
- [ ] Serveur démarré
- [ ] Test d'inscription effectué
- [ ] Email de confirmation reçu
- [ ] Variables Vercel configurées (si déploiement)

**Félicitations ! L'inscription à la précommande est maintenant opérationnelle ! 🎉**
