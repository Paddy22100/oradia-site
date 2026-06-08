# 📋 Documentation Tables Supabase ORADIA

## 🗄️ **Vue d'Ensemble**

Vous avez plusieurs tables dans Supabase. Voici ce que chacune fait et si elles sont encore utiles.

---

## ✅ **Tables Actives et Utiles**

### **1. `users`**
- **Purpose** : Utilisateurs du système (authentification)
- **Usage** : Webhook Stripe, gestion des comptes
- **Statut** : ✅ **Actif - Garder**
- **Champs clés** : id, email, full_name, created_at

### **2. `credits`**
- **Purpose** : Crédits Traversée (5 tirages pour 3€)
- **Usage** : Suivi des achats de crédits
- **Statut** : ✅ **Actif - Garder**
- **Champs clés** : user_id, credits, total_purchased, purchase_history

### **3. `subscriptions`**
- **Purpose** : Abonnements Tore (8€/mois)
- **Usage** : Gestion des abonnements mensuels
- **Statut** : ✅ **Actif - Garder**
- **Champs clés** : user_id, stripe_subscription_id, status, access_code

### **4. `preorders`**
- **Purpose** : Précommandes Oracle physique
- **Usage** : Commandes d'Oracle physique avec livraison
- **Statut** : ✅ **Actif - Garder**
- **Champs clés** : email, offer, shipping_address, relay_id

### **5. `donors`**
- **Purpose** : Dons et contributions libres
- **Usage** : Soutiens financiers (contribution-libre)
- **Statut** : ✅ **Actif - Garder**
- **Champs clés** : email, amount_total, offer, email_sent_at

### **6. `tore_subscriptions`**
- **Purpose** : Abonnements Tore (ancienne version)
- **Usage** : Alternative à `subscriptions`
- **Statut** : ⚠️ **Dupliqué - Voir ci-dessous**

### **7. `newsletter_contacts`**
- **Purpose** : Contacts newsletter
- **Usage** : Marketing email
- **Statut** : ✅ **Actif - Garder**
- **Champs clés** : email, status, subscribed_at

---

## ❓ **Tables à Clarifier**

### **8. `newsletter_drafts`**
- **Purpose** : Brouillons newsletter
- **Usage** : Édition des emails marketing
- **Statut** : ⚠️ **À vérifier - Utilisé ?**
- **Question** : Est-ce que vous utilisez un système de newsletter ?

### **9. `newsletter_ideas`**
- **Purpose** : Idées pour newsletter
- **Usage** : Brainstorming contenu
- **Statut** : ⚠️ **À vérifier - Utilisé ?**
- **Question** : Utilisé pour planifier les newsletters ?

### **10. `observation_windows`**
- **Purpose** : Fenêtres d'observation
- **Usage** : ???
- **Statut** : ❓ **Inconnu - À investiguer**
- **Question** : Peut-être lié aux tirages ou à un ancien système ?

---

## 🔄 **Tables en Double (À Unifier)**

### **`subscriptions` vs `tore_subscriptions`**

Vous avez deux tables pour les abonnements Tore :

#### **`subscriptions` (Nouvelle)**
- ✅ **Recommandée** : Créée dans notre migration
- ✅ **Structure** : user_id, stripe_subscription_id, status, access_code
- ✅ **Usage** : Webhook unifié

#### **`tore_subscriptions` (Ancienne)**
- ⚠️ **À vérifier** : Structure probablement différente
- ⚠️ **Usage** : Webhook séparé `api/stripe-webhook.js`

---

## 🎯 **Recommandations**

### **1. Garder (Actif)**
```sql
users          -- Authentification
credits        -- Crédits Traversée
subscriptions  -- Abonnements Tore (nouveau)
preorders      -- Précommandes Oracle
donors         -- Dons et contributions
newsletter_contacts -- Newsletter
```

### **2. Investiguer**
```sql
newsletter_drafts   -- Utilisé ?
newsletter_ideas     -- Utilisé ?
observation_windows  -- À quoi ça sert ?
```

### **3. Unifier**
```sql
-- Fusionner subscriptions et tore_subscriptions
-- Garder la meilleure structure
```

---

## 🔍 **Actions Suggérées**

### **Étape 1 : Vérifier l'usage**
```sql
-- Compter les enregistrements par table
SELECT COUNT(*) as total FROM newsletter_drafts;
SELECT COUNT(*) as total FROM newsletter_ideas;
SELECT COUNT(*) as total FROM observation_windows;
```

### **Étape 2 : Comparer les abonnements**
```sql
-- Voir la structure des deux tables
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name IN ('subscriptions', 'tore_subscriptions');
```

### **Étape 3 : Décider**
- Si `newsletter_*` sont vides → Supprimer
- Si `observation_windows` est vide → Supprimer
- Unifier `subscriptions` et `tore_subscriptions`

---

## 📊 **État Final Recommandé**

### **Tables Essentielles (6)**
1. `users` - Utilisateurs
2. `credits` - Crédits Traversée
3. `subscriptions` - Abonnements Tore
4. `preorders` - Précommandes
5. `donors` - Dons
6. `newsletter_contacts` - Newsletter

### **Tables Optionnelles (3)**
7. `newsletter_drafts` - Si utilisé
8. `newsletter_ideas` - Si utilisé
9. `observation_windows` - Si utilisé

---

## 🚀 **Prochaines Étapes**

1. **Vérifier** les tables optionnelles
2. **Unifier** les abonnements si nécessaire
3. **Nettoyer** les tables inutiles
4. **Documenter** la structure finale

**Vous voulez que je vérifie la structure exacte de ces tables pour vous aider à décider ?**
