# 📊 Dashboard Admin ORADIA - Guide Complet

## ✅ Fonctionnalités Vérifiées et Opérationnelles

### 🎯 Vue d'ensemble (KPIs)
- **Précommandes totales** : Nombre et montant total
- **Dons reçus** : Nombre et montant total
- **Waitlist** : Nombre d'inscrits
- **Taux de conversion** : Calculé automatiquement
- **Revenus du mois** : Suivi mensuel

### 📦 Gestion des Précommandes

**Filtres disponibles** :
- ✅ Recherche par email ou nom
- ✅ Filtre par statut (Payé / En attente / Échoué)
- ✅ Filtre par période (Aujourd'hui / 7j / 30j / Tout)
- ✅ Filtre par offre (Standard / Guidance / Signature)

**Colonnes affichées** :
- Date de commande
- Email client
- Nom complet
- Offre sélectionnée
- Montant (€)
- Statut paiement
- Mode de livraison
- Point relais / Numéro de tracking
- Actions (détails, copier tracking)

**Actions disponibles** :
- Voir les détails complets
- Copier le numéro de tracking
- Pagination (50 résultats par page)

---

## 📥 Exports CSV

### 1️⃣ Export Global CSV

**Bouton** : "Export global CSV"

**Contenu** :
- **Précommandes** : Email, Nom, Montant, Statut, Offre, Ville, Mode livraison, Statut livraison, Date
- **Dons** : Email, Nom, Montant, Statut, Date
- **Waitlist** : Email, Nom, Date, Sync Brevo

**Format** :
- Séparateur : `;` (point-virgule)
- Encodage : UTF-8 avec BOM
- Compatible Excel direct
- Nom fichier : `oradia-contacts-YYYY-MM-DD.csv`

**Utilisation** :
- Import dans Brevo
- Analyse dans Excel/Google Sheets
- Backup des données clients

---

### 2️⃣ Export Mondial Relay

**Bouton** : "Export Mondial Relay"

**Spécifications techniques** :
- ✅ **Format** : Mondial Relay Connect V3.1 (44 champs A..AR)
- ✅ **Validation** : Nombre de champs vérifié automatiquement
- ✅ **Séparateur** : `;` (point-virgule)
- ✅ **Encodage** : UTF-8 avec BOM
- ✅ **Normalisation** : Caractères ASCII uniquement, majuscules

**Champs exportés** (44 colonnes) :

| Colonne | Champ | Description | Exemple |
|---------|-------|-------------|---------|
| A | N° Client | Référence client (9 car.) | `CS123ABCD` |
| B | Référence expédition | ID commande (15 car.) | `CS_123_ABCD_EF` |
| C | Nom client final | Nom complet destinataire | `MR DUPONT JEAN` |
| D | Complément nom | (vide) | |
| E | Adresse destinataire | Numéro + rue | `12 RUE DE LA PAIX` |
| F | Complément adresse | Bâtiment, étage, etc. | `BAT A ETAGE 3` |
| G | Ville | Ville destinataire | `PARIS` |
| H | Code postal | Code postal | `75001` |
| I | Pays destinataire | Code pays ISO | `FR` |
| J | Téléphone 1 | Format international | `+33612345678` |
| K | Téléphone 2 | (vide) | |
| L | Email | Email client | `client@example.com` |
| M | Type Collecte | Toujours `A` (Agence) | `A` |
| N | ID Relais Collecte | (vide) | |
| O | Code Pays Collecte | (vide) | |
| P | Type Livraison | Toujours `R` (Relais) | `R` |
| Q | ID Relais Livraison | ID point relais (6 chiffres) | `123456` |
| R | Code Pays Relais | Code pays ISO | `FR` |
| S | Mode Livraison | Toujours `24R` | `24R` |
| T | Code langue | Toujours `FR` | `FR` |
| U | Nombre de colis | Toujours `1` | `1` |
| V | Poids | Poids en grammes | `500` |
| W | Longueur | (0 = auto) | `0` |
| X | Volume | (0 = auto) | `0` |
| Y | Valeur expédition | Montant en centimes | `3800` |
| Z | Devise | Toujours `EUR` | `EUR` |
| AA | Assurance | Toujours `0` | `0` |
| AB | Montant CRT | Toujours `0` | `0` |
| AC | Devise CRT | Toujours `EUR` | `EUR` |
| AD | Instructions livraison | (vide) | |
| AE | Top Avisage | Toujours `0` | `0` |
| AF | Top Reprise Domicile | Toujours `0` | `0` |
| AG | Temps Montage | Toujours `0` | `0` |
| AH | Top RDV | Toujours `0` | `0` |
| AI | Article 01 | Nom du produit | `ORACLE ORADIA` |
| AJ-AR | Article 02-10 | (vides) | |

**Filtrage automatique** :
- ✅ Uniquement les commandes **payées** (`paid_status = completed`)
- ✅ Uniquement les livraisons **point relais** (`shipping_method = relay`)
- ✅ Uniquement les commandes avec **ID relais valide**

**Normalisation des données** :
- ✅ **Téléphone** : Format international (+33...)
- ✅ **Nom/Adresse** : ASCII majuscules uniquement
- ✅ **Caractères spéciaux** : Supprimés ou remplacés
- ✅ **Accents** : Normalisés (é → E, à → A, etc.)
- ✅ **Pays** : Code ISO 2 lettres (France → FR)

**Nom fichier** : `oradia-mondial-relay-YYYY-MM-DD.csv`

---

## 🔄 Workflow d'utilisation Mondial Relay

### Étape 1 : Préparation des commandes
1. Vérifier que toutes les commandes ont un **point relais** sélectionné
2. Vérifier que les **statuts de paiement** sont à jour

### Étape 2 : Export
1. Cliquer sur **"Export Mondial Relay"**
2. Le fichier CSV se télécharge automatiquement

### Étape 3 : Import dans Mondial Relay Connect
1. Se connecter à https://connect.mondialrelay.com
2. Aller dans **"Expéditions"** → **"Import CSV"**
3. Sélectionner le fichier téléchargé
4. Valider l'import

### Étape 4 : Édition des étiquettes
1. Les expéditions apparaissent dans la liste
2. Sélectionner les expéditions
3. Cliquer sur **"Imprimer les étiquettes"**
4. Format recommandé : **PDF A4** (4 étiquettes par page)

### Étape 5 : Mise à jour du tracking
1. Mondial Relay génère les numéros de tracking
2. Copier les numéros depuis Mondial Relay Connect
3. Les coller dans le dashboard ORADIA (colonne "Tracking")
4. Les clients recevront un email avec le lien de suivi

---

## 🛡️ Sécurité et Validations

### Protection des données
- ✅ Authentification admin obligatoire (JWT)
- ✅ Vérification du token à chaque requête
- ✅ Logs d'audit des actions admin
- ✅ Pas d'exposition des données sensibles

### Validations export Mondial Relay
- ✅ **Nombre de champs** : Vérifié automatiquement (44 colonnes)
- ✅ **Format téléphone** : Validation et normalisation
- ✅ **Caractères interdits** : Supprimés automatiquement
- ✅ **Longueur des champs** : Tronqués si nécessaire
- ✅ **ID relais** : Validation numérique (6 chiffres)

### Gestion des erreurs
- ✅ Message d'erreur si export échoue
- ✅ Validation côté serveur
- ✅ Logs détaillés pour debug

---

## 📋 Checklist avant export Mondial Relay

- [ ] Toutes les commandes ont un **point relais** sélectionné
- [ ] Les **emails clients** sont valides
- [ ] Les **téléphones** sont au bon format
- [ ] Les **adresses** sont complètes
- [ ] Le **statut de paiement** est "completed"
- [ ] Le **mode de livraison** est "relay"

---

## 🐛 Dépannage

### Export CSV vide
**Cause** : Aucune commande ne correspond aux critères  
**Solution** : Vérifier les filtres (statut, période, offre)

### Export Mondial Relay vide
**Cause** : Aucune commande avec point relais  
**Solution** : Vérifier que `shipping_method = relay` et `relay_id` existe

### Erreur "Invalid field count"
**Cause** : Nombre de colonnes incorrect  
**Solution** : Contacter le support (bug dans le code)

### Caractères bizarres dans Excel
**Cause** : Encodage UTF-8 non reconnu  
**Solution** : Ouvrir avec "Données" → "Depuis un fichier texte" et sélectionner UTF-8

### Mondial Relay rejette l'import
**Cause** : Format de champ invalide  
**Solution** : Vérifier que tous les champs obligatoires sont remplis (ID relais, téléphone, etc.)

---

## 🔧 Maintenance

### Mise à jour du format Mondial Relay
Si Mondial Relay change son format :
1. Modifier `api/admin/contacts-export.js`
2. Mettre à jour `MONDIAL_RELAY_FIELD_COUNT`
3. Ajuster les colonnes dans le tableau `row`
4. Tester l'import dans Mondial Relay Connect

### Ajout de nouvelles colonnes CSV global
1. Modifier `exportStandardCsv()` dans `contacts-export.js`
2. Ajouter la colonne dans `csvData` (header)
3. Ajouter la valeur dans chaque `push()` (preorders, donors, waitlist)

---

## 📊 Statistiques et Analytics

Le dashboard affiche en temps réel :
- **Revenus totaux** : Somme de toutes les transactions
- **Nombre de commandes** : Par statut et par offre
- **Taux de conversion** : Waitlist → Précommandes
- **Évolution mensuelle** : Graphique des revenus

---

## ✅ Résumé des fonctionnalités

| Fonctionnalité | Status | Notes |
|----------------|--------|-------|
| Export CSV global | ✅ Opérationnel | Précommandes + Dons + Waitlist |
| Export Mondial Relay | ✅ Opérationnel | Format V3.1 validé |
| Filtres précommandes | ✅ Opérationnel | 4 filtres disponibles |
| Pagination | ✅ Opérationnel | 50 résultats/page |
| Recherche | ✅ Opérationnel | Email ou nom |
| Copie tracking | ✅ Opérationnel | Clic pour copier |
| Authentification | ✅ Opérationnel | JWT sécurisé |
| Logs d'audit | ✅ Opérationnel | Toutes actions tracées |

---

**Dashboard prêt pour la production** 🚀
