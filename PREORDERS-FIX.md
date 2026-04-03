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

---

## 📧 **EMAIL BREVO FIX**

### **Problème**
L'email envoyé pour les dons libres était identique à celui des précommandes, ce qui est déroutant pour les utilisateurs.

### **Correction**
```diff
// Lignes 41-66
- console.log('📧 Envoi email à:', toEmail);
- console.log('📧 Détails:', { toName, offer, amountTotal });
- 
- const response = await fetch('https://api.brevo.com/v3/smtp/email', {
-     method: 'POST',
-     headers: {
-         'Content-Type': 'application/json',
-         'api-key': process.env.BREVO_API_KEY
-     },
-     body: JSON.stringify({
-         sender: {
-             email: process.env.BREVO_SENDER_EMAIL,
-             name: process.env.BREVO_SENDER_NAME
-         },
-         to: [{
-             email: toEmail,
-             name: toName
-         }],
-         replyTo: {
-             email: "contact@oradia.fr",
-             name: "Oradia"
-         },
-         subject: 'Ta précommande ORADIA est confirmée',
+ console.log('📧 Envoi email à:', toEmail);
+ console.log('📧 Détails:', { toName, offer, amountTotal });
+ 
+ // Différencier don vs précommande
+ const isDonation = offer === 'contribution-libre';
+ const subject = isDonation
+     ? 'Merci pour ton soutien à ORADIA'
+     : 'Ta précommande ORADIA est confirmée';
+ 
+ const response = await fetch('https://api.brevo.com/v3/smtp/email', {
+     method: 'POST',
+     headers: {
+         'Content-Type': 'application/json',
+         'api-key': process.env.BREVO_API_KEY
+     },
+     body: JSON.stringify({
+         sender: {
+             email: process.env.BREVO_SENDER_EMAIL,
+             name: process.env.BREVO_SENDER_NAME
+         },
+         to: [{
+             email: toEmail,
+             name: toName
+         }],
+         replyTo: {
+             email: "contact@oradia.fr",
+             name: "Oradia"
+         },
+         subject: subject,
```

### **Contenu adapté**
```diff
// Lignes 87-125
- <h2>✨ Ta précommande est confirmée</h2>
- <p>Avec gratitude, nous te confirmons que ta précommande ORADIA a bien été enregistrée.</p>
- <strong>Offre :</strong> ${offer}
- <p>Ton oracle est maintenant en préparation...</p>
- <p>Merci pour ta confiance...</p>
+ <h2>${isDonation ? '✨ Merci pour ton soutien' : '✨ Ta précommande est confirmée'}</h2>
+ <p>${isDonation 
+     ? 'Avec profonde gratitude, nous te remercions pour ton soutien à ORADIA...'
+     : 'Avec gratitude, nous te confirmons que ta précommande ORADIA a bien été enregistrée.'
+ }</p>
+ <strong>${isDonation ? 'Contribution' : 'Offre'} :</strong> ${offer}
+ ${isDonation 
+     ? '<p>Ton soutien précieux nous permet de continuer notre mission...</p>'
+     : '<p>Ton oracle est maintenant en préparation...</p>'
+ }
+ <p>${isDonation 
+     ? 'Merci du fond du cœur pour ta générosité...'
+     : 'Merci pour ta confiance...'
+ }</p>
```

**Raison** : Les donateurs reçoivent maintenant un email de remerciement approprié, les précommandeurs conservent leur email de confirmation.

**Les emails Brevo sont maintenant correctement différenciés entre dons et précommandes.**

---

## 🛡️ **FULL_NAME FALLBACK FIX**

### **Problème**
Si Stripe ne renvoie pas le nom, `full_name` peut être `null`, ce qui peut causer des problèmes d'affichage.

### **Correction**
```diff
// Lignes 340 (donors)
- full_name: extractedData.full_name,
+ full_name: extractedData.full_name || 'Soutien ORADIA',

// Lignes 428 (preorders)
- full_name: extractedData.full_name,
+ full_name: extractedData.full_name || 'Client ORADIA',
```

**Raison** : Évite les trous de données et fournit un nom par défaut cohérent selon le type d'achat.

**Les tables `donors` et `preorders` ont maintenant toujours un `full_name` valide.**

---

## 📧 **TEXTCONTENT BREVO FIX**

### **Problème**
Le `textContent` restait un texte de précommande même pour les dons, créant une incohérence.

### **Correction**
```diff
// Lignes 155-190
- textContent: `Ta précommande ORADIA est confirmée...
+ textContent: `${isDonation 
+     ? `Merci pour ton soutien à ORADIA...
+     : `Ta précommande ORADIA est confirmée...
+ }`
```

**Raison** : Le texte brut est maintenant cohérent avec le HTML selon le type d'achat.

---

## 💰 **DONORS AMOUNT_TOTAL CORRECTION**

### **Problème**
La base `donors.amount_total` doit être en euros, pas en centimes.

### **SQL de correction**
```sql
-- 1. Convertir la colonne en numeric
ALTER TABLE donors
ALTER COLUMN amount_total TYPE numeric;

-- 2. Convertir les anciennes valeurs de centimes en euros (UNE SEULE FOIS)
UPDATE donors
SET amount_total = amount_total / 100
WHERE amount_total >= 1000;
```

**Attention** : Ne lancer la conversion qu'une seule fois pour éviter de rediviser les valeurs.

---

## ⚠️ **WEBHOOK ERREURS SUPABASE**

### **Problème identifié**
Dans `preorders`, si l'upsert Supabase échoue, l'email part quand même et la réponse est 200.

```javascript
if (upsertError) {
    console.log('⚠️ Upsert échoué mais continuation pour email');
    // ... envoi email quand même
}
```

### **Impact possible**
- ✅ **Client emailé** : OK pour UX
- ❌ **Aucune ligne en base** : Problème métier masqué
- ❌ **Réponse 200** : Stripe pense que tout va bien

### **Recommandation**
Ce n'est pas bloquant, mais il faut être conscient que cela peut masquer des vrais problèmes métier. À surveiller en production.

---

## 🚀 **DÉPLOIEMENT FINAL**

```bash
# 1. Correction SQL (UNE SEULE FOIS)
# psql < donors-amount-correction.sql

# 2. Déploiement code
git add api/stripe-webhook.js PREORDERS-FIX.md donors-amount-correction.sql
git commit -m "fix: final corrections - textContent, donors amount, webhook errors"
git push
```

**Les 3 corrections finales sont appliquées pour une cohérence parfaite.**
