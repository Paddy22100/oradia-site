// js/member-i18n.js
// Traduction anglaise de l'espace membre (member/*.html, dont /inscription).
//
// Les pages membres existent en un seul exemplaire (français). Pour un visiteur
// anglais, ce script traduit l'interface à la volée : textes statiques, textes
// injectés par le JS (MutationObserver), alert/confirm/prompt, dates (fr-FR → en-GB)
// et liens vers les pages publiques (→ leur version /en/).
//
// Langue retenue (localStorage 'oradia_lang') :
//   1. ?lang=en / ?lang=fr dans l'URL (liens des pages /en/ et des emails anglais) ;
//   2. returnTo pointant vers /en/… (ex. /member/login.html?returnTo=%2Fen%2Ftore.html) ;
//   3. page précédente du site : /en/… → en, page publique française → fr ;
//   4. sinon la dernière langue retenue, français par défaut.
//
// Ne traduit JAMAIS les valeurs envoyées au serveur (value des <option>, data-*) :
// seulement les libellés affichés. Le contenu saisi (textarea, input) n'est pas touché.
(function () {
  'use strict';
  var KEY = 'oradia_lang';

  function detectLang() {
    var params, stored = null;
    try { stored = localStorage.getItem(KEY); } catch (e) {}
    try { params = new URLSearchParams(location.search); } catch (e) { params = null; }
    var explicit = params && params.get('lang');
    if (explicit === 'en' || explicit === 'fr') return explicit;
    var ret = params && (params.get('returnTo') || params.get('redirect'));
    if (ret && /^\/?en\//.test(ret)) return 'en';
    try {
      if (document.referrer) {
        var ref = new URL(document.referrer);
        if (ref.origin === location.origin) {
          if (/^\/en(\/|$)/.test(ref.pathname)) return 'en';
          if (!/^\/(member|admin|api|inscription|connexion)(\/|$|\.)/.test(ref.pathname)) return 'fr';
        }
      }
    } catch (e) {}
    return stored === 'en' ? 'en' : 'fr';
  }

  var lang = detectLang();
  try { localStorage.setItem(KEY, lang); } catch (e) {}
  window.ORADIA_LANG = lang;
  if (lang !== 'en') return;

  document.documentElement.lang = 'en';
  // Masque la page le temps de la première traduction (évite un flash de français).
  var hide = document.createElement('style');
  hide.id = 'oradia-i18n-hide';
  hide.textContent = 'body{visibility:hidden!important}';
  (document.head || document.documentElement).appendChild(hide);
  function reveal() { var h = document.getElementById('oradia-i18n-hide'); if (h) h.remove(); }
  setTimeout(reveal, 1500);

  // ── Dictionnaire (clé = texte français normalisé : espaces fusionnés, ’ → ') ──
  var D = {
    // Titres de pages
    'Abonnements - ORADIA': 'Subscriptions - ORADIA',
    'Espace Membre - ORADIA': 'Member Area - ORADIA',
    'Connexion — ORADIA': 'Log in — ORADIA',
    'Paramètres - ORADIA': 'Settings - ORADIA',
    'Mes Précommandes - ORADIA': 'My Pre-orders - ORADIA',
    'Mon Profil - ORADIA': 'My Profile - ORADIA',
    'Créer mon espace — ORADIA': 'Create my space — ORADIA',
    'Nouveau mot de passe - ORADIA': 'New password - ORADIA',
    'Support & Retours - ORADIA': 'Support & Feedback - ORADIA',
    'Historique des Tirages - ORADIA': 'Draw History - ORADIA',
    'Créez votre espace membre ORADIA pour accéder à vos tirages et gérer votre abonnement.': 'Create your ORADIA member space to access your draws and manage your subscription.',

    // Navigation / en-tête / barre latérale
    'Espace membre': 'Member area',
    'Espace Membre': 'Member Area',
    'Accueil': 'Home',
    'Déconnexion': 'Log out',
    'Tableau de bord': 'Dashboard',
    'Mes tirages': 'My draws',
    'Mes Tirages': 'My Draws',
    'Mon profil': 'My profile',
    'Paramètres': 'Settings',
    'Abonnements': 'Subscriptions',
    'Votre avis & Contact': 'Feedback & Contact',
    'Faire un tirage Tore': 'Do a Tore draw',
    'Faire un tirage': 'Do a draw',
    'Tirages': 'Draws',
    'Profil': 'Profile',
    'Params': 'Settings',
    'Précommandes': 'Pre-orders',
    'Historique des tirages': 'Draw history',
    "← Retour à l'accueil": '← Back to home',
    "Retour à l'accueil": 'Back to home',
    'Cher Membre': 'Dear Member',
    'Membre': 'Member',
    'Bienvenue,': 'Welcome,',
    'Êtes-vous sûr de vouloir vous déconnecter de votre espace ?': 'Are you sure you want to log out of your space?',
    'Annuler': 'Cancel',
    'Se déconnecter': 'Log out',
    'Fermer': 'Close',
    'Retour': 'Back',
    'Continuer': 'Continue',
    'Confirmer': 'Confirm',
    'Enregistrer': 'Save',
    'Sauvegarder': 'Save',
    'Sauvegardé': 'Saved',
    'Chargement…': 'Loading…',
    'Chargement...': 'Loading...',
    'Copier': 'Copy',
    'Partager': 'Share',
    'Envoyer': 'Send',
    'Redirection…': 'Redirecting…',
    'Enregistrement…': 'Saving…',
    'Enregistrement...': 'Saving...',
    'Envoi…': 'Sending…',
    'Erreur': 'Error',
    'Réessayez.': 'Please try again.',
    'Erreur réseau.': 'Network error.',
    'Erreur réseau. Veuillez réessayer.': 'Network error. Please try again.',
    'Erreur réseau, réessayez dans un instant.': 'Network error, please try again in a moment.',
    'Erreur réseau, réessaie.': 'Network error, please try again.',
    'Une erreur est survenue.': 'An error occurred.',
    'Une erreur est survenue, réessaie.': 'An error occurred, please try again.',
    'Veuillez remplir tous les champs.': 'Please fill in all fields.',
    'Erreur de connexion. Veuillez réessayer.': 'Login error. Please try again.',
    'Erreur de connexion. Réessayez.': 'Connection error. Please try again.',
    'Non authentifié.': 'Not authenticated.',
    'Session expirée.': 'Session expired.',
    'Session expirée': 'Session expired',
    'Date de naissance invalide': 'Invalid date of birth',
    'Email invalide': 'Invalid email',

    // Messages renvoyés par le serveur (api/auth, api/tirages, api/support, abonnement)
    'Email ou mot de passe incorrect': 'Incorrect email or password',
    'Email et mot de passe requis': 'Email and password required',
    'Email requis': 'Email required',
    'Message et email requis': 'Message and email required',
    'Erreur serveur': 'Server error',
    'Configuration serveur manquante': 'Server configuration missing',
    'Session expirée, reconnectez-vous': 'Session expired, please log in again',
    'Session expirée, reconnexion requise': 'Session expired, please log in again',
    'Session invalide ou expirée.': 'Invalid or expired session.',
    'Authentification requise.': 'Authentication required.',
    'Non autorisé': 'Not authorised',
    'Trop de tentatives de connexion. Veuillez réessayer dans une minute.': 'Too many login attempts. Please try again in a minute.',
    'Trop de demandes de réinitialisation. Veuillez réessayer dans quelques minutes.': 'Too many reset requests. Please try again in a few minutes.',
    'Aucun abonnement Stripe trouvé pour ce compte': 'No Stripe subscription found for this account',
    'Aucun abonnement en cours à modifier': 'No current subscription to change',
    'Fonctionnalité réservée aux abonnés Tore.': 'Feature reserved for Tore subscribers.',
    'Fréquence invalide.': 'Invalid frequency.',
    'Jour de la semaine invalide.': 'Invalid day of the week.',
    'Jour du mois invalide (1 à 28).': 'Invalid day of the month (1 to 28).',
    'Heure invalide.': 'Invalid time.',
    'Intention requise (500 caractères maximum).': 'Intention required (500 characters maximum).',
    'Impossible de récupérer la planification.': 'Unable to load the schedule.',
    "Impossible d'enregistrer la planification.": 'Unable to save the schedule.',
    'Impossible de supprimer la planification.': 'Unable to delete the schedule.',
    'Impossible de mettre à jour le tirage.': 'Unable to update the draw.',
    'Une erreur est survenue lors de la création de la session': 'An error occurred while creating the session',
    // Connexion (login + formulaires de connexion intégrés)
    'Connexion': 'Log in',
    'Retrouvez votre espace intérieur': 'Return to your inner space',
    'Connectez-vous pour accéder': 'Log in to access',
    'à vos abonnements': 'your subscriptions',
    'Votre adresse email': 'Your email address',
    'Mot de passe': 'Password',
    'Entrer': 'Enter',
    'Email': 'Email',
    'votre@email.com': 'your@email.com',
    'Se souvenir de moi': 'Remember me',
    'Mot de passe oublié ?': 'Forgot your password?',
    'Se connecter': 'Log in',
    'Se connecter →': 'Log in →',
    "Entrez le code de votre application d'authentification": 'Enter the code from your authenticator app',
    'Code à 6 chiffres': '6-digit code',
    'Vérifier': 'Verify',
    '← Retour à la connexion': '← Back to login',
    'Vous vous êtes connecté(e) avec un mot de passe provisoire. Choisissez votre mot de passe définitif pour continuer.': 'You logged in with a temporary password. Choose your permanent password to continue.',
    'Nouveau mot de passe': 'New password',
    'Confirmer le mot de passe': 'Confirm password',
    'Définir mon mot de passe': 'Set my password',
    'Réinitialiser le mot de passe': 'Reset password',
    'Entrez votre adresse email. Vous recevrez un lien pour choisir un nouveau mot de passe.': 'Enter your email address. You will receive a link to choose a new password.',
    'Envoyer le lien': 'Send the link',
    'Email ou mot de passe incorrect.': 'Incorrect email or password.',
    'Identifiants incorrects.': 'Incorrect credentials.',
    'Connexion réussie ! Redirection…': 'Logged in! Redirecting…',
    'Connexion…': 'Logging in…',
    'Le code doit contenir 6 chiffres.': 'The code must contain 6 digits.',
    'Vérification…': 'Verifying…',
    'Code incorrect ou expiré.': 'Incorrect or expired code.',
    'Erreur de vérification.': 'Verification error.',
    'Le mot de passe doit faire au moins 6 caractères.': 'The password must be at least 6 characters long.',
    'Les mots de passe ne correspondent pas.': 'Passwords do not match.',
    'Session expirée, veuillez vous reconnecter.': 'Session expired, please log in again.',
    'Erreur lors de la mise à jour du mot de passe.': 'Error while updating the password.',
    'Veuillez entrer votre email.': 'Please enter your email.',
    'Si cet email existe, un lien vous a été envoyé.': 'If this email exists, a link has been sent to you.',
    'Email envoyé ✓': 'Email sent ✓',

    // Nouveau mot de passe (reset-password)
    'Choisissez un nouveau mot de passe pour votre espace.': 'Choose a new password for your space.',
    'Erreur lors de la mise à jour.': 'Error while updating.',
    'Mot de passe mis à jour ! Redirection…': 'Password updated! Redirecting…',

    // Inscription (/inscription)
    'Créer mon espace membre': 'Create my member space',
    'Commencez votre voyage intérieur': 'Begin your inner journey',
    'Vos informations': 'Your details',
    'Sécurité du compte': 'Account security',
    'Finalisation': 'Final step',
    "Créez simplement votre mot de passe ci-dessous — aucune carte bancaire n'est demandée.": 'Simply create your password below — no credit card required.',
    'Prénom': 'First name',
    'Jean': 'John',
    'Nom': 'Last name',
    'Dupont': 'Smith',
    'Adresse email': 'Email address',
    '8 car. min': '8 char. min',
    '1 majuscule': '1 uppercase',
    '1 chiffre': '1 digit',
    'Mots de passe identiques': 'Passwords match',
    'Recevoir les inspirations Oradia par email': 'Receive Oradia inspirations by email',
    '(désabonnement libre)': '(unsubscribe anytime)',
    "J'accepte les CGU, CGV et la politique de confidentialité": 'I accept the Terms of Use, Terms of Sale and the privacy policy',
    "J'accepte les": 'I accept the',
    'CGU': 'Terms of Use',
    'CGV': 'Terms of Sale',
    'et la': 'and the',
    'politique de confidentialité': 'privacy policy',
    'Créer mon espace': 'Create my space',
    'En créant un compte, vous acceptez nos': 'By creating an account, you accept our',
    'et': 'and',
    'Déjà membre ?': 'Already a member?',
    'Retrouvez votre espace et vos tirages Oradia': 'Find your space and your Oradia draws',
    'Accès à tous vos tirages': 'Access to all your draws',
    'Historique et suivi': 'History and follow-up',
    "Accès complet à l'expérience du Tore": 'Full access to the Tore experience',
    '2 tirages gratuits pour découvrir le Tore': '2 free draws to discover the Tore',
    'Inspirations mensuelles': 'Monthly inspirations',
    'Veuillez remplir Prénom, Nom et Email.': 'Please fill in First name, Last name and Email.',
    'Email invalide.': 'Invalid email.',
    'Le mot de passe ne respecte pas les critères.': 'The password does not meet the requirements.',
    "Vous avez 1 mois offert sur l'abonnement Tore !": 'You have 1 free month on the Tore subscription!',
    "Vous devez accepter les conditions d'utilisation.": 'You must accept the terms of use.',
    'Création en cours…': 'Creating…',
    'Erreur lors de la création du compte': 'Error while creating the account',
    'Espace créé avec succès ! Bienvenue.': 'Space created successfully! Welcome.',
    'Nom trop court (minimum 2 caractères)': 'Name too short (minimum 2 characters)',
    'Nom contient des caractères invalides': 'Name contains invalid characters',
    'Contenu invalide détecté': 'Invalid content detected',

    // Tableau de bord
    'Votre espace intérieur ORADIA.': 'Your ORADIA inner space.',
    'Mon abonnement': 'My subscription',
    'Faire un don': 'Make a donation',
    'Oracle Oradia — Précommandes ouvertes': 'Oradia Oracle — Pre-orders open',
    "L'Oracle Oradia en version physique": 'The Oradia Oracle as a physical deck',
    'Précommandez le jeu de cartes et soutenez la naissance de cet outil de transformation.': 'Pre-order the card deck and support the birth of this transformation tool.',
    'Précommander': 'Pre-order',
    'Offrez un tirage à un proche': 'Gift a draw to someone close',
    'La personne qui utilise votre lien reçoit un tirage gratuit — et vous aussi.': 'The person who uses your link gets a free draw — and so do you.',
    'Derniers tirages': 'Latest draws',
    "Aucun tirage enregistré pour l'instant.": 'No draws saved yet.',
    'Commencer un tirage': 'Start a draw',
    'Voir le détail complet': 'See full details',

    // Abonnements
    "Votre abonnement a expiré ou le paiement n'a pas abouti": 'Your subscription has expired or the payment failed',
    "Mettez à jour votre moyen de paiement ou réabonnez-vous ci-dessous pour retrouver l'accès complet aux tirages.": 'Update your payment method or resubscribe below to regain full access to draws.',
    "L'Abonnement Tore": 'The Tore Subscription',
    "L'abonnement Tore": 'The Tore subscription',
    "Accédez à l'expérience complète du Tore — accès complet aux tirages et analyses approfondies.": 'Access the complete Tore experience — full access to draws and in-depth analyses.',
    'Votre abonnement actuel': 'Your current subscription',
    'Formule': 'Plan',
    'Gratuite': 'Free',
    'Accès limité aux fonctionnalités de base': 'Limited access to basic features',
    'Prochaine facturation': 'Next billing',
    'Renouvellement automatique': 'Automatic renewal',
    'Votre abonnement se renouvelle automatiquement chaque mois.': 'Your subscription renews automatically every month.',
    'Actif': 'Active',
    'Activer / désactiver le renouvellement': 'Turn renewal on / off',
    'Le Tore': 'The Tore',
    '/mois': '/month',
    'Résiliable à tout moment': 'Cancel anytime',
    'par défaut — vous pouvez le désactiver à tout moment depuis votre espace membre': 'by default — you can turn it off at any time from your member area',
    "Accès complet à l'expérience chaque mois": 'Full access to the experience every month',
    "Code d'accès personnel reçu par email": 'Personal access code sent by email',
    'Analyses approfondies des cartes': 'In-depth card analyses',
    'Accès immédiat dès le paiement': 'Immediate access upon payment',
    "S'abonner — 8€/mois": 'Subscribe — €8/month',
    'Questions fréquentes': 'Frequently asked questions',
    'Quelles méthodes de paiement sont acceptées ?': 'Which payment methods are accepted?',
    'Nous acceptons les cartes bancaires (Visa, MasterCard). Tous les paiements sont sécurisés via notre partenaire Stripe.': 'We accept bank cards (Visa, MasterCard). All payments are secured by our partner Stripe.',
    'Puis-je annuler mon abonnement ?': 'Can I cancel my subscription?',
    "Oui, vous pouvez annuler à tout moment sans frais depuis cette page en désactivant le renouvellement automatique. Vous conservez l'accès jusqu'à la fin de la période en cours.": 'Yes, you can cancel at any time free of charge from this page by turning off automatic renewal. You keep access until the end of the current period.',
    'Comment annuler mon abonnement étape par étape ?': 'How do I cancel my subscription step by step?',
    'Pour annuler, suivez ces étapes simples :': 'To cancel, follow these simple steps:',
    'Connectez-vous à votre espace membre.': 'Log in to your member area.',
    'Rendez-vous dans la section': 'Go to the section',
    'Dans le bloc': 'In the block',
    ', désactivez le toggle.': ', turn off the toggle.',
    "Confirmez la désactivation dans la fenêtre qui s'ouvre.": 'Confirm in the window that opens.',
    "Votre accès reste actif jusqu'à la fin de la période déjà payée. Aucun remboursement au prorata n'est effectué. Si vous rencontrez un problème, contactez le support via": 'Your access remains active until the end of the period already paid. No prorated refund is made. If you run into a problem, contact support via',
    'cette page': 'this page',
    'Abonnement Tore actif': 'Tore subscription active',
    'Accès complet aux tirages et analyses approfondies': 'Full access to draws and in-depth analyses',
    'Non renouvelé': 'Not renewed',
    'Mensuel automatique': 'Monthly, automatic',
    'Abonnement : paiement non abouti': 'Subscription: payment failed',
    'Abonnement: Gratuit': 'Subscription: Free',
    'Paiement à corriger': 'Payment to fix',
    'Votre dernier prélèvement a échoué': 'Your last payment failed',
    'Le Tore — Actif': 'The Tore — Active',
    'Accès complet aux tirages et fonctionnalités premium': 'Full access to draws and premium features',
    'Paiement non abouti': 'Payment failed',
    "Votre dernier prélèvement pour l'abonnement Tore n'a pas pu être effectué. Mettez à jour votre moyen de paiement pour reprendre l'accès — votre abonnement reste le même.": 'Your last payment for the Tore subscription could not be processed. Update your payment method to regain access — your subscription stays the same.',
    'Corriger mon moyen de paiement': 'Fix my payment method',
    'Vous serez redirigé vers une page sécurisée Stripe': 'You will be redirected to a secure Stripe page',
    "L'Oracle vous attend": 'The Oracle awaits you',
    "Votre abonnement Tore est terminé. Retrouvez votre accès complet à l'expérience et reprenez votre chemin intérieur.": 'Your Tore subscription has ended. Regain full access to the experience and resume your inner path.',
    "« Ce qui s'est transmué ne disparaît pas — il attend que vous reveniez. »": '“What has been transmuted does not disappear — it waits for you to return.”',
    'Se réabonner — 8€/mois': 'Resubscribe — €8/month',
    'Renouvellement automatique — annulable à tout moment': 'Automatic renewal — cancel anytime',
    'Désactivé': 'Off',
    'Votre abonnement se renouvelle automatiquement chaque mois. Vous serez informé par e-mail quelques jours avant chaque échéance.': 'Your subscription renews automatically every month. You will be notified by email a few days before each renewal.',
    "Le renouvellement est désactivé. Votre accès sera maintenu jusqu'à la fin de la période en cours, puis s'arrêtera.": 'Renewal is turned off. Your access will continue until the end of the current period, then stop.',
    "Désactiver le renouvellement ? Votre abonnement s'arrêtera à la fin de la période en cours (aucun nouveau prélèvement), et vous gardez l'accès jusque-là.": 'Turn off renewal? Your subscription will stop at the end of the current period (no further payment), and you keep access until then.',
    'Votre session a expiré : reconnectez-vous puis réessayez.': 'Your session has expired: log in again and retry.',
    'Automatique (mensuel)': 'Automatic (monthly)',
    'Renouvellement automatique activé': 'Automatic renewal on',
    'Renouvellement automatique désactivé': 'Automatic renewal off',
    "Votre dernier paiement n'a pas abouti": 'Your last payment failed',
    "Mettez à jour votre moyen de paiement ci-dessous pour reprendre l'accès complet aux tirages — votre abonnement reste le même.": 'Update your payment method below to regain full access to draws — your subscription stays the same.',
    'Votre abonnement a expiré ou a été résilié': 'Your subscription has expired or was cancelled',
    "Réabonnez-vous ci-dessous pour retrouver l'accès complet aux tirages.": 'Resubscribe below to regain full access to draws.',
    'Abonnement activé ! Votre code arrive par email.': 'Subscription activated! Your code is on its way by email.',
    'Tore Premium': 'Tore Premium',

    // Paramètres
    "Gérez vos préférences de communication et d'affichage.": 'Manage your communication and display preferences.',
    'Emails': 'Emails',
    'Tirage du dimanche': 'Sunday draw',
    "Un tirage thématique de l'Oracle envoyé chaque dimanche, en lien avec la situation astrologique du moment.": "A themed Oracle draw sent every Sunday, linked to the current astrological situation.",
    'Newsletter du mercredi': 'Wednesday newsletter',
    "Réflexions et guidance autour de l'oracle, un email hebdomadaire envoyé chaque mercredi.": 'Reflections and guidance around the oracle, a weekly email sent every Wednesday.',
    'Actualités et offres': 'News and offers',
    'Actualités, nouveautés, promotions et offres ponctuelles sur les produits Oradia.': 'News, new releases, promotions and occasional offers on Oradia products.',
    'Lettres Synchronicités': 'Synchronicity letters',
    "Quelques jours après un tirage, un e-mail pour noter les événements de votre quotidien en lien avec les cartes tirées. Non envoyé si vous avez activé une fenêtre d'observation pour ce tirage, qui pose déjà cette question à sa clôture.": 'A few days after a draw, an email to note the events of your daily life related to the cards drawn. Not sent if you activated an observation window for that draw, which already asks this question when it closes.',
    'Notifications': 'Notifications',
    "Fin de fenêtre d'observation": 'End of observation window',
    "Un rappel sur votre téléphone au moment où votre fenêtre d'observation se referme, pour noter ce que vous avez remarqué.": 'A reminder on your phone when your observation window closes, to note what you noticed.',
    "Préférences d'affichage": 'Display preferences',
    'Fuseau horaire': 'Time zone',
    'Authentification à deux facteurs (2FA)': 'Two-factor authentication (2FA)',
    "Code d'authentification (TOTP)": 'Authentication code (TOTP)',
    'Scannez ce QR code avec votre application (Google Authenticator, Authy…) puis entrez le code à 6 chiffres pour confirmer.': 'Scan this QR code with your app (Google Authenticator, Authy…) then enter the 6-digit code to confirm.',
    'QR Code 2FA': '2FA QR code',
    'Ou entrez ce code manuellement :': 'Or enter this code manually:',
    'Activer la 2FA': 'Enable 2FA',
    'Désactiver la 2FA': 'Disable 2FA',
    'Zone de danger': 'Danger zone',
    'Supprimer mon compte': 'Delete my account',
    'Cette action est irréversible. Tous vos tirages, préférences et données personnelles seront définitivement supprimés.': 'This action cannot be undone. All your draws, preferences and personal data will be permanently deleted.',
    "Votre compte est protégé par un code d'authentification.": 'Your account is protected by an authentication code.',
    'Activée': 'Enabled',
    'Ajoutez une couche de sécurité supplémentaire à votre compte.': 'Add an extra layer of security to your account.',
    'Désactivée': 'Disabled',
    'Reconnectez-vous pour gérer la 2FA.': 'Log in again to manage 2FA.',
    'Erreur lors de la génération du QR code.': 'Error while generating the QR code.',
    'Entrez le code à 6 chiffres.': 'Enter the 6-digit code.',
    'Code incorrect. Réessayez.': 'Incorrect code. Please try again.',
    'La 2FA est maintenant activée sur votre compte.': '2FA is now enabled on your account.',
    'Désactiver la 2FA ? Votre compte sera moins sécurisé.': 'Disable 2FA? Your account will be less secure.',
    'La 2FA a été désactivée.': '2FA has been disabled.',
    'Impossible de désactiver la 2FA.': 'Unable to disable 2FA.',
    'Êtes-vous absolument sûr de vouloir supprimer votre compte ? Cette action est irréversible. Toutes vos données seront définitivement supprimées.': 'Are you absolutely sure you want to delete your account?\n\nThis action cannot be undone. All your data will be permanently deleted.',
    'Confirmez avec votre mot de passe :': 'Confirm with your password:',
    'La suppression de compte sera disponible prochainement. Contactez le support si nécessaire.': 'Account deletion will be available soon. Contact support if needed.',

    // Précommandes
    'Mes Précommandes': 'My Pre-orders',
    "Suivez l'état de vos précommandes et recevez les mises à jour de production.": 'Track the status of your pre-orders and receive production updates.',
    'Précommandes totales': 'Total pre-orders',
    'Payées': 'Paid',
    'En attente': 'Pending',
    'Montant total': 'Total amount',
    'Payée': 'Paid',
    'Commande:': 'Order:',
    'Date:': 'Date:',
    'Paiement:': 'Payment:',
    'Carte bancaire': 'Bank card',
    'Suivi de production': 'Production tracking',
    'Commande confirmée': 'Order confirmed',
    'Votre précommande a été confirmée et le paiement a été accepté.': 'Your pre-order has been confirmed and the payment accepted.',
    'Clôture des précommandes': 'Pre-orders close',
    '31 décembre 2026': '31 December 2026',
    'Les précommandes se clôturent, la production peut alors être lancée.': 'Pre-orders close, and production can then begin.',
    'En production': 'In production',
    'Prévu: courant janvier 2027': 'Planned: during January 2027',
    'Impression des cartes et fabrication des boîtes en cours.': 'Card printing and box manufacturing in progress.',
    'Expédition': 'Shipping',
    'Prévu: mi-février 2027': 'Planned: mid-February 2027',
    'Votre oracle sera expédié et vous recevrez un numéro de suivi.': 'Your oracle will be shipped and you will receive a tracking number.',
    'Adresse de livraison': 'Delivery address',
    "Modifier l'adresse": 'Change address',
    'En attente de paiement': 'Awaiting payment',
    'Finaliser le paiement': 'Complete payment',
    "Détails de l'offre Collector": 'Collector offer details',
    'Contenu inclus': 'Included',
    'Oracle ORADIA complet (78 cartes)': 'Complete ORADIA Oracle (78 cards)',
    "Livret d'accompagnement dédicacé": 'Signed companion booklet',
    'Boîte de collection numérotée': 'Numbered collector box',
    'Pièce de collection exclusive': 'Exclusive collector coin',
    'Plateau de tirage en bois': 'Wooden draw board',
    "Certificat d'authenticité": 'Certificate of authenticity',
    'Avantages Collector': 'Collector benefits',
    'Numéro de série unique': 'Unique serial number',
    'Livraison prioritaire': 'Priority delivery',
    'Emballage premium': 'Premium packaging',
    'Dédicace personnalisée': 'Personalised dedication',
    'Accès VIP aux bonus': 'VIP access to bonuses',
    'Paiement en attente': 'Payment pending',
    "Votre commande est en attente de paiement. Veuillez finaliser le paiement pour valider votre précommande. Vous avez jusqu'au 31 décembre 2026 pour compléter votre commande.": 'Your order is awaiting payment. Please complete the payment to confirm your pre-order. You have until 31 December 2026 to complete your order.',
    "Besoin d'aide ?": 'Need help?',
    'Notre équipe est à votre disposition pour répondre à toutes vos questions sur vos précommandes.': 'Our team is available to answer all your questions about your pre-orders.',
    'Contacter le support': 'Contact support',
    'Voir la FAQ': 'See the FAQ',
    "Fonctionnalité de modification d'adresse à implémenter": 'Address change is not available yet',

    // Profil
    'Mon compte': 'My account',
    'Date de naissance': 'Date of birth',
    'Tirages enregistrés': 'Saved draws',
    'Mes informations de naissance': 'My birth details',
    'Optionnel — utilisé pour de futures analyses personnalisées (astrologie, etc.)': 'Optional — used for future personalised analyses (astrology, etc.)',
    'Lieu de naissance': 'Place of birth',
    'Ville, Pays': 'City, Country',
    'Modifier mon adresse e-mail': 'Change my email address',
    'Nouvel e-mail': 'New email',
    'nouveau@email.com': 'new@email.com',
    'Confirmer le nouvel e-mail': 'Confirm the new email',
    'Mot de passe actuel': 'Current password',
    '(requis pour confirmer)': '(required to confirm)',
    "Mettre à jour l'e-mail": 'Update email',
    'Ajoutez une couche de sécurité supplémentaire. À chaque connexion, un code vous sera demandé en plus de votre mot de passe.': 'Add an extra layer of security. At each login, a code will be requested in addition to your password.',
    'Non activée': 'Not enabled',
    'Configurer': 'Set up',
    'La configuration 2FA par application (TOTP) sera disponible prochainement. Vous serez notifié par e-mail lors de son activation.': 'App-based 2FA (TOTP) setup will be available soon. You will be notified by email when it is enabled.',
    'Activer via application': 'Enable via app',
    'Bientôt disponible': 'Coming soon',
    'Changer mon mot de passe': 'Change my password',
    '8 caractères minimum': '8 characters minimum',
    'Confirmer le nouveau mot de passe': 'Confirm the new password',
    'Changer le mot de passe': 'Change password',
    'Nouveau tirage': 'New draw',
    'Gérer mon abonnement': 'Manage my subscription',
    'Les deux adresses e-mail ne correspondent pas.': 'The two email addresses do not match.',
    'Adresse e-mail invalide.': 'Invalid email address.',
    'E-mail mis à jour avec succès. Un e-mail de confirmation a été envoyé.': 'Email updated successfully. A confirmation email has been sent.',
    'Le nouveau mot de passe doit contenir au moins 8 caractères.': 'The new password must contain at least 8 characters.',
    'Mot de passe modifié avec succès.': 'Password changed successfully.',
    'Mot de passe actuel incorrect.': 'Current password incorrect.',
    '✓ Informations enregistrées.': '✓ Details saved.',
    "Erreur lors de l'enregistrement.": 'Error while saving.',

    // Support
    'au support': 'to support',
    "Une question ? Un témoignage à partager ? Une idée d'amélioration ? Écrivez-moi directement.": 'A question? A testimonial to share? An idea for improvement? Write to me directly.',
    'Témoignage': 'Testimonial',
    'Suggestion': 'Suggestion',
    'Me contacter': 'Contact me',
    'Un problème technique, une question sur votre abonnement ou votre compte ? Je vous réponds personnellement sous 24–48h.': 'A technical problem, a question about your subscription or your account? I reply personally within 24–48h.',
    'Sujet': 'Subject',
    '— Choisir un sujet —': '— Choose a subject —',
    'Question sur mon abonnement': 'Question about my subscription',
    'Problème de paiement': 'Payment problem',
    'Problème technique': 'Technical problem',
    'Autre': 'Other',
    'Message': 'Message',
    'Décrivez votre problème ou question...': 'Describe your problem or question...',
    'Réponse personnelle sous 24–48h.': 'Personal reply within 24–48h.',
    'Contact direct': 'Direct contact',
    'Vous pouvez aussi écrire directement à': 'You can also write directly to',
    'Partager votre témoignage': 'Share your testimonial',
    "Votre retour d'expérience est précieux. Il peut inspirer d'autres personnes en chemin et nourrir le développement d'Oradia.": 'Your feedback is precious. It can inspire others on their path and nourish the development of Oradia.',
    'Votre expérience avec Oradia': 'Your experience with Oradia',
    'Racontez ce que les tirages ont mis en lumière pour vous, une prise de conscience, un changement remarqué...': 'Tell us what the draws brought to light for you, a realisation, a change you noticed...',
    'Autorisation de publication': 'Permission to publish',
    '(optionnel)': '(optional)',
    'Anonyme': 'Anonymous',
    'Avec mon prénom': 'With my first name',
    'Ne pas publier': 'Do not publish',
    'Suggérer une amélioration': 'Suggest an improvement',
    'Oradia est un outil vivant. Vos idées participent à son évolution — une fonctionnalité manquante, une interface à améliorer, une nouvelle forme de tirage…': 'Oradia is a living tool. Your ideas contribute to its evolution — a missing feature, an interface to improve, a new kind of draw…',
    'Catégorie': 'Category',
    '— Choisir —': '— Choose —',
    'Interface / Expérience utilisateur': 'Interface / User experience',
    'Nouveaux types de tirages': 'New types of draws',
    'Contenu des interprétations': 'Interpretation content',
    'Nouvelle fonctionnalité': 'New feature',
    'Votre idée': 'Your idea',
    'Décrivez votre idée ou suggestion...': 'Describe your idea or suggestion...',
    'Message envoyé. Je vous réponds sous 24–48h.': 'Message sent. I will reply within 24–48h.',
    "Merci pour votre témoignage — il nourrit le chemin d'Oradia.": 'Thank you for your testimonial — it nourishes the path of Oradia.',
    'Suggestion reçue, merci pour votre contribution !': 'Suggestion received, thank you for your contribution!',

    // Historique des tirages
    'Aucun tirage enregistré': 'No draws saved',
    'Bilan de parcours': 'Journey review',
    'Ce que révèlent vos tirages pris ensemble, sur la durée.': 'What your draws reveal taken together, over time.',
    'Générer mon bilan': 'Generate my review',
    'Mon historique de tirages': 'My draw history',
    'Tirage programmé': 'Scheduled draw',
    'Tous': 'All',
    'Ponctuels': 'One-off',
    'Programmés': 'Scheduled',
    'Programmé': 'Scheduled',
    'Un tirage, sans y penser': 'A draw, without having to think about it',
    "Reçu par email, à l'heure et la fréquence que vous choisissez": 'Received by email, at the time and frequency you choose',
    'Le tirage automatique est réservé aux abonnés Tore.': 'Automatic draws are reserved for Tore subscribers.',
    "Découvrir l'abonnement": 'Discover the subscription',
    "Recevez un tirage par email, sans y penser — avec une intention fixe, à l'heure et la fréquence de votre choix.": 'Receive a draw by email, without having to think about it — with a fixed intention, at the time and frequency of your choice.',
    'Fréquence': 'Frequency',
    'Quotidien': 'Daily',
    'Hebdo': 'Weekly',
    'Mensuel': 'Monthly',
    'Jour de la semaine': 'Day of the week',
    'Lundi': 'Monday', 'Mardi': 'Tuesday', 'Mercredi': 'Wednesday', 'Jeudi': 'Thursday',
    'Vendredi': 'Friday', 'Samedi': 'Saturday', 'Dimanche': 'Sunday',
    'Jour du mois': 'Day of the month',
    "Heure d'envoi": 'Sending time (Paris time)',
    'Tirage Tore (programmé)': 'Tore draw (scheduled)',
    'Intention fixe': 'Fixed intention',
    'Comment appréhender au mieux cette journée ?': 'How can I best approach this day?',
    "Que dois-je traverser aujourd'hui ?": 'What do I need to go through today?',
    'non authentifié (pas de session)': 'not authenticated (no session)',
    'Vous êtes': 'You are',
    'Homme': 'A man',
    'Femme': 'A woman',
    'Activer le tirage automatique': 'Activate automatic draw',
    'Désactiver': 'Deactivate',
    'Désactivation...': 'Deactivating...',
    'Enregistrer les modifications': 'Save changes',
    'Merci de saisir une intention.': 'Please enter an intention.',
    "Aucun tirage automatique actif pour l'instant.": 'No automatic draw active yet.',
    'Comment ça marche': 'How it works',
    'Le tirage se fait au générateur quantique, exactement comme sur le plateau du Tore.': 'The draw is made with the quantum generator, exactly as on the Tore board.',
    "L'Oracle génère votre analyse avec votre intention fixe.": 'The Oracle generates your analysis with your fixed intention.',
    'Vous recevez tout par email, et le tirage rejoint aussi votre historique.': 'You receive everything by email, and the draw is also added to your history.',
    "Un tirage programmé reste un tirage privé : aucune fenêtre d'observation n'est activée automatiquement en votre nom.": 'A scheduled draw remains private: no observation window is activated automatically on your behalf.',
    'Commencer mon premier tirage': 'Start my first draw',
    'Cartes passerelles': 'Bridge cards',
    'Télécharger PDF': 'Download PDF',
    'Interprétations des cartes': 'Card interpretations',
    "Analyse de l'Oracle": 'Oracle analysis',
    "Aucune analyse enregistrée pour ce tirage. Cela arrive quand le tirage a été effectué sans être connecté à ton espace membre, ou si l'analyse n'a pas été consultée jusqu'au bout au moment du tirage.": 'No analysis saved for this draw. This happens when the draw was made without being logged in to your member area, or if the analysis was not read to the end at the time of the draw.',
    'Pistes à explorer': 'Paths to explore',
    "Synthèse de l'Oracle": 'Oracle synthesis',
    'Tirage Tore': 'Tore draw',
    'Tirage': 'Draw',
    'Révéler · Transmuter · Relier': 'Reveal · Transmute · Connect',
    'Avec gratitude,': 'With gratitude,',
    "Fondateur d'Oradia": 'Founder of Oradia',
    "Le générateur de PDF n'a pas fini de charger, réessaie dans un instant.": 'The PDF generator has not finished loading, please try again in a moment.',
    'Génération…': 'Generating…',
    'Génération...': 'Generating...',
    'Le rendu du PDF a pris trop de temps.': 'Rendering the PDF took too long.',
    'Erreur génération PDF': 'PDF generation error',
    'Faire un tirage sur cette question': 'Do a draw on this question',
    'Ce qui revient': 'What keeps coming back',
    'Ce qui a bougé': 'What has shifted',
    'Une question pour la suite': 'A question for what comes next',
    "Le bilan n'a pas pu être généré, réessayez dans un instant.": 'The review could not be generated, please try again in a moment.',

    // Pied de page partagé (components/footer-template.html)
    "Restez dans l'univers ORADIA": 'Stay in the ORADIA universe',
    'Inspirations, actualités de La Boussole Intérieure et avant-premières.': 'Inspirations, news from The Inner Compass and previews.',
    'Pas de spam, désinscription en un clic.': 'No spam, unsubscribe in one click.',
    "S'inscrire à la newsletter": 'Subscribe to the newsletter',
    'En vous inscrivant, vous acceptez de recevoir la newsletter Oradia. Désinscription à tout moment.': 'By subscribing, you agree to receive the Oradia newsletter. Unsubscribe at any time.',
    'Politique de confidentialité': 'Privacy policy',
    "L'oracle qui vous accompagne sur votre chemin personnel et révèle votre essence.": 'The oracle that accompanies you on your personal path and reveals your essence.',
    'Navigation': 'Navigation',
    'Oracle': 'Oracle',
    'Guidance': 'Guidance',
    'Précommande': 'Pre-order',
    'À propos': 'About',
    'Blog': 'Blog',
    'Séances à Dinan': 'Sessions in Dinan',
    'Contact': 'Contact',
    'Légal': 'Legal',
    "Conditions Générales d'Utilisation": 'Terms of Use',
    'Conditions Générales de Vente': 'Terms of Sale',
    'Mentions Légales': 'Legal Notice',
    'Politique de Confidentialité': 'Privacy Policy',
    "Aucun traqueur publicitaire — mesure d'audience 100 % interne, sans cookie tiers": 'No advertising trackers — 100% in-house audience measurement, no third-party cookies',
    '© 2026 Oradia. Tous droits réservés.': '© 2026 Oradia. All rights reserved.',
    '✓ Merci ! Vérifie ta boîte mail pour confirmer ton inscription.': '✓ Thank you! Check your inbox to confirm your subscription.',
    'Remonter en haut': 'Back to top'
  };

  var DAYS = { dimanche: 'Sunday', lundi: 'Monday', mardi: 'Tuesday', mercredi: 'Wednesday', jeudi: 'Thursday', vendredi: 'Friday', samedi: 'Saturday' };

  // Textes avec une partie variable.
  var RULES = [
    [/^Erreur ?: ?([\s\S]*)$/, function (m) { return 'Error: ' + (D[m[1]] || m[1]); }],
    [/^Erreur lors de la création ?: ?([\s\S]*)$/, function (m) { return 'Error while creating: ' + m[1]; }],
    [/^Le changement n'a pas pu être enregistré ?: ?([\s\S]*?)\s*Réessayez, ou écrivez à contact@oradia\.fr\.?$/, function (m) { return 'The change could not be saved: ' + m[1] + '\nPlease try again, or write to contact@oradia.fr.'; }],
    [/^Le changement n'a pas pu être enregistré ?: ?([\s\S]*)$/, function (m) { return 'The change could not be saved: ' + (D[m[1]] || m[1]); }],
    [/^Non renouvelé — accès jusqu'au (.+)$/, function (m) { return 'Not renewed — access until ' + m[1]; }],
    [/^(\d+) tirages? enregistrés?$/, function (m) { return m[1] + (m[1] === '1' ? ' draw saved' : ' draws saved'); }],
    [/^Vous avez (\d+) mois offerts sur l'abonnement Tore !$/, function (m) { return 'You have ' + m[1] + ' free months on the Tore subscription!'; }],
    [/^mois offerts sur l'abonnement Tore !$/, function () { return 'free months on the Tore subscription!'; }],
    [/^Vous avez$/, function () { return 'You have'; }],
    [/^🌍 Fenêtre d'observation — (\S+) jours?(.*)$/, function (m) { return '🌍 Observation window — ' + m[1] + (m[1] === '1' ? ' day' : ' days') + m[2]; }],
    [/^Actif — tous les jours à (.+)$/, function (m) { return 'Active — every day at ' + m[1]; }],
    [/^Actif — chaque (\S+) à (.+)$/, function (m) { return 'Active — every ' + (DAYS[m[1].toLowerCase()] || m[1]) + ' at ' + m[2]; }],
    [/^Actif — le (\d+) de chaque mois à (.+)$/, function (m) { return 'Active — on day ' + m[1] + ' of each month at ' + m[2]; }],
    [/^Oracle Oradia — (.+)$/, function (m) { return 'Oradia Oracle — ' + (D[m[1]] || m[1]); }],
    [/^Le PDF n'a pas pu être généré ?: ?([\s\S]*?)(\. Réessaie dans un instant, et si ça persiste, signale ce message\.)?$/, function (m) { return 'The PDF could not be generated: ' + m[1] + (m[2] ? '. Please try again in a moment, and if it persists, report this message.' : ''); }],
    [/^Oracle La Boussole Intérieure · (.*)$/, function (m) { return 'Oracle The Inner Compass · ' + m[1]; }],
    [/^La Boussole Intérieure$/, function () { return 'The Inner Compass'; }],
    [/^\(debug: (.*)\)$/, function (m) { return '(debug: ' + (D[m[1]] || m[1]) + ')'; }]
  ];

  function norm(s) {
    return s.replace(/[  ]/g, ' ').replace(/[’]/g, "'").replace(/\s+/g, ' ').trim();
  }

  function translate(s) {
    if (!s) return null;
    var n = norm(s);
    if (!n) return null;
    if (Object.prototype.hasOwnProperty.call(D, n)) return D[n];
    for (var i = 0; i < RULES.length; i++) {
      var m = n.match(RULES[i][0]);
      if (m) return RULES[i][1](m);
    }
    return null;
  }
  window.oradiaT = function (s) { return translate(s) || s; };

  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, NOSCRIPT: 1, CODE: 1, PRE: 1 };
  var ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];

  function translateText(node) {
    var v = node.nodeValue;
    if (!v || !/[A-Za-zÀ-ÿ]/.test(v)) return;
    var t = translate(v);
    if (t != null && t !== norm(v)) {
      var lead = v.match(/^\s*/)[0], trail = v.match(/\s*$/)[0];
      node.nodeValue = lead + t + trail;
    }
  }

  function translateEl(el) {
    for (var i = 0; i < ATTRS.length; i++) {
      var a = el.getAttribute && el.getAttribute(ATTRS[i]);
      if (a) { var t = translate(a); if (t != null) el.setAttribute(ATTRS[i], t); }
    }
    // Boutons <input> : seul le libellé affiché (value) est traduit, jamais les champs de saisie.
    if (el.tagName === 'INPUT' && /^(button|submit|reset)$/i.test(el.type) && el.value) {
      var tv = translate(el.value); if (tv != null) el.value = tv;
    }
    if (el.tagName === 'A') localizeLink(el);
  }

  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) {
      if (!root.parentNode || !SKIP[root.parentNode.nodeName]) translateText(root);
      return;
    }
    if (root.nodeType !== 1 || root.hasAttribute('data-no-i18n')) return;
    if (SKIP[root.nodeName]) { if (root.nodeName === 'TEXTAREA') translateEl(root); return; }
    translateEl(root);
    var tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (n.nodeType === 1 && n.nodeName === 'TEXTAREA') { translateEl(n); return NodeFilter.FILTER_REJECT; }
        if (n.nodeType === 1 && (SKIP[n.nodeName] || n.hasAttribute('data-no-i18n'))) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var n;
    while ((n = tw.nextNode())) {
      if (n.nodeType === 3) translateText(n); else translateEl(n);
    }
  }

  // Liens vers les pages publiques → version anglaise quand elle existe.
  var EN_PAGES = { '/': '/en/', '/index.html': '/en/', '/tore.html': '/en/tore.html', '/oracle.html': '/en/oracle.html',
    '/guidance.html': '/en/guidance.html', '/a-propos.html': '/en/a-propos.html', '/contact.html': '/en/contact.html',
    '/cgu.html': '/en/cgu.html', '/cgv.html': '/en/cgv.html', '/mentions-legales.html': '/en/mentions-legales.html',
    '/politique-confidentialite.html': '/en/politique-confidentialite.html', '/cartes.html': '/en/cartes.html',
    '/blog': '/en/blog/', '/blog/': '/en/blog/', '/success-tore.html': '/en/success-tore.html' };
  function localizeLink(a) {
    var href = a.getAttribute('href');
    if (!href || /^(#|mailto:|tel:|javascript:)/i.test(href)) return;
    var u;
    try { u = new URL(href, location.href); } catch (e) { return; }
    if (u.origin !== location.origin && !/^https?:\/\/(www\.)?oradia\.fr$/i.test(u.origin)) return;
    var target = EN_PAGES[u.pathname];
    if (!target) return;
    a.setAttribute('href', target + u.search + u.hash);
  }

  // Dates : les pages formatent en 'fr-FR' → affichage anglais.
  function enLocale(l) { return (!l || /^fr/i.test(String(l))) ? 'en-GB' : l; }
  ['toLocaleDateString', 'toLocaleString', 'toLocaleTimeString'].forEach(function (fn) {
    var orig = Date.prototype[fn];
    Date.prototype[fn] = function (l, o) { return orig.call(this, enLocale(l), o); };
  });
  var origNum = Number.prototype.toLocaleString;
  Number.prototype.toLocaleString = function (l, o) { return origNum.call(this, enLocale(l), o); };

  // Boîtes de dialogue natives.
  ['alert', 'confirm'].forEach(function (fn) {
    var orig = window[fn];
    window[fn] = function (msg) { return orig.call(window, msg == null ? msg : window.oradiaT(String(msg))); };
  });
  var origPrompt = window.prompt;
  window.prompt = function (msg, def) { return origPrompt.call(window, msg == null ? msg : window.oradiaT(String(msg)), def); };

  function translateTitle() {
    var t = translate(document.title);
    if (t != null) document.title = t;
  }

  function start() {
    translateTitle();
    walk(document.body);
    reveal();
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === 'characterData') {
          if (m.target.parentNode && !SKIP[m.target.parentNode.nodeName]) translateText(m.target);
        } else if (m.type === 'attributes') {
          translateEl(m.target);
        } else {
          for (var j = 0; j < m.addedNodes.length; j++) walk(m.addedNodes[j]);
        }
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS.concat(['href', 'value']) });
    var titleEl = document.querySelector('title');
    if (titleEl) new MutationObserver(translateTitle).observe(titleEl, { childList: true, characterData: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
