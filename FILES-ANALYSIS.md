# 📋 ANALYSE DES FICHIERS - CE QUI SERT ET CE QUI NE SERT PAS

## 🗂️ FICHIERS ACTIFS (À GARDER)

### **API Principales**
- ✅ `api/create-checkout-session.js` - **INDISPENSABLE** - Création sessions Stripe
- ✅ `api/stripe-webhook.js` - **INDISPENSABLE** - Webhook Stripe principal (modifié pour donors)
- ✅ `api/waitlist.js` - **INDISPENSABLE** - Waitlist avec Supabase first (modifié)
- ✅ `api/contact.js` - **INDISPENSABLE** - Formulaire contact

### **SQL Schémas**
- ✅ `donors-schema.sql` - **INDISPENSABLE** - Table donors pour dons libres
- ✅ `waitlist-tirages-clean.sql` - **INDISPENSABLE** - Table waitlist_tirages

### **Documentation**
- ✅ `IMPLEMENTATION-SEPARATION-CLEAN.md` - **UTILE** - Résumé de l'implémentation

---

## 🗑️ FICHIERS À SUPPRIMER (INUTILES)

### **API Doublons/Versions**
- ❌ `api/stripe-webhook-v2.js` - Doublon de `stripe-webhook.js`
- ❌ `api/stripe-webhook-simple.js` - Version simplifiée inutilisée
- ❌ `api/waitlist-v2.js` - Doublon de `waitlist.js`
- ❌ `api/test-webhook.js` - Fichier de test
- ❌ `api/webhook-debug.js` - Fichier de debug
- ❌ `api/health-check.js` - Fichier de test
- ❌ `api/hf-sync.js` - Fichier test inutilisé

### **SQL Doublons**
- ❌ `waitlist-tirages-schema.sql` - Doublon de `waitlist-tirages-clean.sql`
- ❌ `supabase-schema-separation.sql` - Schema complet non utilisé (on a séparé)

### **Documentation Redondante**
- ❌ `ARCHITECTURE-SEPARATION.md` - Remplacé par `IMPLEMENTATION-SEPARATION-CLEAN.md`
- ❌ `DIFFS_EXACTS.md` - Documentation temporaire
- ❌ `DIAGNOSTIC-STEPS.md` - Documentation temporaire
- ❌ `VALIDATION-POST-DEPLOIEMENT.md` - Documentation temporaire
- ❌ `WEBHOOK-SETUP.md` - Documentation temporaire

### **Fichiers de Test/Debug**
- ❌ `test-flux-validation.js` - Fichier de test
- ❌ `test-after-fix.js` - Fichier de test
- ❌ `test-scroll-offres.html` - Fichier de test
- ❌ `debug-supabase-direct.js` - Fichier de debug
- ❌ `debug-webhook.js` - Fichier de debug
- ❌ `simulate-webhook-call.js` - Fichier de simulation
- ❌ `check-supabase-schema.js` - Fichier de vérification
- ❌ `clean-console-logs.js` - Fichier de nettoyage

### **Configuration Doublons**
- ❌ `vercel-config-separation.json` - Doublon de `vercel.json`

### **Documentation Setup**
- ❌ `README_DEPLOYMENT.md` - Documentation temporaire
- ❌ `README_PRODUCTION_MINIMAL.md` - Documentation temporaire
- ❌ `README_SETUP_PRECOMMANDES.md` - Documentation temporaire
- ❌ `CONTACT_FORM_SETUP.md` - Documentation temporaire

---

## 🎯 SITUATION CLAIRE

### **Ce qui fonctionne MAINTENANT**
1. **Précommandes** → `preorders` (flux existant)
2. **Dons libres** → `donors` (via `stripe-webhook.js`)
3. **Waitlist** → `waitlist_tirages` (via `waitlist.js`)

### **Fichiers qui implémentent ces flux**
- `api/stripe-webhook.js` - Gère précommandes ET dons
- `api/waitlist.js` - Gère waitlist avec Supabase first
- `donors-schema.sql` - Crée table donors
- `waitlist-tirages-clean.sql` - Crée table waitlist_tirages

---

## 🧹 COMMANDES DE NETTOYAGE

```bash
# Supprimer les fichiers inutiles
rm api/stripe-webhook-v2.js
rm api/stripe-webhook-simple.js
rm api/waitlist-v2.js
rm api/test-webhook.js
rm api/webhook-debug.js
rm api/health-check.js
rm api/hf-sync.js

rm waitlist-tirages-schema.sql
rm supabase-schema-separation.sql

rm ARCHITECTURE-SEPARATION.md
rm DIFFS_EXACTS.md
rm DIAGNOSTIC-STEPS.md
rm VALIDATION-POST-DEPLOIEMENT.md
rm WEBHOOK-SETUP.md

rm test-flux-validation.js
rm test-after-fix.js
rm test-scroll-offres.html
rm debug-supabase-direct.js
rm debug-webhook.js
rm simulate-webhook-call.js
rm check-supabase-schema.js
rm clean-console-logs.js

rm vercel-config-separation.json
rm README_DEPLOYMENT.md
rm README_PRODUCTION_MINIMAL.md
rm README_SETUP_PRECOMMANDES.md
rm CONTACT_FORM_SETUP.md
```

---

## ✅ APRÈS NETTOYAGE - CE QUI RESTE

### **API (4 fichiers)**
- `api/create-checkout-session.js`
- `api/stripe-webhook.js`
- `api/waitlist.js`
- `api/contact.js`

### **SQL (2 fichiers)**
- `donors-schema.sql`
- `waitlist-tirages-clean.sql`

### **Documentation (1 fichier)**
- `IMPLEMENTATION-SEPARATION-CLEAN.md`

### **Total**: 7 fichiers essentiels au lieu de 30+

---

## 🎯 RÉSUMÉ FINAL

**Fonctionnel avec seulement 7 fichiers :**
- ✅ 3 flux séparés (précommandes, dons, waitlist)
- ✅ Architecture propre
- ✅ Pas de doublons
- ✅ Maintenance facile

**À supprimer : 23+ fichiers inutiles**
