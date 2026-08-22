# Oradia — application mobile (Capacitor)

## Ce qui est fait

- Coquille native Capacitor configurée pour charger directement le site en
  direct (`server.url` → `https://oradia.fr/app-home.html`), pas de copie du
  code du site : toute mise à jour du site web se répercute automatiquement
  dans l'app, sans nouvelle publication sur les stores.
- Nouvel écran d'accueil dédié à l'app : [`../app-home.html`](../app-home.html)
  (sur le site principal, pas dans ce dossier) — 4 raccourcis : Tirer le Tore,
  Mon espace, Précommander, Devenir abonné. Reste sur le domaine oradia.fr,
  donc la connexion à l'espace membre fonctionne exactement comme sur le site
  (mêmes cookies/sessionStorage), pas de contexte isolé ni de risque de perte
  de session lié à une iframe cross-origin.
- Projets natifs Android (`android/`) et iOS (`ios/`) générés.
- Icônes et écrans de démarrage générés automatiquement à partir du logo du
  site (`assets/icon-source.webp`) pour toutes les tailles Android/iOS, plus
  des icônes PWA en bonus (`assets/icons/`).
- `allowNavigation` inclut les domaines Stripe (`js.stripe.com`,
  `checkout.stripe.com`) pour que le paiement précommande/abonnement
  fonctionne dans la WebView de l'app.

## Ce qu'il reste à faire — nécessite ton intervention

Je n'ai pas pu aller plus loin depuis cette machine Windows : compiler et
signer une app iOS demande un Mac avec Xcode, et compiler l'APK/AAB Android
demande Android Studio (aucun des deux n'est installé ici).

### 1. Comptes développeur (à créer si pas déjà fait)
- **Google Play Console** : 25 $ (paiement unique) — https://play.google.com/console
- **Apple Developer Program** : 99 $/an — https://developer.apple.com/programs/

### 2. Build Android
- Installer [Android Studio](https://developer.android.com/studio)
- Ouvrir le dossier `mobile-app/android/` dans Android Studio
- `Build > Generate Signed Bundle / APK` → créer un keystore (à conserver
  précieusement, indispensable pour toute mise à jour future de l'app)
- Uploader le `.aab` généré sur Google Play Console

### 3. Build iOS
- Sur un Mac avec [Xcode](https://apps.apple.com/app/xcode/id497799835) :
  `npx cap open ios` (depuis `mobile-app/`) pour ouvrir le projet
- Renseigner ton compte Apple Developer dans Xcode (Signing & Capabilities)
- `Product > Archive` puis envoyer vers App Store Connect
- Pas de Mac disponible ? Des services cloud (Codemagic, GitHub Actions avec
  runner macOS, MacStadium) permettent de builder à distance sans Mac
  physique — je peux t'aider à configurer ça si besoin.

### 4. Assets pour la fiche store (obligatoires)
- Captures d'écran de l'app sur téléphone (au moins 2-3 par store)
- Description courte/longue, mots-clés
- Politique de confidentialité (déjà en ligne : `politique-confidentialite.html`)
- Catégorie : Style de vie / Santé et bien-être selon les stores

### 5. Point d'attention Apple — paiement in-app
Apple impose ses propres achats intégrés (In-App Purchase) pour tout contenu
ou service **numérique** consommé dans l'app (règle 3.1.1 des App Store
Review Guidelines). La précommande de l'Oracle physique n'est pas concernée
(bien matériel, Stripe reste utilisable), mais l'abonnement Tore en ligne
(service numérique) risque un rejet à la revue si Apple le considère comme
tel. Deux options si ça arrive : basculer l'écran "Devenir abonné" en lien
externe uniquement pour iOS (l'utilisateur souscrit depuis un navigateur, pas
dans l'app), ou intégrer StoreKit pour les abonnements sur iOS uniquement.
Android (Google Play) est plus permissif sur ce point, Stripe direct passe
généralement sans problème.

## Commandes utiles

```bash
cd mobile-app
npx cap sync              # après toute modif de capacitor.config.json ou www/
npx cap open android       # ouvre Android Studio (si installé)
npx cap open ios           # ouvre Xcode (Mac uniquement)
```
