// lib/facture-email.js
// Envoi des pièces commerciales émises : facture, devis, relance d'impayé.
//
// RÈGLE CLAUDE.md — un template email = une seule fonction, jamais une copie.
// Les trois envois partagent `buildFactureEmail()` ; ils ne diffèrent que par le
// sujet, le paragraphe d'introduction et le ton. Le bouton « Envoyer un test » du
// dashboard appelle exactement ces fonctions avec des données d'exemple — il ne
// reconstruit jamais son propre HTML.

const EMETTEUR = {
  nom: 'Rudy BOUCHERON — EI',
  marque: 'ORADIA',
  adresse: '17 Cardevily — 22100 Trévron',
  siret: '821 308 004 00034',
  email: 'contact@oradia.fr',
  telephone: '06 45 51 19 90',
  iban: 'FR76 1558 9228 4506 7504 8634 186'
};

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtEur(n) {
  return (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

/** Date au format jj/mm/aaaa à partir d'un 'YYYY-MM-DD'. Jamais de Date() ici : un
 *  décalage de fuseau sur un serveur en UTC ferait reculer la date d'un jour. */
function fmtDate(ymd) {
  if (!ymd) return '';
  const [y, m, d] = String(ymd).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Mise en page commune à tous les envois de pièces.
 * @param {Object}   p
 * @param {string}   p.intro      paragraphe d'ouverture, propre à chaque type d'envoi
 * @param {Object}   p.facture    ligne `factures`
 * @param {Array}    p.lignes     lignes `facture_lignes`
 * @param {Object}   p.client     fiche client (ou snapshot)
 * @param {string}   [p.rappel]   encadré facultatif (relance, validité d'un devis)
 */
function buildFactureEmail({ intro, facture, lignes, client, rappel }) {
  const estDevis = facture.type === 'devis';

  const rows = (lignes || []).map(l => `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #e6e0d2;font-size:13px;color:#2b2b2b;">${escapeHtml(l.designation)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e6e0d2;font-size:13px;color:#6b6b6b;white-space:nowrap;">${escapeHtml(fmtDate(l.date_prestation))}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e6e0d2;font-size:13px;color:#2b2b2b;text-align:right;white-space:nowrap;">${fmtEur(l.total)}</td>
    </tr>`).join('');

  const encadre = rappel ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:#fdf6e3;border:1px solid #e0cf9a;border-radius:4px;">
      <tr><td style="padding:14px 16px;font-size:13px;color:#6b5420;line-height:1.6;">${rappel}</td></tr>
    </table>` : '';

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f1e9;font-family:Georgia,'Times New Roman',serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1e9;padding:32px 16px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border:1px solid #e6e0d2;">
    <tr><td style="padding:28px 32px 20px;border-bottom:2px solid #d4af37;">
      <p style="margin:0;font-size:11px;letter-spacing:0.35em;text-transform:uppercase;color:#a08a3c;">${escapeHtml(EMETTEUR.marque)}</p>
      <h1 style="margin:6px 0 0;font-size:22px;font-weight:normal;color:#1a1a1a;">${estDevis ? 'Devis' : 'Facture'} ${escapeHtml(facture.numero)}</h1>
    </td></tr>

    <tr><td style="padding:24px 32px 8px;font-size:14px;line-height:1.7;color:#2b2b2b;">
      <p style="margin:0 0 16px;">Bonjour${client && client.nom ? ' ' + escapeHtml(client.nom) : ''},</p>
      <p style="margin:0 0 20px;">${intro}</p>
    </td></tr>

    ${encadre ? `<tr><td style="padding:0 32px;">${encadre}</td></tr>` : ''}

    <tr><td style="padding:0 32px 8px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          <th align="left"  style="padding:8px 10px;border-bottom:2px solid #d4af37;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#a08a3c;">Désignation</th>
          <th align="left"  style="padding:8px 10px;border-bottom:2px solid #d4af37;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#a08a3c;">Date</th>
          <th align="right" style="padding:8px 10px;border-bottom:2px solid #d4af37;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#a08a3c;">Montant</th>
        </tr>
        ${rows}
        <tr>
          <td colspan="2" style="padding:14px 10px 0;font-size:14px;font-weight:bold;color:#1a1a1a;">Total à payer</td>
          <td style="padding:14px 10px 0;font-size:16px;font-weight:bold;color:#1a1a1a;text-align:right;white-space:nowrap;">${fmtEur(facture.total_ht)}</td>
        </tr>
      </table>
    </td></tr>

    <tr><td style="padding:20px 32px 0;font-size:13px;line-height:1.7;color:#4a4a4a;">
      ${estDevis
        ? `<p style="margin:0 0 6px;">Devis établi le ${escapeHtml(fmtDate(facture.date_emission))}${facture.date_echeance ? `, valable jusqu'au ${escapeHtml(fmtDate(facture.date_echeance))}` : ''}.</p>`
        : `<p style="margin:0 0 6px;"><strong>Échéance : ${escapeHtml(fmtDate(facture.date_echeance))}</strong> — paiement à ${facture.delai_paiement_jours} jours à compter de l'émission.</p>
           <p style="margin:0 0 6px;">Règlement par virement : ${escapeHtml(EMETTEUR.iban)} — ou chèque à l'ordre de Rudy Boucheron.</p>`}
      <p style="margin:0 0 6px;color:#6b6b6b;">TVA non applicable, art. 293 B du CGI.</p>
      <p style="margin:0;color:#6b6b6b;">${estDevis ? 'Le devis au format PDF est joint' : 'La facture au format PDF est jointe'} à cet email.</p>
    </td></tr>

    <tr><td style="padding:24px 32px 28px;font-size:13px;line-height:1.7;color:#2b2b2b;">
      <p style="margin:0 0 4px;">Bien à vous,</p>
      <p style="margin:0;">Rudy Boucheron</p>
    </td></tr>

    <tr><td style="padding:16px 32px 24px;border-top:1px solid #e6e0d2;font-size:11px;line-height:1.6;color:#8a8a8a;">
      ${escapeHtml(EMETTEUR.nom)} — ${escapeHtml(EMETTEUR.adresse)}<br>
      SIRET ${escapeHtml(EMETTEUR.siret)} — ${escapeHtml(EMETTEUR.email)} — ${escapeHtml(EMETTEUR.telephone)}<br>
      Entrepreneur individuel immatriculé au Registre National des Entreprises.
    </td></tr>
  </table>
</td></tr></table></body></html>`;

  const text = [
    `${estDevis ? 'Devis' : 'Facture'} ${facture.numero}`,
    '',
    (lignes || []).map(l => `- ${l.designation}${l.date_prestation ? ` (${fmtDate(l.date_prestation)})` : ''} : ${fmtEur(l.total)}`).join('\n'),
    '',
    `Total à payer : ${fmtEur(facture.total_ht)}`,
    estDevis ? '' : `Échéance : ${fmtDate(facture.date_echeance)}`,
    estDevis ? '' : `Virement : ${EMETTEUR.iban}`,
    'TVA non applicable, art. 293 B du CGI.',
    '',
    `${EMETTEUR.nom} — SIRET ${EMETTEUR.siret}`
  ].filter(Boolean).join('\n');

  return { html, text };
}

/** Envoi effectif via Brevo. `pdfBase64` est le PDF déjà généré, joint tel quel. */
async function sendViaBrevo({ toEmail, toName, subject, html, text, pdfBase64, pdfName, replyTo }) {
  if (!process.env.BREVO_API_KEY || !process.env.BREVO_SENDER_EMAIL) {
    console.error('[facture-email] Configuration Brevo manquante');
    return { ok: false, error: 'Configuration Brevo manquante' };
  }
  if (!toEmail) return { ok: false, error: 'Adresse du destinataire manquante' };

  const payload = {
    sender: { email: process.env.BREVO_SENDER_EMAIL, name: process.env.BREVO_SENDER_NAME || 'ORADIA' },
    to: [{ email: toEmail, name: toName || toEmail }],
    replyTo: { email: replyTo || EMETTEUR.email, name: 'Rudy Boucheron' },
    subject,
    htmlContent: html,
    textContent: text
  };
  if (pdfBase64) payload.attachment = [{ name: pdfName || 'facture.pdf', content: pdfBase64 }];

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error('[facture-email] Brevo', response.status, detail);
      return { ok: false, error: `Brevo ${response.status}` };
    }
    return { ok: true };
  } catch (e) {
    console.error('[facture-email]', e);
    return { ok: false, error: e.message };
  }
}

/** Envoi d'une facture. */
async function sendFactureEmail({ facture, lignes, client, pdfBase64 }) {
  const { html, text } = buildFactureEmail({
    facture, lignes, client,
    intro: `Vous trouverez ci-dessous le détail de la facture <strong>${escapeHtml(facture.numero)}</strong>${facture.periode_label ? ` pour ${escapeHtml(facture.periode_label)}` : ''}.`
  });
  return sendViaBrevo({
    toEmail: client && client.email, toName: client && client.nom,
    subject: `Facture ${facture.numero} — ORADIA`,
    html, text, pdfBase64, pdfName: `Facture_${facture.numero}.pdf`
  });
}

/** Envoi d'un devis. */
async function sendDevisEmail({ facture, lignes, client, pdfBase64 }) {
  const { html, text } = buildFactureEmail({
    facture, lignes, client,
    intro: `Voici le devis <strong>${escapeHtml(facture.numero)}</strong> correspondant à votre demande.`,
    rappel: `Ce devis ne vous engage à rien. Pour l'accepter, il vous suffit de répondre à cet email${facture.date_echeance ? ` avant le ${escapeHtml(fmtDate(facture.date_echeance))}` : ''}.`
  });
  return sendViaBrevo({
    toEmail: client && client.email, toName: client && client.nom,
    subject: `Devis ${facture.numero} — ORADIA`,
    html, text, pdfBase64, pdfName: `Devis_${facture.numero}.pdf`
  });
}

/**
 * Relance d'impayé. Le ton monte d'un cran à chaque relance, sans jamais devenir
 * agressif : la première est un simple rappel, la troisième mentionne les pénalités
 * légales déjà portées sur la facture.
 */
async function sendRelanceEmail({ facture, lignes, client, pdfBase64, rang = 1, joursRetard = 0 }) {
  const retard = joursRetard > 0 ? ` (${joursRetard} jour${joursRetard > 1 ? 's' : ''} de retard)` : '';
  const intros = {
    1: `Un simple rappel : la facture <strong>${escapeHtml(facture.numero)}</strong>, échue le ${escapeHtml(fmtDate(facture.date_echeance))}${retard}, ne m'est pas encore parvenue. Si le règlement est déjà parti, merci de ne pas tenir compte de ce message.`,
    2: `Je reviens vers vous au sujet de la facture <strong>${escapeHtml(facture.numero)}</strong>, échue le ${escapeHtml(fmtDate(facture.date_echeance))}${retard} et toujours en attente de règlement.`,
    3: `La facture <strong>${escapeHtml(facture.numero)}</strong> reste impayée${retard}. Je vous remercie de procéder au règlement sous huitaine.`
  };
  const rappels = {
    2: `Si un élément bloque le paiement, dites-le moi : il est toujours plus simple d'en parler.`,
    3: `Pour mémoire, tout retard de paiement entraîne des pénalités au taux de trois fois le taux d'intérêt légal, ainsi qu'une indemnité forfaitaire de 40 € pour frais de recouvrement (art. L. 441-10 et D. 441-5 du code de commerce).`
  };
  const niveau = Math.min(3, Math.max(1, rang));

  const { html, text } = buildFactureEmail({
    facture, lignes, client, intro: intros[niveau], rappel: rappels[niveau]
  });
  return sendViaBrevo({
    toEmail: client && client.email, toName: client && client.nom,
    subject: niveau >= 3
      ? `Relance — facture ${facture.numero} impayée`
      : `Rappel — facture ${facture.numero}`,
    html, text, pdfBase64, pdfName: `Facture_${facture.numero}.pdf`
  });
}

/** Jeu de données d'exemple, pour le bouton « Envoyer un test » du dashboard. */
function exempleFacture() {
  const today = new Date().toISOString().slice(0, 10);
  return {
    facture: {
      numero: 'F01-00000', type: 'facture', date_emission: today, date_echeance: today,
      delai_paiement_jours: 30, total_ht: 300, periode_label: 'exemple'
    },
    lignes: [
      { designation: 'ENTRETIEN ET REMISE EN ETAT DU GITE', date_prestation: today, quantite: 1, prix_unitaire: 100, total: 100 },
      { designation: 'ENTRETIEN ET REMISE EN ETAT DU GITE', date_prestation: today, quantite: 1, prix_unitaire: 100, total: 100 },
      { designation: 'Entretien extérieur : abords, terrasse, espaces verts', date_prestation: today, quantite: 1, prix_unitaire: 100, total: 100 }
    ],
    client: { nom: 'Client de test' }
  };
}

module.exports = {
  EMETTEUR, fmtEur, fmtDate, escapeHtml,
  buildFactureEmail, sendFactureEmail, sendDevisEmail, sendRelanceEmail, exempleFacture
};
