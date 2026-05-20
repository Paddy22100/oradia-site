// api/admin/newsletter-save.js
// Sauvegarde / mise à jour d'un brouillon dans Supabase

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token !== process.env.ADMIN_SECRET_TOKEN) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  const { id, subject, content, intention, statut } = req.body;

  if (!content) return res.status(400).json({ error: 'Contenu requis' });

  // Mise à jour si ID fourni, création sinon
  if (id) {
    const { data, error } = await supabase
      .from('newsletter_drafts')
      .update({
        subject: subject || null,
        content,
        intention: intention || null,
        statut: statut || 'brouillon',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  } else {
    const { data, error } = await supabase
      .from('newsletter_drafts')
      .insert([{
        subject: subject || null,
        content,
        intention: intention || null,
        statut: 'brouillon'
      }])
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }
}
