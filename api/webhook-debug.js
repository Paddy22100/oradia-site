// Endpoint de debug pour webhook Stripe
// URL: https://oradia.fr/api/webhook-debug
// Permet de capturer TOUS les appels webhook sans traitement

const handler = async (req, res) => {
    try {
        console.log('🔍 WEBHOOK DEBUG APPELÉ');
        console.log('📋 Méthode:', req.method);
        console.log('📋 Headers:', Object.keys(req.headers));
        
        // Log des headers importants
        const importantHeaders = {
            'stripe-signature': req.headers['stripe-signature'],
            'content-type': req.headers['content-type'],
            'user-agent': req.headers['user-agent'],
            'x-forwarded-for': req.headers['x-forwarded-for'],
            'x-vercel-id': req.headers['x-vercel-id']
        };
        
        console.log('📋 Headers importants:', importantHeaders);
        
        // Log du corps brut
        console.log('📦 Corps brut (req.body):', JSON.stringify(req.body, null, 2));
        
        // Vérification si c'est bien Stripe
        const isStripe = req.headers['stripe-signature'] && 
                       req.headers['user-agent']?.includes('Stripe');
        
        console.log('🔍 Source Stripe:', isStripe ? '✅' : '❌');
        
        // Si c'est un événement Stripe, analysons-le
        if (isStripe && req.body) {
            console.log('🎯 Événement Stripe détecté');
            console.log('  - Type:', req.body.type);
            console.log('  - ID:', req.body.id);
            console.log('  - Created:', req.body.created);
            
            if (req.body.type === 'checkout.session.completed') {
                const session = req.body.data.object;
                console.log('🛒 Session checkout:');
                console.log('  - Session ID:', session.id);
                console.log('  - Email:', session.customer_details?.email);
                console.log('  - Montant:', session.amount_total);
                console.log('  - Offer:', session.metadata?.offer);
                console.log('  - Status:', session.payment_status);
                
                // Vérification des données critiques
                const criticalData = {
                    email: session.customer_details?.email || session.customer_email || session.metadata?.email,
                    offer: session.metadata?.offer,
                    sessionId: session.id,
                    amount: session.amount_total,
                    paid: session.payment_status === 'paid'
                };
                
                console.log('📊 Données critiques:', criticalData);
                
                const validation = {
                    email: !!criticalData.email,
                    offer: !!criticalData.offer,
                    sessionId: !!criticalData.sessionId,
                    amount: criticalData.amount > 0,
                    paid: criticalData.paid
                };
                
                console.log('✅ Validation données:', validation);
                const allValid = Object.values(validation).every(v => v);
                console.log('🎯 Données valides:', allValid ? '✅' : '❌');
                
                if (allValid) {
                    console.log('🔥 CE WEBHOOK DEVRAIT FONCTIONNER AVEC LE VRAI CODE !');
                } else {
                    console.log('⚠️ Problème dans les données - vérifier metadata Stripe');
                }
            }
        }
        
        // Réponse de succès
        const response = {
            status: '✅ Webhook debug reçu',
            timestamp: new Date().toISOString(),
            method: req.method,
            isStripe: isStripe,
            eventType: req.body?.type || 'unknown',
            hasBody: !!req.body,
            headers: importantHeaders,
            bodySample: req.body ? {
                type: req.body.type,
                id: req.body.id,
                dataObjectKeys: req.body.data?.object ? Object.keys(req.body.data.object) : []
            } : null
        };
        
        console.log('📊 Réponse envoyée:', response);
        
        return res.status(200).json(response);
        
    } catch (error) {
        console.error('❌ ERREUR WEBHOOK DEBUG:', error);
        return res.status(500).json({
            error: 'Webhook debug failed',
            message: error.message,
            stack: error.stack
        });
    }
};

module.exports = handler;
