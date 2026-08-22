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

## Build cloud (GitHub Actions) — pas besoin de Mac ni d'Android Studio

Deux workflows tournent automatiquement sur GitHub à chaque modification de
`mobile-app/` (ou peuvent être lancés à la main depuis l'onglet **Actions**
du dépôt GitHub) :

- **`.github/workflows/android-build.yml`** — build un APK debug installable
  directement sur un téléphone Android pour tester (aucun secret requis).
  Ajoute les secrets ci-dessous pour qu'il produise en plus un `.aab` signé,
  prêt à uploader sur Google Play Console.
- **`.github/workflows/ios-build.yml`** — compile le projet pour le
  simulateur iOS à chaque changement (aucun secret requis, confirme juste que
  ça compile). Ajoute les secrets ci-dessous pour qu'il produise en plus un
  `.ipa` signé, prêt pour TestFlight/App Store Connect.

Le résultat de chaque build (APK/AAB/IPA) apparaît en bas de la page du
run, dans l'onglet **Actions** du dépôt GitHub, sous « Artifacts » —
téléchargeable directement, aucune install locale requise.

⚠️ Les runners macOS de GitHub Actions coûtent 10x plus de minutes que les
runners Linux. Sur un dépôt privé (quota limité), ça peut consommer le forfait
gratuit assez vite si le workflow iOS tourne à chaque push — le déclencher
manuellement (`workflow_dispatch`) plutôt que sur chaque push est une option
si besoin.

### Configurer la signature Android (optionnel, pour publier sur le Play Store)
1. Générer un keystore une seule fois (à conserver précieusement, il sera
   nécessaire pour **toute** mise à jour future de l'app) :
   ```bash
   keytool -genkey -v -keystore oradia-release.keystore -alias oradia -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Dans GitHub → Settings → Secrets and variables → Actions, ajouter :
   - Secret `ANDROID_KEYSTORE_BASE64` : `base64 -w0 oradia-release.keystore` (le contenu, encodé)
   - Secret `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`
   - Variable (onglet "Variables", pas "Secrets") `HAS_ANDROID_SIGNING` = `true`

### Configurer la signature iOS (optionnel, pour publier sur l'App Store)
Nécessite un compte Apple Developer actif (99 $/an).
1. Créer un certificat de distribution (.p12) et un profil de provisionnement
   App Store depuis [developer.apple.com](https://developer.apple.com/account/resources/certificates/list)
2. Dans GitHub → Settings → Secrets and variables → Actions, ajouter :
   - Secret `IOS_CERTIFICATE_BASE64` : `base64 -w0 certificate.p12`
   - Secret `IOS_CERTIFICATE_PASSWORD` (mot de passe choisi à l'export du .p12)
   - Secret `IOS_PROVISIONING_PROFILE_BASE64` : `base64 -w0 profile.mobileprovision`
   - Secret `IOS_KEYCHAIN_PASSWORD` (un mot de passe temporaire, choisi librement)
   - Secret `IOS_TEAM_ID` (visible sur developer.apple.com, section Membership)
   - Variable `HAS_IOS_SIGNING` = `true`

Une fois l'`.ipa` récupéré depuis les Artifacts, l'envoyer vers App Store
Connect avec [Transporter](https://apps.apple.com/app/transporter/id1450874784)
(Mac App Store, gratuit) ou `xcrun altool --upload-app`.

## Comptes développeur (à créer si pas déjà fait)
- **Google Play Console** : 25 $ (paiement unique) — https://play.google.com/console
- **Apple Developer Program** : 99 $/an — https://developer.apple.com/programs/

## Alternative sans GitHub Actions
Codemagic ou MacStadium proposent aussi des builds cloud iOS/Android avec une
interface guidée (moins de configuration manuelle que ci-dessus, mais payant
au-delà d'un quota gratuit limité) — je peux aider à configurer ça à la place
si le fonctionnement par secrets GitHub est trop contraignant.

### Assets pour la fiche store (obligatoires)
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
