# 📋 PROTOCOLE DE VALIDATION POST-DÉPLOIEMENT

## 🎯 Objectif
Validation factuelle des deux flux corrigés avec preuves concrètes.

---

## ✅ ÉTAPE 1 : DÉPLOIEMENT

### Commandes Git
```bash
git add .
git commit -m "fix: contribution libre email collection + waitlist diagnostic logs"
git push origin main
```

### Vérification Vercel
1. Aller sur https://vercel.com/dashboard
2. Vérifier que le déploiement démarre automatiquement
3. Attendre "Ready" (environ 1-2 minutes)
4. Noter l'URL de production (ex: `https://oradia.fr`)

---

## 🧪 ÉTAPE 2 : TEST FLUX A - CONTRIBUTION LIBRE

### Test Manuel (Navigateur)

1. **Ouvrir la page**
   - URL : `https://oradia.fr/precommande-oracle.html#contribution-libre`
   - Scroller jusqu'à la section "Contribution libre"

2. **Remplir le formulaire**
   - Email : `test-validation@oradia.fr`
   - Nom : `Test Validation` (optionnel)
   - Montant : `20`

3. **Ouvrir DevTools (F12)**
   - Onglet "Console"
   - Onglet "Network"

4. **Cliquer sur "Contribuer"**

5. **CAPTURER LES PREUVES** :

   **A. Console Logs** :
   ```
   Copier et coller EXACTEMENT :
   - 🎁 === CONTRIBUTION LIBRE CHECKOUT START ===
   - 📧 Email: ...
   - 👤 Name: ...
   - 💰 Amount: ...
   - 📦 Payload envoyé: {...}
   - 📡 Response status: ...
   - 📡 Response data: {...}
   - ✅ Redirection vers Stripe: ...
   ```

   **B. Network Tab** :
   - Chercher la requête `create-checkout-session`
   - Clic droit → Copy → Copy as cURL
   - Onglet "Response" → Copier le JSON EXACT

   **C. Résultat visuel** :
   - ✅ Redirection vers `checkout.stripe.com` ?
   - ✅ Page Stripe s'ouvre ?
   - ❌ Erreur affichée ?

### Test Automatisé (Node.js)

```bash
# Depuis la racine du projet
SITE_URL=https://oradia.fr node test-flux-validation.js
```

**CAPTURER LA SORTIE COMPLÈTE** du terminal.

---

## 📧 ÉTAPE 3 : TEST FLUX B - WAITLIST

### Test Manuel (Navigateur)

1. **Ouvrir la page**
   - URL : `https://oradia.fr/precommande-oracle.html#waitlist`
   - Scroller jusqu'à "Je veux être informé"

2. **Remplir le formulaire**
   - Email : `test-validation@oradia.fr`

3. **Ouvrir DevTools (F12)**
   - Onglet "Console"
   - Onglet "Network"

4. **Cliquer sur "Je veux être informé"**

5. **CAPTURER LES PREUVES** :

   **A. Network Tab** :
   - Chercher la requête `waitlist`
   - Noter le **Status Code** (200, 500, etc.)
   - Onglet "Response" → Copier le JSON EXACT

   **B. Résultat visuel** :
   - ✅ Message de succès ?
   - ❌ Message d'erreur ?

### Vérification Logs Vercel

1. **Aller sur Vercel Dashboard**
   - https://vercel.com/dashboard
   - Sélectionner le projet ORADIA
   - Onglet "Logs" ou "Functions"

2. **Chercher les logs de `/api/waitlist`**
   - Filtrer par fonction `waitlist`
   - Chercher les logs récents (dernière minute)

3. **CAPTURER LES LOGS EXACTS** :
   ```
   Copier EXACTEMENT les lignes :
   - 📧 === WAITLIST API CALLED ===
   - 🔍 Vérification variables environnement:
   - BREVO_API_KEY présente: true/false
   - BREVO_WAITLIST_LIST_ID présente: true/false
   - BREVO_WAITLIST_LIST_ID valeur: ...
   - 📦 Body reçu: {...}
   - 📡 Réponse Brevo - Status: ...
   - 📡 Réponse Brevo - Data: {...}
   ```

---

## 📊 ÉTAPE 4 : RAPPORT DE VALIDATION

### Template à remplir

```markdown
# VALIDATION POST-DÉPLOIEMENT - ORADIA

Date : [DATE]
URL Production : [URL]
Déploiement Vercel : [ID ou timestamp]

---

## FLUX A : CONTRIBUTION LIBRE

### Status HTTP
- Code : [200/400/500/etc.]
- Text : [OK/Internal Server Error/etc.]

### Réponse JSON EXACTE
```json
[COLLER ICI LA RÉPONSE EXACTE]
```

### Validation Critères
- [ ] Status HTTP 200
- [ ] `data.url` présent
- [ ] `data.url` contient "checkout.stripe.com"
- [ ] Redirection Stripe fonctionne

### Console Logs Frontend
```
[COLLER ICI LES LOGS CONSOLE]
```

### Résultat
- [ ] ✅ FONCTIONNEL
- [ ] ❌ ÉCHEC (détails : ...)

---

## FLUX B : WAITLIST

### Status HTTP
- Code : [200/400/500/etc.]
- Text : [OK/Internal Server Error/etc.]

### Réponse JSON EXACTE
```json
[COLLER ICI LA RÉPONSE EXACTE]
```

### Logs Vercel EXACTS
```
[COLLER ICI LES LOGS VERCEL]
```

### Variables Environnement (depuis logs)
- BREVO_API_KEY présente : [true/false]
- BREVO_WAITLIST_LIST_ID présente : [true/false]
- BREVO_WAITLIST_LIST_ID valeur : [valeur ou undefined]

### Erreur Brevo (si applicable)
```json
[COLLER ICI L'ERREUR BREVO EXACTE]
```

### Résultat
- [ ] ✅ FONCTIONNEL
- [ ] ⚠️ CONFIG MANQUANTE (attendu si variables absentes)
- [ ] ❌ ÉCHEC INATTENDU (détails : ...)

---

## CONCLUSION

- Flux Contribution Libre : [✅ VALIDÉ / ❌ ÉCHEC]
- Flux Waitlist : [✅ VALIDÉ / ⚠️ CONFIG REQUISE / ❌ ÉCHEC]

### Actions Requises
- [ ] Aucune - Tout fonctionne
- [ ] Configurer BREVO_API_KEY dans Vercel
- [ ] Configurer BREVO_WAITLIST_LIST_ID dans Vercel
- [ ] Autre : [préciser]
```

---

## 🔧 CONFIGURATION BREVO (si nécessaire)

### Si les logs montrent variables manquantes

1. **Créer compte Brevo**
   - https://app.brevo.com/account/register
   - Gratuit jusqu'à 300 emails/jour

2. **Obtenir API Key**
   - Settings → API Keys
   - "Create a new API key"
   - Copier la clé (format : `xkeysib-...`)

3. **Créer liste Waitlist**
   - Contacts → Lists
   - "Create a new list"
   - Nom : "Waitlist Tirages en Ligne"
   - Copier l'ID (nombre, ex: `123`)

4. **Configurer dans Vercel**
   - Vercel Dashboard → Projet ORADIA
   - Settings → Environment Variables
   - Ajouter :
     ```
     BREVO_API_KEY = xkeysib-xxxxxxxxxxxxx
     BREVO_WAITLIST_LIST_ID = 123
     ```
   - Redéployer (ou attendre auto-redeploy)

5. **Re-tester le flux waitlist**

---

## 📸 CAPTURES ATTENDUES

### Contribution Libre - Succès
```json
{
  "url": "https://checkout.stripe.com/c/pay/cs_test_xxxxx..."
}
```

### Contribution Libre - Échec
```json
{
  "error": "...",
  "message": "..."
}
```

### Waitlist - Succès
```json
{
  "success": true,
  "message": "Inscription réussie."
}
```

### Waitlist - Config Manquante
```json
{
  "success": false,
  "message": "Configuration du serveur incomplète"
}
```

### Waitlist - Erreur Brevo
```json
{
  "success": false,
  "message": "Erreur lors de l'inscription. Veuillez réessayer.",
  "brevoError": {...}
}
```

---

## ⚡ CHECKLIST RAPIDE

- [ ] Déploiement Vercel terminé
- [ ] Test contribution libre effectué
- [ ] Status HTTP contribution libre capturé
- [ ] Réponse JSON contribution libre capturée
- [ ] `data.url` vérifié
- [ ] Test waitlist effectué
- [ ] Status HTTP waitlist capturé
- [ ] Réponse JSON waitlist capturée
- [ ] Logs Vercel waitlist capturés
- [ ] Variables environnement vérifiées dans logs
- [ ] Rapport de validation rempli
