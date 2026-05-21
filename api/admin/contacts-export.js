const { createClient } = require('@supabase/supabase-js');
const { verifyAdminAuth } = require('../lib/admin-auth');
const { loadLocalEnvIfNeeded } = require('../lib/load-local-env');

loadLocalEnvIfNeeded();

function getSupabaseClient() {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    return createClient(supabaseUrl, supabaseKey);
}

function toMondialCsv(data) {
    return data
        .map((row) => row.map((field) => sanitizeMondialField(field)).join(';'))
        .join('\r\n');
}

function sanitizeMondialField(value) {
    return toAsciiUpper(sanitize(value))
        .replace(/[;\r\n\t]/g, ' ')
        .replace(/["`]/g, ' ')
        .trim();
}

function toMondialReference(stripeSessionId, createdAt, maxLength) {
    const raw = sanitize(stripeSessionId) || `order-${sanitize(createdAt)}`;
    const compact = toAsciiUpper(raw).replace(/[^A-Z0-9]/g, '');
    return (compact || 'ORADIA').slice(0, maxLength);
}

function toMondialShipmentReference(stripeSessionId, createdAt) {
    const raw = sanitize(stripeSessionId) || `order-${sanitize(createdAt)}`;
    const compact = toAsciiUpper(raw).replace(/[^A-Z0-9_ -]/g, '');
    return (compact || 'ORADIA').slice(0, 15);
}

function toAsciiUpper(value) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase();
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
            .from('newsletter_contacts')
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
    // LOCK: Mondial Relay Connect schema V3.1 (44 fields A..AR), validated in production import.
    // Do not change field count/order without a full revalidation in Connect.
    const MONDIAL_RELAY_FIELD_COUNT = 44;

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
        const referenceClient = toMondialReference(order.stripe_session_id, order.created_at, 9);
        const referenceCommande = toMondialShipmentReference(order.stripe_session_id, order.created_at);
        const amount = Number(order.amount_total || 0);
        const safeAmount = Number.isFinite(amount) ? Math.max(amount, 0) : 0;
        const amountCents = String(Math.round(safeAmount * 100));
        const relayId = sanitize(order.relay_id).replace(/[^0-9]/g, '').slice(0, 6);
        const relayLabel = sanitize(order.relay_name) || 'ORADIA';
        const fullName = toAsciiUpper(`MR ${lastName} ${firstName}`).replace(/[^0-9A-Z_\-'., /]/g, ' ').trim();
        const address1 = toAsciiUpper(sanitize(order.shipping_address)).replace(/[^0-9A-Z_\-'., /]/g, ' ').trim();
        const address2 = toAsciiUpper(sanitize(order.address_complement)).replace(/[^0-9A-Z_\-'., /]/g, ' ').trim();
        const city = toAsciiUpper(sanitize(order.city)).replace(/[^A-Z_\-' ]/g, ' ').trim();
        const email = sanitize(order.email).slice(0, 70);

        if (!relayId) {
            return;
        }

        const row = [
            // A N° de Client (F, 0..9)
            referenceClient,
            // B Référence de l'expédition (F, 0..15)
            referenceCommande,
            // C Adresse de livraison (Nom client final)
            fullName.slice(0, 32),
            // D Complément du nom
            '',
            // E Adresse destinataire (numéro + rue)
            address1.slice(0, 32),
            // F Complément d'adresse
            address2.slice(0, 32),
            // G Ville
            city.slice(0, 25),
            // H Code postal
            sanitize(order.postal_code),
            // I Pays destinataire
            country,
            // J Téléphone 1
            cleanedPhone,
            // K Téléphone 2
            '',
            // L Email
            email,
            // M Type Collecte
            'A',
            // N ID Relais Collecte
            '',
            // O Code Pays Collecte
            '',
            // P Type Livraison
            'R',
            // Q ID Relais Livraison
            relayId,
            // R Code Pays Relais Livraison
            relayCountry,
            // S Mode Livraison
            '24R',
            // T Code langue
            'FR',
            // U Nombre de colis
            '1',
            // V Poids (grammes)
            '500',
            // W Longueur (cm)
            '0',
            // X Volume
            '0',
            // Y Valeur expédition (centimes)
            amountCents,
            // Z Devise
            'EUR',
            // AA Assurance
            '0',
            // AB Montant CRT
            '0',
            // AC Devise CRT
            'EUR',
            // AD Instructions livraison
            '',
            // AE Top Avisage
            '0',
            // AF Top Reprise à Domicile
            '0',
            // AG Temps de Montage
            '0',
            // AH Top RDV
            '0',
            // AI Article 01
            toAsciiUpper(relayLabel).replace(/[^A-Z0-9 _\-.,/]/g, ' ').slice(0, 30),
            // AJ..AR Article 02..10
            '', '', '', '', '', '', '', '', ''
        ];

        while (row.length < MONDIAL_RELAY_FIELD_COUNT) row.push('');
        rows.push(row.slice(0, MONDIAL_RELAY_FIELD_COUNT));
    });

    const invalidRowIndex = rows.findIndex((row) => row.length !== MONDIAL_RELAY_FIELD_COUNT);
    if (invalidRowIndex !== -1) {
        throw new Error(`Export Mondial Relay invalide: ligne ${invalidRowIndex + 1} avec ${rows[invalidRowIndex].length} champs au lieu de ${MONDIAL_RELAY_FIELD_COUNT}.`);
    }

    const csvContent = toMondialCsv(rows);
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
    if (!clean) return '+33600000000';
    if (clean.startsWith('+')) return clean.length > 4 ? clean : '+33600000000';
    if (clean.startsWith('00')) return '+' + clean.slice(2);
    if (clean.startsWith('0')) return clean.length > 1 ? '+33' + clean.slice(1) : '+33600000000';
    return clean.length > 4 ? clean : '+33600000000';
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
