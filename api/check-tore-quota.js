import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    const { data: sub } = await supabase
      .from('tore_subscriptions')
      .select('status, expires_at, single_draw_credits')
      .eq('email', email)
      .single();

    if (!sub) {
      // Pas de ligne = utilisateur freemium pur (localStorage gère)
      return res.status(200).json({ canDraw: true, drawsUsed: 0 });
    }

    // Abonné actif → tirages illimités
    if (sub.status === 'active' && new Date(sub.expires_at) > new Date()) {
      return res.status(200).json({ canDraw: true, drawsUsed: 0 });
    }

    // Crédits ponctuels disponibles
    if ((sub.single_draw_credits || 0) > 0) {
      return res.status(200).json({
        canDraw: true,
        drawsUsed: 0,
        singleDrawCredits: sub.single_draw_credits
      });
    }

    // Freemium : déléguer à localStorage (retourner true par défaut)
    // La vraie limite lifetime est gérée côté client
    return res.status(200).json({ canDraw: true, drawsUsed: 0 });

  } catch (err) {
    console.error('[check-tore-quota]', err);
    // En cas d'erreur serveur : ne pas bloquer l'utilisateur
    return res.status(200).json({ canDraw: true, drawsUsed: 0 });
  }
}
