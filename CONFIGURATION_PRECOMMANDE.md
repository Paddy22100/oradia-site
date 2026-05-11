# Configuration du système d'inscription précommande

## 📋 Vue d'ensemble

Le système d'inscription pour les précommandes est maintenant en place. Voici ce qu'il fait :

1. **Collecte les emails** des personnes intéressées
2. **Stocke les données** dans Supabase
3. **Envoie un email de confirmation** via Brevo
4. **Affiche un message de succès** sur le site

---

## 🗄️ Configuration Supabase

### Table à créer : `precommande_waitlist`

Vous devez créer cette table dans votre base de données Supabase :

```sql
CREATE TABLE precommande_waitlist (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  source TEXT DEFAULT 'precommande-oracle',
  status TEXT DEFAULT 'active',
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour recherche rapide par email
CREATE INDEX idx_precommande_waitlist_email ON precommande_waitlist(email);

-- Index pour filtrer par statut
CREATE INDEX idx_precommande_waitlist_status ON precommande_waitlist(status);
```

### Variables d'environnement Supabase

Dans votre fichier `.env.local`, ajoutez :

```env
SUPABASE_URL=https://votre-projet.supabase.co
SUPABASE_SERVICE_ROLE_KEY=votre-service-role-key
```

**Où trouver ces valeurs :**
1. Connectez-vous à [supabase.com](https://supabase.com)
2. Sélectionnez votre projet
3. Allez dans **Settings** > **API**
4. Copiez l'**URL** et la **service_role key** (pas l'anon key !)

---

## 📧 Configuration Brevo (envoi d'emails)

### Variables d'environnement Brevo

Dans votre fichier `.env.local`, ajoutez :

```env
BREVO_API_KEY=votre-api-key-brevo
BREVO_SENDER_EMAIL=contact@oradia.fr
BREVO_SENDER_NAME=ORADIA
```

### Comment obtenir une clé API Brevo

1. Créez un compte sur [brevo.com](https://www.brevo.com) (anciennement Sendinblue)
2. Allez dans **Settings** > **SMTP & API** > **API Keys**
3. Créez une nouvelle clé API
4. Copiez la clé et ajoutez-la dans `.env.local`

### Configuration de l'expéditeur

1. Dans Brevo, allez dans **Senders & IP**
2. Ajoutez et vérifiez votre email `contact@oradia.fr`
3. Suivez les instructions pour vérifier le domaine

---

## 🎯 Fonctionnement du système

### Flux utilisateur

1. L'utilisateur entre son email dans le formulaire
2. Clic sur "Je veux être informé"
3. Le système :
   - Vérifie que l'email est valide
   - Enregistre l'email dans Supabase (table `precommande_waitlist`)
   - Envoie un email de confirmation via Brevo
   - Affiche un message de succès sur le site

### Messages affichés

**Si l'inscription réussit :**
```
✓ Inscription confirmée ! Vous serez informé par email dès l'ouverture des précommandes. 
Un email de confirmation vient de vous être envoyé.
```

**Si déjà inscrit :**
```
✓ Vous êtes déjà inscrit ! Vous serez informé par email dès l'ouverture des précommandes.
```

**Si l'email n'a pas pu être envoyé :**
```
✓ Inscription confirmée ! Vous serez informé par email dès l'ouverture des précommandes. 
L'email de confirmation sera envoyé prochainement.
```

---

## 📊 Consulter les inscriptions

### Dans Supabase

1. Allez dans **Table Editor**
2. Sélectionnez la table `precommande_waitlist`
3. Vous verrez tous les emails inscrits avec :
   - Email
   - Date d'inscription
   - Source (page d'origine)
   - Statut
   - Métadonnées (user agent, etc.)

### Exporter les données

Pour exporter la liste des emails :

```sql
SELECT 
  email, 
  created_at,
  source,
  status
FROM precommande_waitlist
WHERE status = 'active'
ORDER BY created_at DESC;
```

---

## 🔧 Fichiers créés/modifiés

### Nouveau fichier API
- `api/precommande/subscribe.js` - Endpoint pour gérer les inscriptions

### Fichier modifié
- `precommande-oracle.html` - Messages de succès améliorés

---

## ✅ Checklist de déploiement

Avant de mettre en production :

- [ ] Créer la table `precommande_waitlist` dans Supabase
- [ ] Configurer les variables d'environnement dans Vercel/votre hébergeur
- [ ] Créer un compte Brevo et obtenir une API key
- [ ] Vérifier l'email expéditeur dans Brevo
- [ ] Tester l'inscription avec un email de test
- [ ] Vérifier que l'email de confirmation arrive bien
- [ ] Vérifier que les données apparaissent dans Supabase

---

## 🐛 Dépannage

### L'email ne s'envoie pas

1. Vérifiez que `BREVO_API_KEY` est correctement configurée
2. Vérifiez que l'email expéditeur est vérifié dans Brevo
3. Consultez les logs de l'API pour voir les erreurs

### Les données ne s'enregistrent pas dans Supabase

1. Vérifiez que la table `precommande_waitlist` existe
2. Vérifiez que `SUPABASE_SERVICE_ROLE_KEY` est correctement configurée
3. Vérifiez les permissions de la table (RLS)

### Message d'erreur "Le serveur n'est pas disponible"

Cela signifie que l'API n'est pas encore déployée ou que les variables d'environnement ne sont pas configurées.

---

## 📝 Notes importantes

- Les emails sont stockés en **minuscules** pour éviter les doublons
- Le système détecte automatiquement si un email est déjà inscrit
- L'email de confirmation est envoyé même si la personne est déjà inscrite
- Les métadonnées incluent la date d'inscription et le user agent pour analyse

---

## 🎨 Personnalisation de l'email

Pour modifier le contenu de l'email de confirmation, éditez le fichier :
`api/precommande/subscribe.js` à la ligne 94 (section `htmlContent`)

L'email actuel contient :
- Logo ORADIA
- Message de confirmation
- Liste de ce que la personne recevra
- Signature de l'équipe
