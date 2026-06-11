// api/admin/api-usage-tracker.js
// Service pour tracker l'utilisation des API en temps réel

const { createClient } = require('@supabase/supabase-js');

// Créer une table si elle n'existe pas (à exécuter une fois dans Supabase)
/*
CREATE TABLE api_usage_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    api_name TEXT NOT NULL,
    model_name TEXT NOT NULL,
    request_tokens INTEGER,
    response_tokens INTEGER,
    total_tokens INTEGER,
    cost_usd DECIMAL(10,6),
    cost_eur DECIMAL(10,6),
    user_email TEXT,
    ip_address TEXT,
    status TEXT, -- 'success', 'error', 'fallback'
    error_message TEXT,
    request_duration_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    INDEX idx_api_created (api_name, created_at),
    INDEX idx_created_at (created_at)
);
*/

const supabase = createClient(
    process.env.SUPABASE_URL || 'https://nxzetkdozynyutlbhxdx.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Tarifs Anthropic (mis à jour régulièrement)
const ANTHROPIC_PRICING = {
    'claude-haiku-4-5': {
        input_per_mtok: 0.0008,    // $0.80 per 1M input tokens
        output_per_mtok: 0.004     // $4.00 per 1M output tokens
    },
    'claude-3-5-haiku-20241022': {
        input_per_mtok: 0.0008,
        output_per_mtok: 0.004
    },
    'claude-sonnet-4-5': {
        input_per_mtok: 0.003,
        output_per_mtok: 0.015
    }
};

const USD_TO_EUR = 0.92;

/**
 * Enregistre une utilisation d'API
 */
async function logApiUsage({
    apiName,
    modelName,
    requestTokens,
    responseTokens,
    userEmail,
    ipAddress,
    status = 'success',
    errorMessage = null,
    requestDurationMs
}) {
    try {
        const totalTokens = (requestTokens || 0) + (responseTokens || 0);
        
        // Calculer le coût
        const pricing = ANTHROPIC_PRICING[modelName] || ANTHROPIC_PRICING['claude-haiku-4-5'];
        const costUsd = (requestTokens || 0) * pricing.input_per_mtok / 1000000 + 
                       (responseTokens || 0) * pricing.output_per_mtok / 1000000;
        const costEur = costUsd * USD_TO_EUR;

        const { data, error } = await supabase
            .from('api_usage_logs')
            .insert({
                api_name: apiName,
                model_name: modelName,
                request_tokens: requestTokens,
                response_tokens: responseTokens,
                total_tokens: totalTokens,
                cost_usd: Math.round(costUsd * 1000000) / 1000000, // 6 décimales
                cost_eur: Math.round(costEur * 1000000) / 1000000,
                user_email: userEmail,
                ip_address: ipAddress,
                status,
                error_message: errorMessage,
                request_duration_ms: requestDurationMs,
                created_at: new Date().toISOString()
            })
            .select();

        if (error) {
            console.error('[API Usage] Error logging usage:', error);
        }

        return { success: !error, data, error };
    } catch (err) {
        console.error('[API Usage] Exception logging usage:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Récupère les statistiques d'utilisation pour une période
 */
async function getUsageStats(startDate, endDate = null) {
    try {
        let query = supabase
            .from('api_usage_logs')
            .select('*')
            .gte('created_at', startDate);

        if (endDate) {
            query = query.lte('created_at', endDate);
        }

        const { data, error } = await query.order('created_at', { ascending: false });

        if (error) throw error;

        // Agréger les données
        const stats = {
            totalCalls: data.length,
            successfulCalls: data.filter(log => log.status === 'success').length,
            errorCalls: data.filter(log => log.status === 'error').length,
            fallbackCalls: data.filter(log => log.status === 'fallback').length,
            totalTokens: data.reduce((sum, log) => sum + (log.total_tokens || 0), 0),
            totalCostUsd: data.reduce((sum, log) => sum + (log.cost_usd || 0), 0),
            totalCostEur: data.reduce((sum, log) => sum + (log.cost_eur || 0), 0),
            byModel: {},
            byDay: {}
        };

        // Stats par modèle
        data.forEach(log => {
            if (!stats.byModel[log.model_name]) {
                stats.byModel[log.model_name] = {
                    calls: 0,
                    tokens: 0,
                    costEur: 0
                };
            }
            stats.byModel[log.model_name].calls++;
            stats.byModel[log.model_name].tokens += log.total_tokens || 0;
            stats.byModel[log.model_name].costEur += log.cost_eur || 0;
        });

        // Stats par jour
        data.forEach(log => {
            const day = log.created_at.split('T')[0];
            if (!stats.byDay[day]) {
                stats.byDay[day] = {
                    calls: 0,
                    tokens: 0,
                    costEur: 0
                };
            }
            stats.byDay[day].calls++;
            stats.byDay[day].tokens += log.total_tokens || 0;
            stats.byDay[day].costEur += log.cost_eur || 0;
        });

        return { success: true, data: stats };
    } catch (err) {
        console.error('[API Usage] Error getting stats:', err);
        return { success: false, error: err.message };
    }
}

module.exports = {
    logApiUsage,
    getUsageStats,
    ANTHROPIC_PRICING
};
