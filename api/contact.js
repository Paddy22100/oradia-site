/**
 * API Route: Contact Form
 * Envoie un email via Brevo (SendinBlue) API
 * 
 * Variables d'environnement requises:
 * - BREVO_API_KEY: Clé API Brevo
 * - CONTACT_TO_EMAIL: Email destinataire (oradia@protonmail.com)
 * - CONTACT_FROM_EMAIL: Email expéditeur vérifié dans Brevo
 */

export default async function handler(req, res) {
  // 1. Vérifier la méthode HTTP
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      message: 'Méthode non autorisée. Utilisez POST.' 
    });
  }

  try {
    // 2. Récupérer et valider les données du formulaire
    const { name, email, subject, message } = req.body;

    // Validation des champs obligatoires
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ 
        success: false, 
        message: 'Tous les champs sont obligatoires.' 
      });
    }

    // Trim des valeurs
    const cleanName = name.trim();
    const cleanEmail = email.trim();
    const cleanSubject = subject.trim();
    const cleanMessage = message.trim();

    // Validation email robuste
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Adresse email invalide.' 
      });
    }

    // Validation supplémentaire : pas d'email temporaires ou suspects
    const suspiciousDomains = ['tempmail.com', '10minutemail.com', 'guerrillamail.com', 'mailinator.com'];
    const emailDomain = cleanEmail.split('@')[1].toLowerCase();
    if (suspiciousDomains.some(domain => emailDomain.includes(domain))) {
      return res.status(400).json({ 
        success: false, 
        message: 'Adresse email non autorisée.' 
      });
    }

    // Validation longueur
    if (cleanName.length > 100) {
      return res.status(400).json({ 
        success: false, 
        message: 'Le nom est trop long (max 100 caractères).' 
      });
    }

    if (cleanMessage.length > 5000) {
      return res.status(400).json({ 
        success: false, 
        message: 'Le message est trop long (max 5000 caractères).' 
      });
    }

    // 3. Vérifier les variables d'environnement
    const BREVO_API_KEY = process.env.BREVO_API_KEY;
    const CONTACT_TO_EMAIL = process.env.CONTACT_TO_EMAIL || 'oradia@protonmail.com';
    const CONTACT_FROM_EMAIL = process.env.CONTACT_FROM_EMAIL || 'contact@oradia.fr';

    if (!BREVO_API_KEY) {
      console.error('BREVO_API_KEY manquante');
      return res.status(500).json({ 
        success: false, 
        message: 'Configuration serveur incomplète. Veuillez contacter l\'administrateur.' 
      });
    }

    // 4. Préparer le contenu de l'email
    const emailSubject = `[ORADIA Contact] ${cleanSubject}`;
    const emailHtmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #d4af37; border-bottom: 2px solid #d4af37; padding-bottom: 10px;">
          Nouveau message de contact ORADIA
        </h2>
        
        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 10px 0;"><strong>Nom:</strong> ${cleanName}</p>
          <p style="margin: 10px 0;"><strong>Email:</strong> <span style="color: #d4af37; font-weight: bold;">${cleanEmail}</span></p>
          <p style="margin: 10px 0;"><strong>Sujet:</strong> ${cleanSubject}</p>
          <div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px; padding: 10px; margin-top: 15px;">
            <p style="margin: 0; color: #856404; font-size: 14px;">
              <strong>📧 Pour répondre au visiteur :</strong> Utilisez l'adresse <strong>${cleanEmail}</strong>
            </p>
          </div>
        </div>
        
        <div style="margin: 20px 0;">
          <h3 style="color: #0a192f;">Message:</h3>
          <p style="white-space: pre-wrap; line-height: 1.6;">${cleanMessage}</p>
        </div>
        
        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
        
        <p style="color: #666; font-size: 12px;">
          Ce message a été envoyé depuis le formulaire de contact du site ORADIA.
        </p>
      </div>
    `;

    const emailTextContent = `
Nouveau message de contact ORADIA

Nom: ${cleanName}
Email: ${cleanEmail}
Sujet: ${cleanSubject}

Message:
${cleanMessage}

---
Ce message a été envoyé depuis le formulaire de contact du site ORADIA.
    `;

    // 5. Envoyer l'email via Brevo API
    const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender: {
          name: 'ORADIA Contact Form',
          email: CONTACT_FROM_EMAIL
        },
        to: [
          {
            email: CONTACT_TO_EMAIL,
            name: 'ORADIA'
          }
        ],
        subject: emailSubject,
        htmlContent: emailHtmlContent,
        textContent: emailTextContent
      })
    });

    // 6. Vérifier la réponse de Brevo
    if (!brevoResponse.ok) {
      const errorData = await brevoResponse.json().catch(() => ({}));
      console.error('Erreur Brevo:', errorData);
      
      return res.status(500).json({ 
        success: false, 
        message: 'Erreur lors de l\'envoi de l\'email. Veuillez réessayer.' 
      });
    }

    // 7. Succès
    return res.status(200).json({ 
      success: true, 
      message: 'Votre message a bien été envoyé. Nous vous répondrons dans les plus brefs délais.' 
    });

  } catch (error) {
    console.error('Erreur API contact:', error);
    
    return res.status(500).json({ 
      success: false, 
      message: 'Une erreur est survenue. Veuillez réessayer plus tard.' 
    });
  }
}
