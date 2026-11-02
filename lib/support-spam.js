// Filtre anti-spam du formulaire de contact (api/support.js).
//
// Constat (28/10 → 02/11/2026) : trois messages identiques, sujet « partenariat »,
// envoyés depuis des adresses jetables @prodmail.online, avec un lien vers un domaine
// différent à chaque fois (mondocs.my.id, monpartage.online, partagepro.online) et le
// même chemin /fr/com/oradia. Aucun vrai message de l'historique ne contenait de lien :
// le formulaire n'en a pas besoin, on rejette donc tout message qui en porte un.

const SPAM_EMAIL_DOMAINS = ['prodmail.online'];

const LINK_RE = /(https?:\/\/|www\.)\S+/i;
// Nom de domaine « nu » sur une extension fréquente chez les spammeurs (sans http).
const BARE_DOMAIN_RE = /\b[a-z0-9-]{3,}\.(online|my\.id|xyz|top|click|icu|buzz|site|shop|live)(\/\S*)?\b/i;

function looksLikeSpam({ message, email, name, sujet }) {
  const text = [message, name, sujet].filter(Boolean).join(' ');
  if (LINK_RE.test(text) || BARE_DOMAIN_RE.test(text)) return 'lien';
  const domain = String(email || '').split('@')[1]?.toLowerCase().trim();
  if (domain && SPAM_EMAIL_DOMAINS.includes(domain)) return 'domaine email';
  return null;
}

module.exports = { looksLikeSpam };
