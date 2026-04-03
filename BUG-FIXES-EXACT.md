# 🐛 BUG FIXES EXACTS - api/stripe-webhook.js

## 📋 3 BUGS CRITIQUES CORRIGÉS

---

## 1. **Bug `offer` - Fallback "unknown"**

### **Problème**
Le code retournait `"unknown"` si `offer` était absent, ce qui empêchait la validation `if (!extractedData.offer)` de fonctionner correctement.

### **Correction**
```diff
// Lignes 230-246
- // Offer depuis metadata (obligatoire) - PAS DE FALLBACK MONTANT
- offer: session.metadata?.offer || 
-       (() => {
-           try {
-               const items = JSON.parse(session.metadata?.items || '[]');
-               return items[0]?.offer || null;
-           } catch {
-               return null;
-           }
-       })() ||
-       (() => {
-           // Fallback SEULEMENT si metadata.offer explicitement 'contribution-libre'
-           if (session.metadata?.offer === 'contribution-libre') {
-               return 'contribution-libre';
-           }
-           return 'unknown';
-       })(),
+ // Offer depuis metadata (obligatoire)
+ offer: session.metadata?.offer || (() => {
+     try {
+         const items = JSON.parse(session.metadata?.items || '[]');
+         return items[0]?.offer || null;
+     } catch {
+         return null;
+     }
+ })(),
```

**Raison** : Supprime le fallback `"unknown"` pour permettre à `if (!extractedData.offer)` de fonctionner correctement.

---

## 2. **Bug `created_at` dans donors**

### **Problème**
Le code utilisait `new Date(extractedData.created_at).toISOString()` mais `extractedData.created_at` n'existait pas.

### **Correction**
```diff
// Ligne 322
- created_at: new Date(extractedData.created_at).toISOString(),
+ created_at: new Date().toISOString(),
```

**Raison** : Utilise la date actuelle au lieu d'une valeur inexistante.

---

## 3. **Bug `paid_status` dans donors**

### **Problème**
Le code faisait `extractedData.paid_status === 'paid' ? 'completed' : 'pending'` alors que `extractedData.paid_status` valait déjà `'completed'`.

### **Correction**
```diff
// Ligne 319
- paid_status: extractedData.paid_status === 'paid' ? 'completed' : 'pending',
+ paid_status: 'completed',
```

**Raison** : Le webhook `checkout.session.completed` garantit un paiement complété.

---

## 4. **Logs de debug ajoutés**

### **Ajout**
```diff
// Lignes 307-309 (ajout)
+ // Logs de debug finaux
+ console.log('🎯 FINAL OFFER USED:', extractedData.offer);
+ console.log('🎯 FINAL ROUTE:', extractedData.offer === 'contribution-libre' ? 'donors' : 'preorders');
```

**Raison** : Permet de tracer exactement l'offer utilisé et la route choisie.

---

## 🎯 **RÉSULTAT**

### **Avant correction**
- ❌ `offer` pouvait être `"unknown"` → validation cassée
- ❌ `created_at` utilisait valeur inexistante → erreur
- ❌ `paid_status` logique incorrecte → statut erroné

### **Après correction**
- ✅ `offer` = `null` si absent → validation fonctionne
- ✅ `created_at` = date actuelle → correct
- ✅ `paid_status` = `'completed'` → statut correct
- ✅ Logs de debug pour traçabilité

---

## 🚀 **DÉPLOIEMENT**

```bash
git add api/stripe-webhook.js BUG-FIXES-EXACT.md
git commit -m "fix: critical bugs in stripe-webhook - offer, created_at, paid_status"
git push
```

**Les 3 bugs critiques sont maintenant corrigés avec des modifications minimales et ciblées.**
