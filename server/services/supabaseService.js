const { createClient } = require('@supabase/supabase-js');

// Initialisation du client Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('⚠️ SUPABASE_URL ou SUPABASE_ANON_KEY manquant dans .env');
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Service Supabase pour gérer les inscriptions à la précommande
 */
class SupabaseService {
    /**
     * Créer un nouvel inscrit
     */
    async createSubscriber(data) {
        try {
            const { data: subscriber, error } = await supabase
                .from('precommande_subscribers')
                .insert([{
                    email: data.email,
                    name: data.name,
                    ip_address: data.ip_address,
                    user_agent: data.user_agent,
                    source: data.source || 'website',
                    status: data.status || 'pending',
                    subscribed_at: new Date().toISOString()
                }])
                .select()
                .single();

            if (error) {
                console.error('Erreur Supabase createSubscriber:', error);
                throw error;
            }

            return subscriber;
        } catch (error) {
            console.error('Erreur createSubscriber:', error);
            throw error;
        }
    }

    /**
     * Trouver un inscrit par email
     */
    async findSubscriberByEmail(email) {
        try {
            const { data, error } = await supabase
                .from('precommande_subscribers')
                .select('*')
                .eq('email', email)
                .single();

            if (error && error.code !== 'PGRST116') { // PGRST116 = not found
                console.error('Erreur Supabase findSubscriberByEmail:', error);
                throw error;
            }

            return data;
        } catch (error) {
            console.error('Erreur findSubscriberByEmail:', error);
            return null;
        }
    }

    /**
     * Mettre à jour le statut d'un inscrit
     */
    async updateSubscriberStatus(subscriberId, status) {
        try {
            const { data, error } = await supabase
                .from('precommande_subscribers')
                .update({ 
                    status,
                    updated_at: new Date().toISOString()
                })
                .eq('id', subscriberId)
                .select()
                .single();

            if (error) {
                console.error('Erreur Supabase updateSubscriberStatus:', error);
                throw error;
            }

            return data;
        } catch (error) {
            console.error('Erreur updateSubscriberStatus:', error);
            throw error;
        }
    }

    /**
     * Obtenir les statistiques des inscriptions
     */
    async getSubscriptionStats() {
        try {
            // Total des inscrits
            const { count: totalCount, error: totalError } = await supabase
                .from('precommande_subscribers')
                .select('*', { count: 'exact', head: true });

            if (totalError) throw totalError;

            // Inscrits confirmés
            const { count: confirmedCount, error: confirmedError } = await supabase
                .from('precommande_subscribers')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'confirmed');

            if (confirmedError) throw confirmedError;

            // Inscrits en attente
            const { count: pendingCount, error: pendingError } = await supabase
                .from('precommande_subscribers')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'pending');

            if (pendingError) throw pendingError;

            // Inscriptions des 7 derniers jours
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            const { count: recentCount, error: recentError } = await supabase
                .from('precommande_subscribers')
                .select('*', { count: 'exact', head: true })
                .gte('subscribed_at', sevenDaysAgo.toISOString());

            if (recentError) throw recentError;

            return {
                total: totalCount || 0,
                confirmed: confirmedCount || 0,
                pending: pendingCount || 0,
                recent_7_days: recentCount || 0,
                last_updated: new Date().toISOString()
            };
        } catch (error) {
            console.error('Erreur getSubscriptionStats:', error);
            throw error;
        }
    }

    /**
     * Inscrire un abonné à la newsletter
     */
    async createNewsletterSubscriber(data) {
        try {
            const { data: subscriber, error } = await supabase
                .from('newsletter_contacts')
                .upsert([{
                    email: data.email,
                    full_name: data.name || null,
                    source: data.source || 'user_registration',
                    brevo_synced: false
                }], { onConflict: 'email', ignoreDuplicates: false })
                .select()
                .single();

            if (error) {
                console.error('Erreur Supabase createNewsletterSubscriber:', error);
                throw error;
            }

            return subscriber;
        } catch (error) {
            console.error('Erreur createNewsletterSubscriber:', error);
            throw error;
        }
    }

    /**
     * Enregistrer un événement analytics
     */
    async logEvent(eventData) {
        try {
            const { data, error } = await supabase
                .from('analytics_events')
                .insert([{
                    event_type: eventData.event_type,
                    email: eventData.email,
                    metadata: eventData.metadata,
                    created_at: new Date().toISOString()
                }])
                .select()
                .single();

            if (error) {
                console.error('Erreur Supabase logEvent:', error);
                // Ne pas throw, analytics non-critique
                return null;
            }

            return data;
        } catch (error) {
            console.error('Erreur logEvent:', error);
            return null;
        }
    }

    /**
     * Obtenir tous les inscrits (avec pagination)
     */
    async getAllSubscribers(page = 1, limit = 50) {
        try {
            const from = (page - 1) * limit;
            const to = from + limit - 1;

            const { data, error, count } = await supabase
                .from('precommande_subscribers')
                .select('*', { count: 'exact' })
                .order('subscribed_at', { ascending: false })
                .range(from, to);

            if (error) {
                console.error('Erreur Supabase getAllSubscribers:', error);
                throw error;
            }

            return {
                subscribers: data,
                total: count,
                page,
                limit,
                totalPages: Math.ceil(count / limit)
            };
        } catch (error) {
            console.error('Erreur getAllSubscribers:', error);
            throw error;
        }
    }

    /**
     * Exporter les inscrits en CSV
     */
    async exportSubscribers() {
        try {
            const { data, error } = await supabase
                .from('precommande_subscribers')
                .select('email, name, status, subscribed_at, source')
                .order('subscribed_at', { ascending: false });

            if (error) {
                console.error('Erreur Supabase exportSubscribers:', error);
                throw error;
            }

            return data;
        } catch (error) {
            console.error('Erreur exportSubscribers:', error);
            throw error;
        }
    }
}

module.exports = new SupabaseService();
