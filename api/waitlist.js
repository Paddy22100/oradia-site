const https = require('https');
const { createClient } = require('@supabase/supabase-js');

// Configuration Supabase
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Configuration Brevo
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_WAITLIST_LIST_ID = process.env.BREVO_WAITLIST_LIST_ID;

// Client Supabase
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Validation d'email simple
 */
function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Appel API Brevo pour ajouter un contact à la liste d'attente
 */
async function addToBrevoWaitlist(email) {
    return new Promise((resolve, reject) => {
        if (!BREVO_API_KEY || !BREVO_WAITLIST_LIST_ID) {
            reject(new Error('Configuration Brevo manquante'));
            return;
        }

        const data = JSON.stringify({
            email: email,
            listIds: [parseInt(BREVO_WAITLIST_LIST_ID)],
            updateEnabled: true
        });

        const options = {
            hostname: 'api.brevo.com',
            port: 443,
            path: '/v3/contacts',
            method: 'POST',
            headers: {
                'api-key': BREVO_API_KEY,
                'Content-Type': 'application/json',
                'Content-Length': data.length
            }
        };

        const req = https.request(options, (res) => {
            let responseData = '';

            res.on('data', (chunk) => {
                responseData += chunk;
            });

            res.on('end', () => {
                try {
                    const parsedData = JSON.parse(responseData);
                    resolve({
                        statusCode: res.statusCode,
                        data: parsedData
                    });
                } catch (error) {
                    reject(error);
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.write(data);
        req.end();
    });
}

/**
 * Handler principal pour la route /api/waitlist
 * Option A : Supabase first, Brevo second
 */
export default async function handler(req, res) {
    console.log(' === WAITLIST API V2 CALLED ===');
    console.log(' Method:', req.method);
    console.log(' Headers:', Object.keys(req.headers));
    
    // Vérifier la méthode HTTP
    if (req.method !== 'POST') {
        console.error(' Méthode non autorisée:', req.method);
        return res.status(405).json({
            success: false,
            message: 'Méthode non autorisée'
        });
    }

    try {
        // Parser le body
        const body = req.body;
        console.log(' Body reçu:', JSON.stringify(body, null, 2));
        const { email, fullName } = body;

        // Validation de l'email
        if (!email || typeof email !== 'string') {
            return res.status(400).json({
                success: false,
                message: 'L\'adresse email est requise'
            });
        }

        const trimmedEmail = email.trim();
        if (!validateEmail(trimmedEmail)) {
            return res.status(400).json({
                success: false,
                message: 'Veuillez entrer une adresse email valide'
            });
        }

        console.log(' Email validé:', trimmedEmail);

        // ÉTAPE 1 : Enregistrement dans Supabase (CRITIQUE)
        console.log(' ÉTAPE 1: Enregistrement Supabase...');
        
        const supabaseData = {
            email: trimmedEmail,
            full_name: fullName || null,
            source: 'oradia-tirages',
            status: 'active',
            brevo_synced: false,
            metadata: {
                ip_address: req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown',
                user_agent: req.headers['user-agent'] || 'unknown',
                created_at: new Date().toISOString()
            }
        };

        console.log(' Données Supabase:', JSON.stringify(supabaseData, null, 2));

        // Upsert dans Supabase
        const { data: supabaseResult, error: supabaseError } = await supabase
            .from('waitlist_tirages')
            .upsert(supabaseData, {
                onConflict: 'email',
                ignoreDuplicates: false
            })
            .select()
            .single();

        if (supabaseError) {
            console.error(' Erreur Supabase:', supabaseError);
            return res.status(500).json({
                success: false,
                message: 'Erreur lors de l\'enregistrement en base de données',
                error: supabaseError.message
            });
        }

        console.log(' Supabase SUCCESS:', JSON.stringify(supabaseResult, null, 2));

        // ÉTAPE 2 : Tentative de synchronisation Brevo (non critique)
        console.log('📡 ÉTAPE 2: Tentative synchro Brevo...');
        
        let brevoSynced = false;
        let brevoError = null;

        try {
            if (BREVO_API_KEY && BREVO_WAITLIST_LIST_ID) {
                console.log('📡 Appel Brevo API pour:', trimmedEmail);
                const brevoResult = await addToBrevoWaitlist(trimmedEmail);
                
                console.log('📡 Réponse Brevo - Status:', brevoResult.statusCode);
                console.log('📡 Réponse Brevo - Data:', JSON.stringify(brevoResult.data, null, 2));

                if (brevoResult.statusCode === 201 || brevoResult.statusCode === 200) {
                    // Succès Brevo - mettre à jour Supabase
                    brevoSynced = true;
                    
                    const { error: updateError } = await supabase
                        .from('waitlist_tirages')
                        .update({
                            brevo_synced: true,
                            brevo_synced_at: new Date().toISOString(),
                            brevo_error: null,
                            updated_at: new Date().toISOString()
                        })
                        .eq('email', trimmedEmail);

                    if (updateError) {
                        console.warn('⚠️ Erreur mise à jour brevo_synced:', updateError);
                    } else {
                        console.log('✅ Brevo sync status updated in Supabase');
                    }
                } else {
                    // Échec Brevo - logger mais ne pas casser le flux
                    brevoError = `Brevo ${brevoResult.statusCode}: ${JSON.stringify(brevoResult.data)}`;
                    console.warn('⚠️ Brevo FAILED mais Supabase OK - flux continue');
                    console.warn('⚠️ Brevo error details:', brevoError);
                    
                    // Mettre à jour Supabase avec l'erreur
                    const { error: updateError } = await supabase
                        .from('waitlist_tirages')
                        .update({
                            brevo_synced: false,
                            brevo_error: brevoError,
                            updated_at: new Date().toISOString()
                        })
                        .eq('email', trimmedEmail);

                    if (updateError) {
                        console.warn('⚠️ Erreur mise à jour brevo_error:', updateError);
                    }
                }
            } else {
                brevoError = 'Configuration Brevo manquante';
                console.warn('⚠️ Brevo non configuré - skip sync');
                
                // Mettre à jour Supabase avec l'erreur de configuration
                const { error: updateError } = await supabase
                    .from('waitlist_tirages')
                    .update({
                        brevo_synced: false,
                        brevo_error: brevoError,
                        updated_at: new Date().toISOString()
                    })
                    .eq('email', trimmedEmail);
            }
        } catch (error) {
            brevoError = error.message;
            console.error('❌ Erreur Brevo (non critique):', error);
            
            // Mettre à jour Supabase avec l'erreur
            const { error: updateError } = await supabase
                .from('waitlist_tirages')
                .update({
                    brevo_synced: false,
                    brevo_error: brevoError,
                    updated_at: new Date().toISOString()
                })
                .eq('email', trimmedEmail);
        }

        // ÉTAPE 3 : Réponse finale (succès si Supabase OK)
        console.log(' WAITLIST V2 SUCCESS');
        console.log(' Résumé:', {
            email: trimmedEmail,
            supabase_id: supabaseResult.id,
            brevo_synced: brevoSynced,
            brevo_error: brevoError
        });

        return res.status(200).json({
            success: true,
            brevoSynced: brevoSynced,
            message: brevoSynced 
                ? 'Inscription réussie et synchronisée avec Brevo.'
                : 'Inscription enregistrée. Synchronisation Brevo en cours.',
            data: {
                id: supabaseResult.id,
                email: supabaseResult.email,
                created_at: supabaseResult.created_at
            }
        });

    } catch (error) {
        console.error(' Waitlist V2 API error:', error);
        console.error('Stack trace:', error.stack);
        
        return res.status(500).json({
            success: false,
            message: 'Erreur technique interne. Veuillez réessayer plus tard.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}
