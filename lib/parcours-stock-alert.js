// lib/parcours-stock-alert.js
// Alerte envoyée à contact@oradia.fr quand le parcours individualisé n'a pas de
// newsletter validée pour faire avancer certains contacts (envoi du mercredi) ou
// pour la publication sociale. Sans ce signal, un manque d'étape validée ne laisse
// aucune trace visible : les contacts à jour ne reçoivent simplement rien
// (constaté le 21/10/2026, étape 14 non validée, 62 contacts bloqués à l'étape 13).

function escapeHtml(text) {
  return String(text == null ? '' : text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// blocked : [{ ordre, count, draftExists, subject }] — étapes sans version validée
// avec le nombre de contacts qui l'attendent. social : { ordre, draftExists, subject }
// ou null. phase : 'avance' (contrôle avant mercredi) ou 'cron' (après le passage).
async function sendParcoursStockAlert({ blocked = [], social = null, phase = 'avance', sent = 0 }) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || 'ORADIA';
  if (!apiKey || !senderEmail) {
    console.warn('[ParcoursStockAlert] Config Brevo manquante');
    return false;
  }
  if (blocked.length === 0 && !social) return false;

  const lines = [];
  for (const b of blocked) {
    const label = b.draftExists
      ? `étape ${b.ordre} (« ${b.subject || 'sans objet'} ») : brouillon existant, pas encore validé`
      : `étape ${b.ordre} : aucun brouillon n'existe`;
    lines.push(`${b.count} contact(s) attendent l'${label}.`);
  }
  if (social) {
    lines.push(social.draftExists
      ? `Publication Facebook / Instagram / LinkedIn : l'étape ${social.ordre} (« ${social.subject || 'sans objet'} ») n'est pas validée, aucun post ne partira.`
      : `Publication Facebook / Instagram / LinkedIn : aucun brouillon pour l'étape ${social.ordre}, aucun post ne partira.`);
  }

  const intro = phase === 'cron'
    ? `L'envoi automatique de ce mercredi est passé${sent ? ` (${sent} email(s) envoyé(s))` : ' sans rien envoyer'}, mais des contacts n'ont rien reçu faute d'étape validée.`
    : `Mercredi à 19h, des contacts n'auront rien reçu si rien n'est fait : il manque une étape validée.`;
  const action = phase === 'cron'
    ? `Validez l'étape dans le dashboard (Newsletter & Réseaux → Parcours), puis cliquez sur « Envoyer maintenant » pour rattraper ces contacts.`
    : `Validez l'étape dans le dashboard (Newsletter & Réseaux → Parcours) avant mercredi 19h : l'envoi se fera tout seul.`;

  const items = lines.map(l => `<li style="margin:0 0 8px;">${escapeHtml(l)}</li>`).join('');
  const htmlContent = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background-color:#0a192f;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a192f"><tr><td align="center" style="padding:36px 24px;">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:520px;" bgcolor="#0a192f">
<tr><td style="padding:0 0 20px;"><p style="margin:0;color:#d4af37;font-family:Georgia,serif;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;">Parcours newsletter — étape à valider</p></td></tr>
<tr><td style="padding:0 0 20px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#162230" style="background-color:#162230;border:1px solid #3a3020;border-radius:12px;"><tr><td style="padding:20px 24px;">
<p style="margin:0 0 14px;color:#e9e7df;font-family:Georgia,serif;font-size:15px;line-height:1.7;">${escapeHtml(intro)}</p>
<ul style="margin:0;padding-left:20px;color:#e9e7df;font-family:Georgia,serif;font-size:14px;line-height:1.7;">${items}</ul>
</td></tr></table></td></tr>
<tr><td><p style="margin:0;color:#8a7a52;font-family:Georgia,serif;font-size:13px;line-height:1.7;">${escapeHtml(action)}</p></td></tr>
</table></td></tr></table></body></html>`;
  const textContent = `${intro}\n\n- ${lines.join('\n- ')}\n\n${action}`;

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({
        sender: { email: senderEmail, name: senderName },
        to: [{ email: 'contact@oradia.fr' }],
        subject: phase === 'cron'
          ? '[Oradia] Parcours : des contacts n\'ont rien reçu mercredi, étape à valider'
          : '[Oradia] Parcours : une étape est à valider avant mercredi 19h',
        htmlContent,
        textContent
      })
    });
    if (!response.ok) {
      console.error('[ParcoursStockAlert] Brevo error:', response.status, await response.text().catch(() => ''));
      return false;
    }
    return true;
  } catch (err) {
    console.error('[ParcoursStockAlert] exception:', err.message);
    return false;
  }
}

module.exports = { sendParcoursStockAlert };
