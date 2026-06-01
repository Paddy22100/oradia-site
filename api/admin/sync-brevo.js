const { createClient } = require('@supabase/supabase-js');
// Fonction verifyAdminAuth fusionnée depuis lib
const jwt = require('jsonwebtoken');
const cookie = require('cookie');

function verifyAdminAuth(req) {
    try {
        const cookies = cookie.parse(req.headers.cookie || '');
        const token = cookies.oradia_admin_session;
        if (!token) {
            const err = new Error('Session non trouvée');
            err.statusCode = 401;
            throw err;
        }
        const decoded = jwt.verify(token, process.env.ADMIN_SESSION_SECRET);
        if (decoded.type !== 'admin') {
            const err = new Error('Type de session invalide');
            err.statusCode = 401;
            throw err;
        }
        const sessionAge = Math.floor((Date.now() - decoded.loginTime) / 1000 / 60);
        if (sessionAge > 120) {
            const err = new Error('Session expirée');
            err.statusCode = 401;
            throw err;
        }
        return decoded;
    } catch (error) {
        if (!error.statusCode) error.statusCode = 401;
        throw error;
    }
}

function getSupabaseClient() {
  return createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function addContactToBrevo(email, listId, apiKey) {
  const response = await fetch('https://api.brevo.com/v3/contacts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
    body: JSON.stringify({ email, listIds: [parseInt(listId)], updateEnabled: true })
  });
  if (!response.ok && response.status !== 204) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || `Brevo error ${response.status}`);
  }
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  try {
    verifyAdminAuth(req);
  } catch(e) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  const apiKey = process.env.BREVO_API_KEY;
  const listId = process.env.BREVO_WAITLIST_LIST_ID;
  if (!apiKey || !listId) return res.status(500).json({ error: 'BREVO_API_KEY ou BREVO_WAITLIST_LIST_ID manquant' });

  const supabase = getSupabaseClient();

  const { data: contacts, error } = await supabase
    .from('newsletter_contacts')
    .select('id, email, brevo_synced')
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  let synced = 0, already = 0, errors = 0;

  for (const contact of contacts) {
    if (contact.brevo_synced) { already++; continue; }
    try {
      await addContactToBrevo(contact.email, listId, apiKey);
      await supabase
        .from('newsletter_contacts')
        .update({ brevo_synced: true, brevo_synced_at: new Date().toISOString() })
        .eq('id', contact.id);
      synced++;
    } catch (e) {
      await supabase
        .from('newsletter_contacts')
        .update({ brevo_error: e.message })
        .eq('id', contact.id);
      errors++;
    }
  }

  return res.status(200).json({ success: true, synced, already, errors, total: contacts.length });
};
