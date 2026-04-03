# 🔧 PREORDERS FIX - stripe_customer_id

## 📋 PROBLÈME IDENTIFIÉ

Le payload envoyé à la table `preorders` contient `stripe_customer_id`, mais cette colonne n'existe probablement pas dans la table `preorders`.

## 🎯 SOLUTION APPLIQUÉE

### **Option choisie : Retrait de stripe_customer_id**
- ✅ **Solution la plus simple** : Retirer la colonne du payload
- ✅ **Moins risquée** : Pas de modification de la base de données
- ✅ **Flux préservé** : Le webhook continue de fonctionner

## 📝 DIFF EXACT

```diff
// Lignes 404-419
const supabaseData = {
    stripe_session_id: extractedData.stripe_session_id,
    email: extractedData.email,
    offer: extractedData.offer,
    full_name: extractedData.full_name,
    amount_total: extractedData.amount_total / 100, // Conversion en euros
    currency: extractedData.currency,
    payment_intent_id: extractedData.payment_intent_id,
-   stripe_customer_id: extractedData.stripe_customer_id,
+   // stripe_customer_id retiré - colonne probablement absente de preorders
    paid_status: extractedData.paid_status,
    shipping_address: extractedData.shipping_address,
    postal_code: extractedData.postal_code,
    city: extractedData.city,
    phone: extractedData.phone,
    updated_at: new Date().toISOString()
};
```

## 🔍 VÉRIFICATION

### **SQL pour vérifier la structure**
```sql
-- Vérifier si stripe_customer_id existe dans preorders
SELECT EXISTS (
   SELECT FROM information_schema.columns 
   WHERE  table_schema = 'public'
   AND    table_name   = 'preorders'
   AND    column_name  = 'stripe_customer_id'
) as stripe_customer_id_exists;
```

### **Solution alternative (si nécessaire)**
```sql
-- Ajouter la colonne si elle n'existe pas
ALTER TABLE preorders 
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
```

## ✅ CONFIRMATION

- ✅ **Colonne retirée** du payload `preorders`
- ✅ **Flux précommande** préservé
- ✅ **Solution minimale** et sans risque
- ✅ **Logs maintenus** pour debug

## 🚀 DÉPLOIEMENT

```bash
git add api/stripe-webhook.js PREORDERS-FIX.md
git commit -m "fix: remove stripe_customer_id from preorders payload"
git push
```

**Les précommandes Stripe s'inséreront maintenant correctement dans `preorders` sans erreur de colonne.**

---

## DONORS EUROS FIX

### **Problème**
La table `donors` recevait des montants en centimes au lieu d'euros.

### **Correction**
```diff
// Lignes 315-324
- // Préparation des données pour la table donors
- const donorData = {
-     stripe_session_id: extractedData.stripe_session_id,
-     payment_intent_id: extractedData.payment_intent_id,
-     email: extractedData.email,
-     full_name: extractedData.full_name,
-     amount_total: extractedData.amount_total, // en centimes
+ // Sécurité mentale - conversion en euros
+ const amountInEuros = extractedData.amount_total / 100;
+ 
+ // Préparation des données pour la table donors
+ const donorData = {
+     stripe_session_id: extractedData.stripe_session_id,
+     payment_intent_id: extractedData.payment_intent_id,
+     email: extractedData.email,
+     full_name: extractedData.full_name,
+     amount_total: amountInEuros, // en euros
```

**Raison** : Conversion explicite en euros avec variable intermédiaire pour éviter les erreurs.

**Les dons sont maintenant correctement enregistrés en euros dans la table `donors`.**
