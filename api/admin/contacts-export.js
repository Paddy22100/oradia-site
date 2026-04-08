const { createClient } = require('@supabase/supabase-js');
const { verifyAdminAuth } = require('./_auth');
const { loadLocalEnvIfNeeded } = require('../lib/load-local-env');

loadLocalEnvIfNeeded();

function getSupabaseClient() {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    return createClient(supabaseUrl, supabaseKey);
}

function toMondialReference(stripeSessionId, createdAt) {
    const raw = sanitize(stripeSessionId) || `order-${sanitize(createdAt)}`;
    const compact = raw.replace(/[^a-zA-Z0-9_-]/g, '');
    return compact.slice(0, 30);
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({
            error: 'Method not allowed',
            message: 'Méthode non autorisée'
        });
    }

    try {
        verifyAdminAuth(req);
        const format = req.query?.format === 'mondial-relay' ? 'mondial-relay' : 'standard';
        const supabase = getSupabaseClient();

        if (format === 'mondial-relay') {
            return await exportMondialRelayCsv(res, supabase);
        }

        return await exportStandardCsv(res, supabase);
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            error: error.statusCode ? 'Unauthorized' : 'Internal Server Error',
            message: error.message || 'Erreur lors de l\'export des contacts'
        });
    }
}

async function exportStandardCsv(res, supabase) {
    const [preordersResult, donorsResult, waitlistResult] = await Promise.all([
        supabase
            .from('preorders')
            .select('email, full_name, amount_total, paid_status, created_at, offer, city, shipping_method, shipping_status')
            .eq('paid_status', 'completed')
            .order('created_at', { ascending: false }),
        supabase
            .from('donors')
            .select('email, full_name, amount_total, paid_status, created_at')
            .eq('paid_status', 'completed')
            .order('created_at', { ascending: false }),
        supabase
            .from('waitlist_tirages')
            .select('email, full_name, created_at, brevo_synced')
            .order('created_at', { ascending: false })
    ]);

    const preorders = preordersResult.data || [];
    const donors = donorsResult.data || [];
    const waitlist = waitlistResult.data || [];

    const csvData = [
        ['Type', 'Email', 'Nom complet', 'Montant (€)', 'Statut paiement', 'Offre', 'Ville', 'Mode livraison', 'Statut livraison', 'Date', 'Sync Brevo']
    ];

    preorders.forEach((preorder) => {
        csvData.push([
            'Précommande',
            preorder.email || '',
            preorder.full_name || '',
            preorder.amount_total || 0,
            preorder.paid_status || '',
            preorder.offer || '',
            preorder.city || '',
            preorder.shipping_method || '',
            preorder.shipping_status || '',
            formatDate(preorder.created_at),
            ''
        ]);
    });

    donors.forEach((donor) => {
        csvData.push([
            'Don',
            donor.email || '',
            donor.full_name || '',
            donor.amount_total || 0,
            donor.paid_status || '',
            '',
            '',
            '',
            '',
            formatDate(donor.created_at),
            ''
        ]);
    });

    waitlist.forEach((item) => {
        csvData.push([
            'Waitlist',
            item.email || '',
            item.full_name || '',
            '',
            '',
            '',
            '',
            '',
            '',
            formatDate(item.created_at),
            item.brevo_synced ? 'Oui' : 'Non'
        ]);
    });

    const csvContent = toCsv(csvData, ';');
    const fileName = `oradia-contacts-${new Date().toISOString().split('T')[0]}.csv`;
    const excelCsvContent = `sep=;\n${csvContent}`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.status(200).send('\uFEFF' + excelCsvContent);
}

async function exportMondialRelayCsv(res, supabase) {
    const { data: preorders = [], error } = await supabase
        .from('preorders')
        .select('stripe_session_id, created_at, full_name, email, phone, amount_total, shipping_address, address_complement, postal_code, city, country, shipping_method, shipping_status, shipping_provider, relay_id, relay_name, relay_address1, relay_address2, relay_postal_code, relay_city, relay_country')
        .eq('paid_status', 'completed')
        .eq('shipping_method', 'relay')
        .order('created_at', { ascending: false });

    if (error) {
        throw new Error(`Erreur export Mondial Relay: ${error.message}`);
    }

    const rows = [];

    preorders.forEach((order) => {
        const { firstName, lastName } = splitName(order.full_name);
        const cleanedPhone = normalizePhone(order.phone);
        const country = normalizeCountry(order.country || 'FR');
        const relayCountry = normalizeCountry(order.relay_country || country);
        const reference = toMondialReference(order.stripe_session_id, order.created_at);
        const amount = Number(order.amount_total || 0);
        const safeAmount = Number.isFinite(amount) ? Math.max(amount, 0) : 0;
        const amountInt = String(Math.floor(safeAmount));
        const amountDec = String(Math.round((safeAmount - Math.floor(safeAmount)) * 100));
        const relayId = sanitize(order.relay_id);
        const relayLabel = sanitize(order.relay_name) || 'POINT RELAIS';

        rows.push([
            // 1  Référence Client
            reference,
            // 2  Référence Commande
            reference,
            // 3  Libellé Destinataire
            lastName,
            // 4  Libellé Complément Destinataire
            firstName,
            // 5  Adresse Ligne1 Destinataire
            sanitize(order.shipping_address),
            // 6  Adresse Ligne2 Destinataire
            sanitize(order.address_complement),
            // 7  Ville Destinataire
            sanitize(order.city),
            // 8  Code Postal Destinataire
            sanitize(order.postal_code),
            // 9  Code Pays Destinataire
            country,
            // 10 Téléphone1 Destinataire
            cleanedPhone,
            // 11 Téléphone2 Destinataire
            '',
            // 12 Email Destinataire
            sanitize(order.email),
            // 13-22 Libellé Article 1..10
            relayLabel,
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            // 23 Langue Destinataire
            'FR',
            // 24 Nombre Colis
            '1',
            // 25 Nombre Colis Int
            '0',
            // 26 Poids Total Colis
            '0',
            // 27 Poids Total Colis Decimal (0.500 kg)
            '500',
            // 28 Longueur Moyenne Colis
            '',
            // 29 Volume Moyen Colis
            '',
            // 30 Valeur Totale Colis
            amountInt,
            // 31 Valeur Totale Colis Decimal
            amountDec,
            // 32 Devise
            'EUR',
            // 33 Option Assurance
            '',
            // 34 Option Montant CRT
            '',
            // 35 Option Devise CRT
            '',
            // 36 Instruction Livraison Colis
            '',
            // 37 Type Collecte
            'REL',
            // 38 Id Point Retrait Collecte
            '',
            // 39 Code Pays Collecte
            relayCountry,
            // 40 Type Livraison
            'REL',
            // 41 Id Point Retrait Livraison
            relayId,
            // 42 Id Point Retrait Livraison Int
            '',
            // 43 Code Pays Livraison
            relayCountry,
            // 44 Code Mode Livraison
            '24R',
            // 45 Option Notification
            '',
            // 46 Option Reprise Ancien
            '',
            // 47 Option Montage
            '',
            // 48 Option RDV
            '',
            // 49 Mode De Collecte
            'REL',
            // 50 Id Coordonnee Enseigne Selectionnee
            '',
        ]);
    });

    const csvContent = toCsv(rows, ';');
    const fileName = `oradia-mondial-relay-${new Date().toISOString().split('T')[0]}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.status(200).send('\uFEFF' + csvContent);
}

function toCsv(data, delimiter) {
    return data
        .map((row) => row.map((field) => `"${String(field ?? '').replace(/"/g, '""')}"`).join(delimiter))
        .join('\n');
}

function splitName(fullName) {
    const value = sanitize(fullName);
    if (!value) return { firstName: '', lastName: '' };

    const parts = value.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
        return { firstName: parts[0], lastName: '' };
    }

    return {
        firstName: parts.slice(0, -1).join(' '),
        lastName: parts.slice(-1).join(' ')
    };
}

function normalizePhone(phone) {
    const clean = sanitize(phone).replace(/[^\d+]/g, '');
    if (!clean) return '';
    if (clean.startsWith('+')) return clean;
    if (clean.startsWith('00')) return '+' + clean.slice(2);
    if (clean.startsWith('0')) return '+33' + clean.slice(1);
    return clean;
}

function normalizeCountry(country) {
    const c = sanitize(country).toUpperCase();
    if (!c) return 'FR';
    if (c === 'FRANCE') return 'FR';
    if (c.length === 2) return c;
    return c;
}

function sanitize(value) {
    return value == null ? '' : String(value).trim();
}

function formatDate(dateString) {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}
