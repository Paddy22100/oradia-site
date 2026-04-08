const { createClient } = require('@supabase/supabase-js');
const { verifyAdminAuth } = require('./_auth');
const { loadLocalEnvIfNeeded } = require('../lib/load-local-env');

loadLocalEnvIfNeeded();

function getSupabaseClient() {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    return createClient(supabaseUrl, supabaseKey);
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
        .select('stripe_session_id, created_at, full_name, email, phone, shipping_address, address_complement, postal_code, city, country, shipping_method, shipping_status, shipping_provider, relay_id, relay_name, relay_address1, relay_address2, relay_postal_code, relay_city, relay_country')
        .eq('paid_status', 'completed')
        .in('shipping_method', ['home', 'relay'])
        .order('created_at', { ascending: false });

    if (error) {
        throw new Error(`Erreur export Mondial Relay: ${error.message}`);
    }

    const rows = [];

    preorders.forEach((order) => {
        const { firstName, lastName } = splitName(order.full_name);
        const cleanedPhone = normalizePhone(order.phone);
        const country = normalizeCountry(order.country || 'FR');
        const isRelay = order.shipping_method === 'relay';

        rows.push([
            order.stripe_session_id || '',
            lastName,
            firstName,
            sanitize(order.shipping_address),
            sanitize(order.address_complement),
            sanitize(order.postal_code),
            sanitize(order.city),
            country,
            cleanedPhone,
            sanitize(order.email),
            cleanedPhone,
            isRelay ? 'RELAIS' : 'DOMICILE',
            isRelay ? sanitize(order.relay_id) : '',
            isRelay ? sanitize(order.relay_name) : '',
            isRelay ? sanitize(order.relay_address1) : '',
            isRelay ? sanitize(order.relay_address2) : '',
            isRelay ? sanitize(order.relay_postal_code) : '',
            isRelay ? sanitize(order.relay_city) : '',
            isRelay ? normalizeCountry(order.relay_country || country) : '',
            '500'
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
