const { createClient } = require('@supabase/supabase-js');
const { verifyAdminAuth } = require('./_auth');
const { loadLocalEnvIfNeeded } = require('../lib/load-local-env');

loadLocalEnvIfNeeded();

function getSupabaseClient() {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    return createClient(supabaseUrl, supabaseKey);
}

// Fonction d'envoi d'email de suivi via Brevo
async function sendTrackingEmail({ toEmail, toName, trackingNumber, shippingMethod, relayInfo }) {
    try {
        if (!process.env.BREVO_API_KEY || !process.env.BREVO_SENDER_EMAIL) {
            console.error('Configuration Brevo manquante');
            return false;
        }

        // Construire le lien de tracking Mondial Relay
        const trackingUrl = `https://www.mondialrelay.fr/suivi-de-colis/?numeroExpedition=${trackingNumber}`;
        
        const isRelay = shippingMethod === 'relay';
        
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': process.env.BREVO_API_KEY
            },
            body: JSON.stringify({
                sender: {
                    email: process.env.BREVO_SENDER_EMAIL,
                    name: process.env.BREVO_SENDER_NAME || 'ORADIA'
                },
                to: [{
                    email: toEmail,
                    name: toName
                }],
                replyTo: {
                    email: "contact@oradia.fr",
                    name: "Oradia"
                },
                subject: 'Ton Oracle ORADIA est en route ✨',
                htmlContent: `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600;700&family=Lora:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:#050a14;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#050a14;margin:0;padding:0;">
    <tr>
      <td align="center" style="padding:48px 20px;">
        
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:linear-gradient(135deg, #0a1628 0%, #051428 100%);border:1px solid rgba(212,175,55,0.3);box-shadow:0 8px 32px rgba(0,0,0,0.4);">
          
          <!-- Header avec image -->
          <tr>
            <td align="center" style="padding:0;position:relative;">
              <div style="position:relative;width:100%;height:240px;overflow:hidden;">
                <img src="https://oradia.fr/images/medias/apercu_stripe.jpg" alt="Oracle ORADIA" width="600" style="display:block;width:100%;height:240px;object-fit:cover;border:0;opacity:0.85;">
                <div style="position:absolute;top:0;left:0;right:0;bottom:0;background:linear-gradient(180deg, rgba(5,10,20,0) 0%, rgba(5,10,20,0.95) 100%);"></div>
              </div>
            </td>
          </tr>

          <!-- Titre -->
          <tr>
            <td align="center" style="padding:32px 40px 24px 40px;">
              <h1 style="margin:0;color:#f0c75e;font-family:'Cormorant Garamond',Georgia,serif;font-size:36px;font-weight:300;line-height:1.2;letter-spacing:2px;text-transform:uppercase;">
                En Route
              </h1>
              <div style="width:60px;height:1px;background:linear-gradient(90deg, transparent 0%, #d4af37 50%, transparent 100%);margin:20px auto;"></div>
              <p style="margin:0;color:#d8bf72;font-family:'Lora',Georgia,serif;font-size:15px;font-style:italic;line-height:1.6;letter-spacing:0.5px;">
                Ton Oracle a commencé son voyage vers toi
              </p>
            </td>
          </tr>

          <!-- Corps -->
          <tr>
            <td style="padding:0 40px 32px 40px;">
              
              <p style="margin:0 0 24px 0;color:#e8e9eb;font-family:'Lora',Georgia,serif;font-size:16px;line-height:1.8;">
                ${toName ? toName + ',' : 'Cher(e) ami(e),'}
              </p>

              <p style="margin:0 0 28px 0;color:#d1d5db;font-family:'Lora',Georgia,serif;font-size:15px;line-height:1.9;">
                Ton Oracle ORADIA a quitté nos mains et voyage maintenant vers toi. ${isRelay ? 'Il sera bientôt disponible dans ton point relais.' : 'Il sera bientôt livré à ton adresse.'}
              </p>

              <!-- Encadré tracking -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:32px 0;background:rgba(17,24,43,0.6);border-left:3px solid #d4af37;">
                <tr>
                  <td style="padding:24px 28px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding:0 0 12px 0;color:#9ca3af;font-family:'Lora',Georgia,serif;font-size:13px;text-transform:uppercase;letter-spacing:1px;">
                          Numéro de suivi
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:0 0 20px 0;color:#f0c75e;font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;font-weight:600;line-height:1.3;">
                          ${trackingNumber}
                        </td>
                      </tr>
                      ${isRelay && relayInfo ? `
                      <tr>
                        <td style="padding:16px 0 0 0;border-top:1px solid rgba(212,175,55,0.2);">
                          <div style="color:#9ca3af;font-family:'Lora',Georgia,serif;font-size:13px;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">
                            Point relais
                          </div>
                          <div style="color:#e8e9eb;font-family:'Lora',Georgia,serif;font-size:15px;line-height:1.6;">
                            <strong>${relayInfo.name}</strong><br>
                            ${relayInfo.address}<br>
                            ${relayInfo.postalCode} ${relayInfo.city}
                          </div>
                        </td>
                      </tr>
                      ` : ''}
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Bouton tracking -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:32px 0;">
                <tr>
                  <td align="center">
                    <a href="${trackingUrl}" style="display:inline-block;background:linear-gradient(135deg, #d4af37 0%, #f0c75e 100%);color:#0a1628;text-decoration:none;font-family:'Lora',Georgia,serif;font-size:15px;font-weight:600;padding:14px 32px;border-radius:0;letter-spacing:0.5px;text-transform:uppercase;">
                      Suivre mon colis
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:32px 0 0 0;color:#d1d5db;font-family:'Lora',Georgia,serif;font-size:15px;line-height:1.9;">
                ${isRelay 
                    ? 'Tu recevras un SMS/email de Mondial Relay dès que ton Oracle sera disponible en point relais. N\'oublie pas ta pièce d\'identité pour le retirer.'
                    : 'Le transporteur te contactera si nécessaire. Assure-toi d\'être disponible pour réceptionner ton Oracle.'
                }
              </p>

            </td>
          </tr>

          <!-- Séparateur -->
          <tr>
            <td align="center" style="padding:0 40px;">
              <div style="width:100%;height:1px;background:linear-gradient(90deg, transparent 0%, rgba(212,175,55,0.3) 50%, transparent 100%);"></div>
            </td>
          </tr>

          <!-- Signature -->
          <tr>
            <td align="center" style="padding:40px 40px 48px 40px;">
              <p style="margin:0 0 8px 0;color:#9ca3af;font-family:'Lora',Georgia,serif;font-size:13px;font-style:italic;letter-spacing:0.5px;">
                Avec toute ma gratitude,
              </p>
              <p style="margin:0 0 4px 0;color:#f0c75e;font-family:'Cormorant Garamond',Georgia,serif;font-size:28px;font-weight:600;letter-spacing:1px;">
                Rudy
              </p>
              <p style="margin:0 0 24px 0;color:#d8bf72;font-family:'Lora',Georgia,serif;font-size:13px;font-style:italic;">
                Fondateur d'ORADIA
              </p>
              <a href="https://oradia.fr" style="display:inline-block;color:#d4af37;text-decoration:none;font-family:'Lora',Georgia,serif;font-size:13px;letter-spacing:1px;border-bottom:1px solid rgba(212,175,55,0.4);padding-bottom:2px;">
                oradia.fr
              </a>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>
</body>
</html>
`,
                textContent: `Ton Oracle ORADIA est en route

${toName ? toName + ',' : 'Cher(e) ami(e),'}

Ton Oracle ORADIA a quitté nos mains et voyage maintenant vers toi. ${isRelay ? 'Il sera bientôt disponible dans ton point relais.' : 'Il sera bientôt livré à ton adresse.'}

Numéro de suivi : ${trackingNumber}

${isRelay && relayInfo ? `
Point relais :
${relayInfo.name}
${relayInfo.address}
${relayInfo.postalCode} ${relayInfo.city}
` : ''}

Suivre ton colis : ${trackingUrl}

${isRelay 
    ? 'Tu recevras un SMS/email de Mondial Relay dès que ton Oracle sera disponible en point relais. N\'oublie pas ta pièce d\'identité pour le retirer.'
    : 'Le transporteur te contactera si nécessaire. Assure-toi d\'être disponible pour réceptionner ton Oracle.'
}

Avec toute ma gratitude,
Rudy
Fondateur d'ORADIA
oradia.fr`
            })
        });

        if (!response.ok) {
            console.error(`Brevo API error: ${response.status}`);
            return false;
        }

        console.log('Email de suivi envoyé');
        return true;

    } catch (error) {
        console.error('Erreur envoi email de suivi:', error.message);
        return false;
    }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({
            error: 'Method not allowed',
            message: 'Méthode non autorisée'
        });
    }

    try {
        verifyAdminAuth(req);
        const supabase = getSupabaseClient();

        const { orderId, trackingNumber, shipmentNumber, sendEmail } = req.body;

        if (!orderId || !trackingNumber) {
            return res.status(400).json({
                error: 'Bad request',
                message: 'ID de commande et numéro de tracking requis'
            });
        }

        // Récupérer la commande
        const { data: order, error: fetchError } = await supabase
            .from('preorders')
            .select('*')
            .eq('id', orderId)
            .single();

        if (fetchError || !order) {
            return res.status(404).json({
                error: 'Not found',
                message: 'Commande introuvable'
            });
        }

        // Mettre à jour le statut et le tracking
        const { error: updateError } = await supabase
            .from('preorders')
            .update({
                shipping_status: 'shipped',
                tracking_number: trackingNumber,
                shipment_number: shipmentNumber || null,
                shipped_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', orderId);

        if (updateError) {
            throw new Error(`Erreur mise à jour: ${updateError.message}`);
        }

        // Envoyer l'email si demandé
        let emailSent = false;
        if (sendEmail && order.email) {
            const relayInfo = order.shipping_method === 'relay' && order.relay_name ? {
                name: order.relay_name,
                address: order.relay_address1,
                postalCode: order.relay_postal_code,
                city: order.relay_city
            } : null;

            emailSent = await sendTrackingEmail({
                toEmail: order.email,
                toName: order.full_name || 'Client',
                trackingNumber: trackingNumber,
                shippingMethod: order.shipping_method,
                relayInfo: relayInfo
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Commande mise à jour avec succès',
            emailSent: emailSent
        });

    } catch (error) {
        console.error('Erreur update shipping:', error);
        return res.status(error.statusCode || 500).json({
            error: error.statusCode ? 'Unauthorized' : 'Internal Server Error',
            message: error.message || 'Erreur lors de la mise à jour'
        });
    }
}
