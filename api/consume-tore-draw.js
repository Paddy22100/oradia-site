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
    if (!email) return res.status(400).json({ error: 'Email required' });

    const { data: sub } = await supabase
      .from('tore_subscriptions')
      .select('id, status, expires_at, single_draw_credits')
      .eq('email', email)
      .single();

    if (!sub) return res.status(200).json({ ok: true });

    // Abonné actif : ne pas toucher aux crédits
    if (sub.status === 'active' && new Date(sub.expires_at) > new Date()) {
      return res.status(200).json({ ok: true });
    }

    // Décrémenter le crédit ponctuel si disponible
    if ((sub.single_draw_credits || 0) > 0) {
      await supabase
        .from('tore_subscriptions')
        .update({ single_draw_credits: sub.single_draw_credits - 1 })
        .eq('id', sub.id);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[consume-tore-draw]', err);
    return res.status(200).json({ ok: true }); // silencieux
  }
}
