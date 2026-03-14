/**
 * Serveur Backend pour les Précommandes ORADIA
 * Node.js + Express + MongoDB + Stripe
 */

const express = require('express');
const mongoose = require('mongoose');

const nodemailer = require('nodemailer');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware de sécurité
app.use(helmet());
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5500',
    credentials: true
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limite chaque IP à 100 requêtes par fenêtre
});
app.use('/api/', limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Connexion MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/oradia_precommandes', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

// Schémas Mongoose
const PrecommandeSchema = new mongoose.Schema({
    orderNumber: { type: String, unique: true, required: true },
    customer: {
        name: { type: String, required: true },
        email: { type: String, required: true },
        phone: String
    },
    shipping: {
        address: { type: String, required: true },
        postalCode: { type: String, required: true },
        city: { type: String, required: true },
        country: { type: String, default: 'France' }
    },
    order: {
        offerType: { type: String, enum: ['early-bird', 'standard', 'collector'], required: true },
        amount: { type: Number, required: true },
        currency: { type: String, default: 'EUR' }
    },
    payment: {
        stripePaymentId: String,
        status: { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending' },
        method: String,
        paidAt: Date
    },
    status: {
        current: { type: String, enum: ['confirmed', 'production', 'shipped', 'delivered'], default: 'confirmed' },
        history: [{
            status: String,
            date: { type: Date, default: Date.now },
            description: String
        }]
    },
    tracking: {
        number: String,
        carrier: String,
        url: String
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const Precommande = mongoose.model('Precommande', PrecommandeSchema);

// Configuration Email
const transporter = nodemailer.createTransporter({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Générateur de numéro de commande
function generateOrderNumber() {
    const prefix = 'ORD';
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}-${timestamp}-${random}`;
}

// Routes API

// Route racine
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Statistiques des précommandes
app.get('/api/stats', async (req, res) => {
    try {
        const stats = await Precommande.aggregate([
            {
                $group: {
                    _id: null,
                    totalOrders: { $sum: 1 },
                    totalAmount: { $sum: '$order.amount' },
                    paidOrders: { $sum: { $cond: [{ $eq: ['$payment.status', 'paid'] }, 1, 0] } },
                    earlyBirdCount: { $sum: { $cond: [{ $eq: ['$order.offerType', 'early-bird'] }, 1, 0] } },
                    standardCount: { $sum: { $cond: [{ $eq: ['$order.offerType', 'standard'] }, 1, 0] } },
                    collectorCount: { $sum: { $cond: [{ $eq: ['$order.offerType', 'collector'] }, 1, 0] } }
                }
            }
        ]);

        const geoStats = await Precommande.aggregate([
            { $group: { _id: '$shipping.country', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        res.json({
            ...stats[0],
            objectif: 500,
            progression: Math.round((stats[0]?.paidOrders || 0) / 500 * 100),
            geoDistribution: geoStats
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Création d'une session de paiement Stripe - désactivé
app.post('/api/create-checkout-session', async (req, res) => {
    try {
        return res.status(503).json({ error: 'Service de paiement temporairement indisponible' });
    } catch (error) {
        console.error('Erreur création session Stripe:', error);
        res.status(500).json({ error: error.message });
    }
});

// Webhook Stripe
app.post('/api/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    // Webhook Stripe désactivé - clé secrète supprimée
    console.log('Webhook Stripe désactivé - clé secrète supprimée');
    return res.status(503).json({ error: 'Service temporairement indisponible' });

    // Gestion des événements
    switch (event.type) {
        case 'checkout.session.completed':
            const session = event.data.object;
            await handleSuccessfulPayment(session);
            break;
        case 'checkout.session.expired':
            await handleExpiredSession(event.data.object);
            break;
        default:
            console.log(`Unhandled event type ${event.type}`);
    }

    res.json({ received: true });
});

// Gestion du paiement réussi
async function handleSuccessfulPayment(session) {
    try {
        const orderNumber = session.metadata.orderNumber;
        
        const precommande = await Precommande.findOne({ orderNumber });
        if (!precommande) return;

        // Mise à jour du statut de paiement
        precommande.payment.status = 'paid';
        precommande.payment.paidAt = new Date();
        precommande.payment.method = session.payment_method_types[0];
        
        // Ajout à l'historique
        precommande.status.history.push({
            status: 'paid',
            description: 'Paiement confirmé avec succès'
        });

        await precommande.save();

        // Envoi de l'email de confirmation
        await sendConfirmationEmail(precommande);

        console.log(`Paiement confirmé pour la commande ${orderNumber}`);
    } catch (error) {
        console.error('Erreur gestion paiement réussi:', error);
    }
}

// Gestion de session expirée
async function handleExpiredSession(session) {
    try {
        const orderNumber = session.metadata.orderNumber;
        
        const precommande = await Precommande.findOne({ orderNumber });
        if (!precommande) return;

        precommande.payment.status = 'failed';
        await precommande.save();

        console.log(`Session expirée pour la commande ${orderNumber}`);
    } catch (error) {
        console.error('Erreur gestion session expirée:', error);
    }
}

// Envoi d'email de confirmation
async function sendConfirmationEmail(precommande) {
    try {
        const htmlTemplate = await generateEmailTemplate(precommande);
        
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: precommande.customer.email,
            subject: `Confirmation de votre précommande ORADIA - ${precommande.orderNumber}`,
            html: htmlTemplate
        });

        console.log(`Email de confirmation envoyé à ${precommande.customer.email}`);
    } catch (error) {
        console.error('Erreur envoi email:', error);
    }
}

// Génération du template email
async function generateEmailTemplate(precommande) {
    // Ici vous pouvez charger le template HTML et remplacer les variables
    const fs = require('fs').promises;
    const template = await fs.readFile('./emails/templates/precommande-confirmation.html', 'utf8');
    
    return template
        .replace(/\{\{customer_name\}\}/g, precommande.customer.name)
        .replace(/\{\{order_number\}\}/g, precommande.orderNumber)
        .replace(/\{\{offer_name\}\}/g, precommande.order.offerType.charAt(0).toUpperCase() + precommande.order.offerType.slice(1))
        .replace(/\{\{order_amount\}\}/g, precommande.order.amount)
        .replace(/\{\{payment_method\}\}/g, precommande.payment.method)
        .replace(/\{\{order_date\}\}/g, precommande.createdAt.toLocaleDateString('fr-FR'))
        .replace(/\{\{shipping_address\}\}/g, precommande.shipping.address)
        .replace(/\{\{shipping_postal_code\}\}/g, precommande.shipping.postalCode)
        .replace(/\{\{shipping_city\}\}/g, precommande.shipping.city)
        .replace(/\{\{shipping_country\}\}/g, precommande.shipping.country);
}

// Export CSV pour l'admin
app.get('/api/export/csv', async (req, res) => {
    try {
        const precommandes = await Precommande.find({ 'payment.status': 'paid' })
            .sort({ createdAt: -1 });

        const csv = [
            ['ID Commande', 'Nom', 'Email', 'Offre', 'Montant', 'Date', 'Statut', 'Adresse'],
            ...precommandes.map(p => [
                p.orderNumber,
                p.customer.name,
                p.customer.email,
                p.order.offerType,
                p.order.amount + '€',
                p.createdAt.toLocaleDateString('fr-FR'),
                p.payment.status,
                `${p.shipping.address}, ${p.shipping.postalCode} ${p.shipping.city}`
            ])
        ].map(row => row.join(',')).join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=precommandes_oradia.csv');
        res.send(csv);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Mise à jour du statut de production
app.patch('/api/orders/:orderNumber/status', async (req, res) => {
    try {
        const { status, description, tracking } = req.body;
        const { orderNumber } = req.params;

        const precommande = await Precommande.findOne({ orderNumber });
        if (!precommande) {
            return res.status(404).json({ error: 'Commande non trouvée' });
        }

        precommande.status.current = status;
        precommande.status.history.push({
            status,
            description: description || `Mise à jour du statut vers ${status}`
        });

        if (tracking) {
            precommande.tracking = tracking;
        }

        precommande.updatedAt = new Date();
        await precommande.save();

        // Envoyer une notification email
        await sendStatusUpdateEmail(precommande, status, description);

        res.json({ success: true, precommande });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Envoi d'email de mise à jour de statut
async function sendStatusUpdateEmail(precommande, status, description) {
    try {
        const subject = `Mise à jour de votre précommande ORADIA - ${precommande.orderNumber}`;
        const htmlContent = `
            <h2>Votre précommande ORADIA a été mise à jour</h2>
            <p><strong>Statut actuel:</strong> ${status}</p>
            <p><strong>Description:</strong> ${description}</p>
            <p>Connectez-vous à votre espace membre pour plus de détails.</p>
        `;

        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: precommande.customer.email,
            subject,
            html: htmlContent
        });

        console.log(`Email de mise à jour envoyé pour ${precommande.orderNumber}`);
    } catch (error) {
        console.error('Erreur envoi email de mise à jour:', error);
    }
}

// Démarrage du serveur
app.listen(PORT, () => {
    console.log(`🚀 Serveur ORADIA précommandes démarré sur le port ${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}/api/stats`);
    console.log(`🔍 Santé: http://localhost:${PORT}/api/health`);
});

// Gestion des erreurs non capturées
process.on('unhandledRejection', (err) => {
    console.error('Erreur non gérée:', err);
});

process.on('uncaughtException', (err) => {
    console.error('Exception non capturée:', err);
    process.exit(1);
});

module.exports = app;
