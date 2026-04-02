# 🔍 DIAGNOSTIC FACTUEL WEBHOOK STRIPE - CAUSE RACINE

## 🚨 PROBLÈME IDENTIFIÉ

### **Cause Racine Exacte**
Le champ `offer` est **ABSENT** des metadata Stripe, mais le webhook tente de le lire directement depuis `session.metadata.offer`.

## 📋 ANALYSE DÉTAILLÉE

### 1. **Structure des Metadata Stripe (création session)**

**Fichier** : `/api/create-checkout-session.js` lignes 404-420

```javascript
metadata: {
    items: JSON.stringify(normalizedData.items),  // ✅ PRÉSENT
    delivery_method: normalizedData.deliveryMethod,
    total_weight: totalWeight,
    calculated_delivery_price: calculatedDeliveryPrice,
    full_name: normalizedData.fullName.trim(),
    email: normalizedData.email.trim(),
    phone: normalizedData.phone.trim(),
    shipping_address: normalizedData.shippingAddress?.trim() || '',
    address_complement: normalizedData.addressComplement?.trim() || '',
    postal_code: normalizedData.postalCode?.trim() || '',
    city: normalizedData.city?.trim() || '',
    country: normalizedData.country,
    total_amount: totalAmount,
    delivery_price: Math.round(deliveryPrice * 100),
    source: 'oradia-livraison'
    // ❌ MANQUANT : offer
}
```

### 2. **Lecture dans le Webhook (problématique)**

**Fichier** : `/api/stripe-webhook.js` ligne 231

```javascript
// Offer depuis metadata (obligatoire)
offer: session.metadata?.offer || null,  // ❌ TOUJOURS NULL !
```

### 3. **Structure des Items dans Metadata**

Les offers sont dans `session.metadata.items` (JSON stringifié) :
```javascript
items: '[{"offer":"standard","quantity":1}]'
```

Mais le webhook ne parse pas ce champ.

---

## 🔧 CORRECTIONS NÉCESSAIRES

### **A. Ajouter `offer` dans les metadata Stripe**

**Fichier** : `/api/create-checkout-session.js`

```diff
metadata: {
    items: JSON.stringify(normalizedData.items),
+   offer: normalizedData.items[0]?.offer || 'unknown',  // ← AJOUTER
    delivery_method: normalizedData.deliveryMethod,
    // ... autres champs
}
```

### **B. Parser les items dans le webhook (robustesse)**

**Fichier** : `/api/stripe-webhook.js`

```diff
// Offer depuis metadata (obligatoire)
- offer: session.metadata?.offer || null,
+ offer: session.metadata?.offer || 
+       (() => {
+           try {
+               const items = JSON.parse(session.metadata?.items || '[]');
+               return items[0]?.offer || null;
+           } catch {
+               return null;
+           }
+       })(),
```

---

## 📊 CHAMPS SUPABASE ACCEPTÉS

### **Structure de la table `preorders` (attendue)**

```sql
CREATE TABLE preorders (
  id SERIAL PRIMARY KEY,
  stripe_session_id VARCHAR(255) UNIQUE NOT NULL,      -- ✅ envoyé
  email VARCHAR(255) NOT NULL,                         -- ✅ envoyé
  offer VARCHAR(100),                                   -- ❌ problème ici
  full_name VARCHAR(255),                               -- ✅ envoyé
  amount_total DECIMAL(10,2),                          -- ✅ envoyé
  currency VARCHAR(3) DEFAULT 'eur',                    -- ✅ envoyé
  payment_intent_id VARCHAR(255),                       -- ✅ envoyé
  stripe_customer_id VARCHAR(255),                      -- ✅ envoyé
  paid_status VARCHAR(50) DEFAULT 'pending',           -- ✅ envoyé
  shipping_address TEXT,                                -- ✅ envoyé
  postal_code VARCHAR(20),                               -- ✅ envoyé
  city VARCHAR(100),                                     -- ✅ envoyé
  phone VARCHAR(50),                                     -- ✅ envoyé
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),     -- ✅ envoyé
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),    -- ✅ envoyé
  email_sent_at TIMESTAMP WITH TIME ZONE               -- ✅ envoyé
);
```

### **Problème de contrainte**
Si `offer` est `NOT NULL` dans la table Supabase, l'insert échouera.

---

## 🔄 LOGIQUE SELECT/UPDATE/INSERT VS UPSERT

### **Actuel (problématique avec retries)**

```javascript
// 1. SELECT
const { data: existingOrder, error: fetchError } = await supabase
    .from('preorders')
    .select('id, paid_status, email_sent_at')
    .eq('stripe_session_id', sessionId)
    .single();

// 2. UPDATE ou INSERT séparés
if (existingOrder) {
    await supabase.from('preorders').update(supabaseData);
} else {
    await supabase.from('preorders').insert(insertData);
}
```

**Problème** : Race condition possible avec retries Stripe.

### **Recommandé (vrai upsert)**

```javascript
const { error: upsertError } = await supabase
    .from('preorders')
    .upsert({
        stripe_session_id: sessionId,
        email: extractedData.email,
        offer: extractedData.offer,
        // ... autres champs
        updated_at: new Date().toISOString()
    }, {
        onConflict: 'stripe_session_id',
        ignoreDuplicates: false
    });
```

---

## 📧 RISQUE DOUBLE EMAIL

### **Problème actuel**
```javascript
if (emailSent) {
    // Mettre à jour email_sent_at
    const { error: emailUpdateError } = await supabase
        .from('preorders')
        .update({ email_sent_at: new Date().toISOString() })
        .eq('stripe_session_id', sessionId);
}
```

**Si Supabase échoue** → `email_sent_at` non mis à jour → **Retry Stripe** → **Double email**.

### **Solution**
Mettre à jour `email_sent_at` **avant** l'envoi email ou utiliser une table séparée.

---

## 🎯 RÉSUMÉ FINAL CORRIGÉ

```javascript
return res.status(200).json({ 
    message: 'Order processed successfully',
    sessionId: sessionId,
    email: extractedData.email,
    offer: extractedData.offer,
    supabaseStatus: upsertError ? 'failed' : 'success',  // ← ÉTAT RÉEL
    emailStatus: extractedData.email ? (emailSent ? 'sent' : 'failed') : 'skipped'
});
```

---

## 📝 DIFFS EXACTS PROPOSÉS

### **Fichier 1 : `/api/create-checkout-session.js`**

```diff
metadata: {
    items: JSON.stringify(normalizedData.items),
+   offer: normalizedData.items[0]?.offer || 'unknown',
    delivery_method: normalizedData.deliveryMethod,
    // ... reste inchangé
}
```

### **Fichier 2 : `/api/stripe-webhook.js`**

```diff
// Offer depuis metadata (obligatoire)
- offer: session.metadata?.offer || null,
+ offer: session.metadata?.offer || 
+       (() => {
+           try {
+               const items = JSON.parse(session.metadata?.items || '[]');
+               return items[0]?.offer || null;
+           } catch {
+               return null;
+           }
+       })(),

// Remplacer logique select/update/insert par upsert
- if (existingOrder) { ... }
- else { ... }
+ const { error: upsertError } = await supabase
+     .from('preorders')
+     .upsert({
+         stripe_session_id: sessionId,
+         // ... tous les champs
+         updated_at: new Date().toISOString()
+     }, {
+         onConflict: 'stripe_session_id'
+     });

// Résumé final corrigé
- supabaseStatus: 'error_but_continued',
+ supabaseStatus: upsertError ? 'failed' : 'success',
```

---

## 🏆 CONCLUSION FACTUELLE

**Cause exacte** : `session.metadata.offer` n'existe pas car non ajouté lors de la création de session Stripe.

**Lignes concernées** :
- `/api/create-checkout-session.js` ligne 404-420 (metadata manquant)
- `/api/stripe-webhook.js` ligne 231 (lecture inexistante)

**Solution** : Ajouter `offer` dans les metadata ET parser les items en fallback.

Le webhook échoue à cause du champ `offer` manquant, pas à cause de Supabase.
