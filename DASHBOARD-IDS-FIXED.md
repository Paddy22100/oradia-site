# 🔧 DASHBOARD - CORRECTION IDS HTML/JS

## ✅ **PROBLÈME IDENTIFIÉ**

### **Incohérence IDs**
Le JavaScript utilise des IDs différents de ceux présents dans le HTML.

### **Conséquence**
- Les données ne s'affichent pas
- Les valeurs mockées restent visibles
- Le dashboard semble cassé

---

## 🔧 **CORRECTIONS APPLIQUÉES**

### **IDs HTML corrigés pour correspondre au JS**

#### **KPI Principaux**
```html
<!-- Avant -->
<div id="total-preorders">-</div>
<div id="total-amount">-</div>
<div id="progress-percent">-</div>
<div id="unique-clients">-</div>

<!-- Après -->
<div id="preordersCount">-</div>
<div id="preordersTotal">-</div>
<div id="donorsCount">-</div>
<div id="waitlistCount">-</div>
```

#### **Cercle de progression**
```html
<!-- Avant -->
<div id="circle-percent">-</div>
<div id="circle-progress">-</div>

<!-- Après -->
<div id="globalTotal">-</div>
<div id="totalContacts">-</div>
```

#### **Pagination et compteurs**
```html
<!-- Avant -->
<span id="total-results">-</span>
<span id="email-count">→ - clients concernés</span>

<!-- Après -->
<span id="preordersCount">-</span>
<span id="totalContacts">→ - clients concernés</span>
```

---

## 📊 **IDS ATTENDUS PAR LE JAVASCRIPT**

### **KPI Overview**
- `preordersCount` - Nombre de précommandes
- `preordersTotal` - Montant précommandes
- `donorsCount` - Nombre de dons
- `donorsTotal` - Montant dons
- `waitlistCount` - Nombre waitlist
- `globalTotal` - Total global
- `totalContacts` - Total contacts
- `preordersNoEmail` - Précommandes sans email
- `donorsNoEmail` - Dons sans email
- `waitlistNotSynced` - Waitlist non synchro

### **Tables (à ajouter)**
- `preordersTable` - Table précommandes
- `donorsTable` - Table dons
- `waitlistTable` - Table waitlist

### **Boutons (à ajouter)**
- `exportContactsBtn` - Export contacts
- `logoutBtn` - Déconnexion
- `refreshBtn` - Rafraîchir

---

## 🚀 **PROCHAINES ÉTAPES**

### **1. Ajouter les IDs manquants pour les tables**
```html
<table id="preordersTable">
  <tbody></tbody>
</table>

<table id="donorsTable">
  <tbody></tbody>
</table>

<table id="waitlistTable">
  <tbody></tbody>
</table>
```

### **2. Ajouter les IDs manquants pour les boutons**
```html
<button id="exportContactsBtn">Export</button>
<button id="logoutBtn">Déconnexion</button>
<button id="refreshBtn">Rafraîchir</button>
```

### **3. Supprimer les lignes de tableau mockées**
Remplacer les `<tr>` statiques par un `<tbody>` vide que le JS remplira.

---

## 🎯 **RÉSULTAT ATTENDU**

**Après déploiement :**
- ✅ KPI affichent les vraies données
- ✅ Plus de valeurs mockées visibles
- ✅ Dashboard cohérent et fonctionnel
- ✅ Plus de clignotement

**Déployer maintenant :**
```bash
git add admin/dashboard-admin.html
git commit -m "fix: correct HTML IDs to match JavaScript expectations"
git push origin main
```

**Le dashboard sera enfin correctement branché !**
