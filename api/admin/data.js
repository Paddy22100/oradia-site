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

// Variables d'environnement - URL Supabase du projet oradia-prod
const supabaseUrl = 'https://nxxetkdozynuytlbhxdx.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Client Supabase
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
    // POST : actions (expédition ou abonnements)
    if (req.method === 'POST') {
        try {
            verifyAdminAuth(req);
            if (req.body?.action && ['resend_code','create','revoke'].includes(req.body.action)) {
                return await handleSubscriptionAction(req, res);
            }
            return await handleUpdateShipping(req, res);
        } catch (error) {
            return res.status(error.statusCode || 500).json({
                error: error.statusCode ? 'Unauthorized' : 'Internal Server Error',
                message: error.message || 'Erreur serveur'
            });
        }
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ 
            error: 'Method not allowed',
            message: 'Méthode non autorisée'
        });
    }

    try {
        verifyAdminAuth(req);
        const {
            section,
            page = 1,
            limit = 10,
            status = 'all',
            period = 'all',
            offer = 'all',
            q = ''
        } = req.query;
        
        // Validation du paramètre section
        const validSections = ['overview', 'preorders', 'donors', 'waitlist', 'subscriptions'];
        if (!section || !validSections.includes(section)) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Section invalide. Sections valides: ' + validSections.join(', ')
            });
        }

        let result;

        switch (section) {
            case 'overview':
                result = await getOverview();
                break;
            case 'preorders':
                result = await getPreorders(page, limit, { status, period, offer, q });
                break;
            case 'donors':
                result = await getDonors(page, limit);
                break;
            case 'waitlist':
                result = await getWaitlist(page, limit);
                break;
            case 'subscriptions':
                result = await getSubscriptions(page, limit, { status, q });
                break;
        }

        res.status(200).json({
            success: true,
            data: result.data,
            pagination: result.pagination || null
        });

    } catch (error) {
        return res.status(error.statusCode || 500).json({
            error: error.statusCode ? 'Unauthorized' : 'Internal Server Error',
            message: error.message || 'Erreur serveur lors de la récupération des données'
        });
    }
}

// Overview - KPI et statistiques
async function getOverview() {
    try {
        // Précommandes
        const { data: preorders, error: preordersError } = await supabase
            .from('preorders')
            .select('amount_total, email, paid_status, created_at')
            .order('created_at', { ascending: false });

        // Dons
        const { data: donors, error: donorsError } = await supabase
            .from('donors')
            .select('amount_total, email, paid_status, created_at')
            .eq('paid_status', 'completed');

        // Waitlist
        const { data: waitlist, error: waitlistError } = await supabase
            .from('newsletter_contacts')
            .select('email, brevo_synced, created_at');

        if (preordersError || donorsError || waitlistError) {
            throw new Error('Erreur lors de la récupération des données');
        }

        const now = new Date();
        const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(now.getDate() - 7);
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(now.getDate() - 30);

        const allPreorders = preorders || [];
        const completedPreorders = allPreorders.filter(p => p.paid_status === 'completed');
        const pendingPreorders = allPreorders.filter(p => p.paid_status === 'pending');
        const failedPreorders = allPreorders.filter(p => p.paid_status === 'failed');

        const preordersCount = completedPreorders.length;
        const preordersTotal = completedPreorders.reduce((sum, p) => sum + Number(p.amount_total || 0), 0);
        const preordersNoEmail = completedPreorders.filter(p => !p.email).length;

        const donorsCount = donors?.length || 0;
        const donorsTotal = donors?.reduce((sum, d) => sum + Number(d.amount_total || 0), 0) || 0;
        const donorsNoEmail = donors?.filter(d => !d.email).length || 0;

        const waitlistCount = waitlist?.length || 0;
        const waitlistNotSynced = waitlist?.filter(w => !w.brevo_synced).length || 0;

        const revenueToday = completedPreorders
            .filter(p => new Date(p.created_at) >= dayStart)
            .reduce((sum, p) => sum + Number(p.amount_total || 0), 0);
        const revenue7d = completedPreorders
            .filter(p => new Date(p.created_at) >= sevenDaysAgo)
            .reduce((sum, p) => sum + Number(p.amount_total || 0), 0);
        const revenue30d = completedPreorders
            .filter(p => new Date(p.created_at) >= thirtyDaysAgo)
            .reduce((sum, p) => sum + Number(p.amount_total || 0), 0);

        const averageBasket = preordersCount > 0 ? preordersTotal / preordersCount : 0;

        const globalTotal = preordersTotal + donorsTotal;
        const totalContacts = preordersCount + donorsCount + waitlistCount;
        const conversionRate = waitlistCount > 0 ? (preordersCount / waitlistCount) * 100 : 0;

        return {
            data: {
                preorders: {
                    count: preordersCount,
                    total: Math.round(preordersTotal * 100) / 100,
                    noEmail: preordersNoEmail,
                    pendingCount: pendingPreorders.length,
                    failedCount: failedPreorders.length,
                    averageBasket: Math.round(averageBasket * 100) / 100
                },
                donors: {
                    count: donorsCount,
                    total: Math.round(donorsTotal * 100) / 100,
                    noEmail: donorsNoEmail
                },
                waitlist: {
                    count: waitlistCount,
                    notSynced: waitlistNotSynced
                },
                global: {
                    total: Math.round(globalTotal * 100) / 100,
                    totalContacts
                },
                performance: {
                    revenueToday: Math.round(revenueToday * 100) / 100,
                    revenue7d: Math.round(revenue7d * 100) / 100,
                    revenue30d: Math.round(revenue30d * 100) / 100,
                    conversionRate: Math.round(conversionRate * 10) / 10
                }
            }
        };
    } catch (error) {
        throw new Error('Erreur overview: ' + error.message);
    }
}

// Précommandes avec pagination
async function getPreorders(page, limit, filters = {}) {
    try {
        const pageNumber = parseInt(page, 10);
        const pageSize = parseInt(limit, 10);
        const offset = (pageNumber - 1) * pageSize;

        let query = supabase
            .from('preorders')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false });

        if (filters.status && filters.status !== 'all') {
            query = query.eq('paid_status', filters.status);
        }

        if (filters.offer && filters.offer !== 'all') {
            query = query.eq('offer', filters.offer);
        }

        if (filters.period && filters.period !== 'all') {
            const startDate = getPeriodStartDate(filters.period);
            if (startDate) {
                query = query.gte('created_at', startDate.toISOString());
            }
        }

        if (filters.q && String(filters.q).trim().length > 1) {
            const safeQ = String(filters.q).trim().replace(/[%_,]/g, '');
            query = query.or(`email.ilike.%${safeQ}%,full_name.ilike.%${safeQ}%`);
        }

        const { data, error, count } = await query.range(offset, offset + pageSize - 1);

        if (error) throw error;

        const normalizedData = (data || []).map(item => ({
            ...item,
            created_at_fr: formatDateFR(item.created_at)
        }));

        return {
            data: normalizedData,
            pagination: {
                page: pageNumber,
                limit: pageSize,
                total: count || 0,
                pages: Math.ceil((count || 0) / pageSize)
            }
        };
    } catch (error) {
        throw new Error('Erreur précommandes: ' + error.message);
    }
}

// Dons avec pagination
async function getDonors(page, limit) {
    try {
        const offset = (page - 1) * limit;
        
        const { data, error, count } = await supabase
            .from('donors')
            .select('*', { count: 'exact' })
            .eq('paid_status', 'completed')
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) throw error;

        const normalizedData = (data || []).map(item => ({
            ...item,
            created_at_fr: formatDateFR(item.created_at)
        }));

        return {
            data: normalizedData,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: count || 0,
                pages: Math.ceil((count || 0) / limit)
            }
        };
    } catch (error) {
        throw new Error('Erreur dons: ' + error.message);
    }
}

// Waitlist avec pagination
async function getWaitlist(page, limit) {
    try {
        const pageNumber = parseInt(page, 10);
        const pageSize = parseInt(limit, 10);
        const offset = (pageNumber - 1) * pageSize;

        const { data, error, count } = await supabase
            .from('newsletter_contacts')
            .select('email, full_name, created_at, brevo_synced', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + pageSize - 1);

        if (error) throw error;

        const normalizedData = (data || []).map(item => ({
            ...item,
            created_at_fr: formatDateFR(item.created_at)
        }));

        return {
            data: normalizedData,
            pagination: {
                page: pageNumber,
                limit: pageSize,
                total: count || 0,
                pages: Math.ceil((count || 0) / pageSize)
            }
        };
    } catch (error) {
        throw new Error('Erreur waitlist: ' + error.message);
    }
}

function formatDateFR(dateString) {
    if (!dateString) return '-';

    return new Intl.DateTimeFormat('fr-FR', {
        timeZone: 'Europe/Paris',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(new Date(dateString));
}

function getPeriodStartDate(period) {
    const now = new Date();

    if (period === 'today') {
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }

    if (period === '7d') {
        const d = new Date(now);
        d.setDate(d.getDate() - 7);
        return d;
    }

    if (period === '30d') {
        const d = new Date(now);
        d.setDate(d.getDate() - 30);
        return d;
    }

    return null;
}

// Abonnements Tore
async function getSubscriptions(page, limit, filters = {}) {
    try {
        const pageNumber = parseInt(page, 10);
        const pageSize = parseInt(limit, 10);
        const offset = (pageNumber - 1) * pageSize;

        let query = supabase
            .from('tore_subscriptions')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false });

        if (filters.status && filters.status !== 'all') {
            query = query.eq('status', filters.status);
        }
        if (filters.q && String(filters.q).trim().length > 1) {
            const safeQ = String(filters.q).trim().replace(/[%_,]/g, '');
            query = query.or(`email.ilike.%${safeQ}%,full_name.ilike.%${safeQ}%`);
        }

        const { data, error, count } = await query.range(offset, offset + pageSize - 1);
        if (error) throw error;

        return {
            data: (data || []).map(item => ({
                ...item,
                created_at_fr: formatDateFR(item.created_at),
                expires_at_fr: formatDateFR(item.expires_at)
            })),
            pagination: { page: pageNumber, limit: pageSize, total: count || 0, pages: Math.ceil((count || 0) / pageSize) }
        };
    } catch (error) {
        throw new Error('Erreur abonnements: ' + error.message);
    }
}

// Handler POST : actions sur les abonnements
async function handleSubscriptionAction(req, res) {
    const { action, subscriptionId, email, fullName, accessCode, expiresAt } = req.body;

    if (action === 'resend_code') {
        if (!subscriptionId && !email) return res.status(400).json({ error: 'ID ou email requis' });

        let sub;
        if (subscriptionId) {
            const { data, error } = await supabase.from('tore_subscriptions').select('*').eq('id', subscriptionId).single();
            if (error || !data) return res.status(404).json({ error: 'Abonnement introuvable' });
            sub = data;
        } else {
            const { data, error } = await supabase.from('tore_subscriptions').select('*').eq('email', email).order('created_at', { ascending: false }).limit(1).single();
            if (error || !data) return res.status(404).json({ error: 'Abonnement introuvable' });
            sub = data;
        }

        const sent = await sendSubscriptionCodeEmail({ toEmail: sub.email, toName: sub.full_name || '', accessCode: sub.access_code, expiresAt: sub.expires_at });
        return res.status(200).json({ success: true, emailSent: sent });
    }

    if (action === 'create') {
        if (!email || !accessCode) return res.status(400).json({ error: 'Email et code requis' });
        const expiry = expiresAt ? new Date(expiresAt).toISOString() : new Date(Date.now() + 30 * 86400000).toISOString();
        const { data, error } = await supabase.from('tore_subscriptions').upsert({ email, full_name: fullName || '', access_code: accessCode, status: 'active', expires_at: expiry, created_at: new Date().toISOString() }, { onConflict: 'email' }).select().single();
        if (error) return res.status(500).json({ error: error.message });
        const sent = await sendSubscriptionCodeEmail({ toEmail: email, toName: fullName || '', accessCode, expiresAt: expiry });
        return res.status(200).json({ success: true, data, emailSent: sent });
    }

    if (action === 'revoke') {
        if (!subscriptionId) return res.status(400).json({ error: 'ID requis' });
        const { error } = await supabase.from('tore_subscriptions').update({ status: 'revoked', updated_at: new Date().toISOString() }).eq('id', subscriptionId);
        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Action inconnue' });
}

async function sendSubscriptionCodeEmail({ toEmail, toName, accessCode, expiresAt }) {
    try {
        if (!process.env.BREVO_API_KEY || !process.env.BREVO_SENDER_EMAIL) return false;
        const expiryStr = expiresAt ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(expiresAt)) : '30 jours';
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
            body: JSON.stringify({
                sender: { email: process.env.BREVO_SENDER_EMAIL, name: process.env.BREVO_SENDER_NAME || 'ORADIA' },
                to: [{ email: toEmail, name: toName || toEmail }],
                replyTo: { email: 'contact@oradia.fr', name: 'Oradia' },
                subject: 'Votre code d\'accès Oracle ORADIA ✨',
                htmlContent: `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;700&family=Lora:ital,wght@0,400;1,400&display=swap" rel="stylesheet"></head><body style="margin:0;padding:0;background:#050a14;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#050a14;"><tr><td align="center" style="padding:48px 20px;"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:linear-gradient(135deg,#0a1628,#051428);border:1px solid rgba(212,175,55,0.3);"><tr><td align="center" style="padding:48px 40px 16px;"><img src="https://oradia.fr/images/logo-hd-v2.jpeg" width="64" height="64" style="border-radius:50%;border:1.5px solid rgba(212,175,55,0.4);" alt="ORADIA"><h1 style="color:#f0c75e;font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;font-weight:400;margin:20px 0 8px;letter-spacing:3px;">ORADIA</h1><div style="width:50px;height:1px;background:#d4af37;margin:0 auto 24px;"></div></td></tr><tr><td style="padding:0 40px 40px;"><p style="color:#e8e9eb;font-family:'Lora',Georgia,serif;font-size:16px;line-height:1.8;">${toName ? toName + ',' : 'Bienvenue,'}</p><p style="color:#e8e9eb;font-family:'Lora',Georgia,serif;font-size:16px;line-height:1.8;">Votre accès au Tore ORADIA est activé. Voici votre code personnel :</p><div style="background:rgba(212,175,55,0.08);border:1.5px solid rgba(212,175,55,0.5);border-radius:12px;padding:24px;text-align:center;margin:24px 0;"><p style="margin:0 0 8px;color:rgba(212,175,55,0.6);font-family:'Lora',serif;font-size:12px;letter-spacing:0.3em;text-transform:uppercase;">Code d'accès</p><p style="margin:0;color:#f0c75e;font-family:'Cormorant Garamond',Georgia,serif;font-size:28px;font-weight:700;letter-spacing:0.15em;">${accessCode}</p><p style="margin:8px 0 0;color:rgba(212,175,55,0.5);font-family:'Lora',serif;font-size:12px;">Valide jusqu'au ${expiryStr}</p></div><p style="color:#e8e9eb;font-family:'Lora',Georgia,serif;font-size:15px;line-height:1.8;">Entrez ce code dans la fenêtre qui apparaît lorsque vous souhaitez lancer un tirage sur <a href="https://oradia.fr/tore.html" style="color:#d4af37;">oradia.fr/tore.html</a></p><p style="color:rgba(148,163,184,0.6);font-family:'Lora',Georgia,serif;font-size:13px;margin-top:32px;">Avec gratitude,<br>Rudy — ORADIA</p></td></tr></table></td></tr></table></body></html>`,
                textContent: `Votre code d'accès ORADIA\n\n${toName ? toName + ',' : 'Bienvenue,'}\n\nVotre code : ${accessCode}\nValide jusqu'au ${expiryStr}\n\nEntrez-le sur oradia.fr/tore.html\n\nAvec gratitude,\nRudy`
            })
        });
        return response.ok;
    } catch (e) {
        console.error('Erreur email abonnement:', e.message);
        return false;
    }
}

// Handler POST : marquer une commande comme expédiée
async function handleUpdateShipping(req, res) {
    const { orderId, trackingNumber, shipmentNumber, sendEmail } = req.body;

    if (!orderId || !trackingNumber) {
        return res.status(400).json({
            error: 'Bad request',
            message: 'ID de commande et numéro de tracking requis'
        });
    }

    const { data: order, error: fetchError } = await supabase
        .from('preorders')
        .select('*')
        .eq('id', orderId)
        .single();

    if (fetchError || !order) {
        return res.status(404).json({ error: 'Not found', message: 'Commande introuvable' });
    }

    const { error: updateError } = await supabase
        .from('preorders')
        .update({
            shipping_status: 'shipped',
            tracking_number: trackingNumber.trim(),
            shipment_number: shipmentNumber ? shipmentNumber.trim() : null,
            shipped_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        })
        .eq('id', orderId);

    if (updateError) {
        throw new Error(`Erreur mise à jour: ${updateError.message}`);
    }

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
            trackingNumber: trackingNumber.trim(),
            shippingMethod: order.shipping_method,
            relayInfo
        });
    }

    return res.status(200).json({
        success: true,
        message: 'Commande mise à jour avec succès',
        emailSent
    });
}

// Envoi email de suivi via Brevo
async function sendTrackingEmail({ toEmail, toName, trackingNumber, shippingMethod, relayInfo }) {
    try {
        if (!process.env.BREVO_API_KEY || !process.env.BREVO_SENDER_EMAIL) return false;

        const trackingUrl = `https://www.mondialrelay.fr/suivi-de-colis/?numeroExpedition=${trackingNumber}`;
        const isRelay = shippingMethod === 'relay';

        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
            body: JSON.stringify({
                sender: { email: process.env.BREVO_SENDER_EMAIL, name: process.env.BREVO_SENDER_NAME || 'ORADIA' },
                to: [{ email: toEmail, name: toName }],
                replyTo: { email: 'contact@oradia.fr', name: 'Oradia' },
                subject: 'Ton Oracle ORADIA est en route ✨',
                htmlContent: `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600;700&family=Lora:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet"></head><body style="margin:0;padding:0;background:#050a14;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#050a14;margin:0;padding:0;"><tr><td align="center" style="padding:48px 20px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:linear-gradient(135deg,#0a1628 0%,#051428 100%);border:1px solid rgba(212,175,55,0.3);box-shadow:0 8px 32px rgba(0,0,0,0.4);"><tr><td align="center" style="padding:0;"><div style="position:relative;width:100%;height:240px;overflow:hidden;"><img src="https://oradia.fr/images/medias/apercu_stripe.jpg" alt="Oracle ORADIA" width="600" style="display:block;width:100%;height:240px;object-fit:cover;border:0;opacity:0.85;"><div style="position:absolute;top:0;left:0;right:0;bottom:0;background:linear-gradient(180deg,rgba(5,10,20,0) 0%,rgba(5,10,20,0.95) 100%);"></div></div></td></tr><tr><td align="center" style="padding:32px 40px 24px 40px;"><h1 style="margin:0;color:#f0c75e;font-family:'Cormorant Garamond',Georgia,serif;font-size:36px;font-weight:300;line-height:1.2;letter-spacing:2px;text-transform:uppercase;">En Route</h1><div style="width:60px;height:1px;background:linear-gradient(90deg,transparent 0%,#d4af37 50%,transparent 100%);margin:20px auto;"></div><p style="margin:0;color:#d8bf72;font-family:'Lora',Georgia,serif;font-size:15px;font-style:italic;line-height:1.6;">Ton Oracle a commencé son voyage vers toi</p></td></tr><tr><td style="padding:0 40px 32px 40px;"><p style="margin:0 0 24px 0;color:#e8e9eb;font-family:'Lora',Georgia,serif;font-size:16px;line-height:1.8;">${toName ? toName + ',' : 'Cher(e) ami(e),'}</p><p style="margin:0 0 28px 0;color:#d1d5db;font-family:'Lora',Georgia,serif;font-size:15px;line-height:1.9;">Ton Oracle ORADIA a quitté nos mains et voyage maintenant vers toi. ${isRelay ? 'Il sera bientôt disponible dans ton point relais.' : 'Il sera bientôt livré à ton adresse.'}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:32px 0;background:rgba(17,24,43,0.6);border-left:3px solid #d4af37;"><tr><td style="padding:24px 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:0 0 12px 0;color:#9ca3af;font-family:'Lora',Georgia,serif;font-size:13px;text-transform:uppercase;letter-spacing:1px;">Numéro de suivi</td></tr><tr><td style="padding:0 0 20px 0;color:#f0c75e;font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;font-weight:600;">${trackingNumber}</td></tr>${isRelay && relayInfo ? `<tr><td style="padding:16px 0 0 0;border-top:1px solid rgba(212,175,55,0.2);"><div style="color:#9ca3af;font-family:'Lora',Georgia,serif;font-size:13px;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Point relais</div><div style="color:#e8e9eb;font-family:'Lora',Georgia,serif;font-size:15px;line-height:1.6;"><strong>${relayInfo.name}</strong><br>${relayInfo.address}<br>${relayInfo.postalCode} ${relayInfo.city}</div></td></tr>` : ''}</table></td></tr></table><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:32px 0;"><tr><td align="center"><a href="${trackingUrl}" style="display:inline-block;background:linear-gradient(135deg,#d4af37 0%,#f0c75e 100%);color:#0a1628;text-decoration:none;font-family:'Lora',Georgia,serif;font-size:15px;font-weight:600;padding:14px 32px;letter-spacing:0.5px;text-transform:uppercase;">Suivre mon colis</a></td></tr></table><p style="margin:32px 0 0 0;color:#d1d5db;font-family:'Lora',Georgia,serif;font-size:15px;line-height:1.9;">${isRelay ? "Tu recevras un SMS/email de Mondial Relay dès que ton Oracle sera disponible en point relais. N'oublie pas ta pièce d'identité pour le retirer." : "Le transporteur te contactera si nécessaire. Assure-toi d'être disponible pour réceptionner ton Oracle."}</p></td></tr><tr><td align="center" style="padding:0 40px;"><div style="width:100%;height:1px;background:linear-gradient(90deg,transparent 0%,rgba(212,175,55,0.3) 50%,transparent 100%);"></div></td></tr><tr><td align="center" style="padding:40px 40px 48px 40px;"><p style="margin:0 0 8px 0;color:#9ca3af;font-family:'Lora',Georgia,serif;font-size:13px;font-style:italic;">Avec toute ma gratitude,</p><p style="margin:0 0 4px 0;color:#f0c75e;font-family:'Cormorant Garamond',Georgia,serif;font-size:28px;font-weight:600;letter-spacing:1px;">Rudy</p><p style="margin:0 0 24px 0;color:#d8bf72;font-family:'Lora',Georgia,serif;font-size:13px;font-style:italic;">Fondateur d'ORADIA</p><a href="https://oradia.fr" style="color:#d4af37;text-decoration:none;font-family:'Lora',Georgia,serif;font-size:13px;letter-spacing:1px;border-bottom:1px solid rgba(212,175,55,0.4);padding-bottom:2px;">oradia.fr</a></td></tr></table></td></tr></table></body></html>`,
                textContent: `Ton Oracle ORADIA est en route\n\n${toName ? toName + ',' : 'Cher(e) ami(e),'}\n\nTon Oracle voyage vers toi. ${isRelay ? 'Il sera bientôt disponible dans ton point relais.' : 'Il sera livré à ton adresse.'}\n\nNuméro de suivi : ${trackingNumber}\n${isRelay && relayInfo ? `\nPoint relais :\n${relayInfo.name}\n${relayInfo.address}\n${relayInfo.postalCode} ${relayInfo.city}\n` : ''}\nSuivre ton colis : ${trackingUrl}\n\nAvec toute ma gratitude,\nRudy\nFondateur d'ORADIA\noradia.fr`
            })
        });

        return response.ok;
    } catch (error) {
        console.error('Erreur email suivi:', error.message);
        return false;
    }
}
