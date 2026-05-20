// api/admin/newsletter-send.js
// Envoie la newsletter via l'API Brevo (ex-Sendinblue)

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Convertit le texte brut structuré en HTML email propre
function textToHtml(text) {
  const lines = text.split('\n');
  let html = '';
  let inSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      html += '<br>';
      continue;
    }

    // Titres de sections (MAJUSCULES :)
    if (/^[A-ZÀÂÉÈÊËÎÏÔÙÛÜ\s]{3,}\s*:/.test(trimmed)) {
      html += `<p style="font-size:11px;letter-spacing:2px;color:#8B7355;text-transform:uppercase;margin:24px 0 8px;">${trimmed}</p>`;
      continue;
    }

    // Flèche oracle
    if (trimmed.startsWith('→')) {
      html += `<p style="margin:16px 0;"><a href="https://oradia.fr" style="color:#C4922A;text-decoration:none;font-weight:600;">${trimmed}</a></p>`;
      continue;
    }

    // Texte en italique (prise de conscience)
    if (trimmed.startsWith('*') && trimmed.endsWith('*')) {
      html += `<p style="font-style:italic;color:#5C4A2A;font-size:17px;line-height:1.7;margin:16px 0;border-left:3px solid #C4922A;padding-left:16px;">${trimmed.slice(1, -1)}</p>`;
      continue;
    }

    html += `<p style="font-size:15px;line-height:1.8;color:#2C1810;margin:8px 0;">${trimmed}</p>`;
  }

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F8F4EE;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8F4EE;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr><td style="background:#1C1208;padding:32px 40px;text-align:center;border-radius:8px 8px 0 0;">
          <p style="margin:0;color:#C4922A;font-size:11px;letter-spacing:3px;text-transform:uppercase;">La Boussole Intérieure</p>
          <p style="margin:8px 0 0;color:#F8F4EE;font-size:22px;font-weight:normal;font-style:italic;">La lettre du vivant</p>
        </td></tr>

        <!-- Corps -->
        <tr><td style="background:#FFFFFF;padding:48px 40px;border-radius:0 0 8px 8px;">
          ${html}

          <!-- Séparateur -->
          <hr style="border:none;border-top:1px solid #E8DDD0;margin:40px 0;">

          <!-- Footer -->
          <p style="font-size:12px;color:#9E8B7A;text-align:center;line-height:1.6;">
            Vous recevez cette lettre parce que vous êtes inscrit sur <a href="https://oradia.fr" style="color:#C4922A;">oradia.fr</a><br>
            <a href="{{unsubscribe}}" style="color:#9E8B7A;">Se désinscrire</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token !== process.env.ADMIN_SECRET_TOKEN) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  const { draft_id, subject, test_email } = req.body;

  if (!draft_id) return res.status(400).json({ error: 'draft_id requis' });

  // Récupération du brouillon
  const { data: draft, error: fetchError } = await supabase
    .from('newsletter_drafts')
    .select('*')
    .eq('id', draft_id)
    .single();

  if (fetchError || !draft) {
    return res.status(404).json({ error: 'Brouillon introuvable' });
  }

  if (draft.statut === 'envoyé' && !test_email) {
    return res.status(400).json({ error: 'Cette newsletter a déjà été envoyée' });
  }

  const emailSubject = subject || draft.subject || 'La lettre du vivant';
  const htmlContent = textToHtml(draft.content);

  // Construction de la campagne Brevo
  const campaignPayload = test_email
    ? {
        // Envoi de test à une adresse spécifique
        name: `TEST — ${emailSubject}`,
        subject: `[TEST] ${emailSubject}`,
        sender: {
          name: process.env.BREVO_SENDER_NAME || 'Rudy — La Boussole Intérieure',
          email: process.env.BREVO_SENDER_EMAIL
        },
        type: 'classic',
        htmlContent,
        testSends: [{ email: test_email }]
      }
    : {
        name: emailSubject,
        subject: emailSubject,
        sender: {
          name: process.env.BREVO_SENDER_NAME || 'Rudy — La Boussole Intérieure',
          email: process.env.BREVO_SENDER_EMAIL
        },
        type: 'classic',
        htmlContent,
        recipients: {
          listIds: [parseInt(process.env.BREVO_LIST_ID)]
        }
      };

  try {
    // Création de la campagne
    const createRes = await fetch('https://api.brevo.com/v3/emailCampaigns', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(campaignPayload)
    });

    const campaign = await createRes.json();

    if (!createRes.ok) {
      return res.status(500).json({ error: 'Erreur création campagne Brevo', details: campaign });
    }

    // Si test : envoi immédiat du test
    if (test_email) {
      const testRes = await fetch(`https://api.brevo.com/v3/emailCampaigns/${campaign.id}/sendTest`, {
        method: 'POST',
        headers: {
          'api-key': process.env.BREVO_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ emailTo: [test_email] })
      });

      if (!testRes.ok) {
        const testErr = await testRes.json();
        return res.status(500).json({ error: 'Erreur envoi test', details: testErr });
      }

      return res.status(200).json({ success: true, mode: 'test', campaign_id: campaign.id });
    }

    // Envoi réel immédiat
    const sendRes = await fetch(`https://api.brevo.com/v3/emailCampaigns/${campaign.id}/sendNow`, {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY }
    });

    if (!sendRes.ok) {
      const sendErr = await sendRes.json();
      return res.status(500).json({ error: 'Erreur envoi campagne', details: sendErr });
    }

    // Mise à jour du statut en base
    await supabase
      .from('newsletter_drafts')
      .update({
        statut: 'envoyé',
        sent_at: new Date().toISOString(),
        brevo_campaign_id: campaign.id
      })
      .eq('id', draft_id);

    return res.status(200).json({ success: true, mode: 'envoi', campaign_id: campaign.id });

  } catch (error) {
    console.error('Erreur envoi newsletter:', error);
    return res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
}
