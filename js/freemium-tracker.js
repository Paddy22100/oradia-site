/**
 * Système de tracking Freemium pour Oracle Oradia
 * Gère les limitations de tirages gratuits et encourage la conversion
 */

class FreemiumTracker {
    constructor() {
        this.storageKey = 'oradia_free_draws';
        this.maxFreeDraws = 5; // 5 tirages gratuits par mois
        this.init();
    }

    init() {
        this.checkAndResetMonthly();
        
        // Migration : si une ancienne clé de limite existe, la convertir
        const OLD_KEYS = [
            'oradia_tore_draws', 'tore_daily_draws', 'tore_draws_today',
            'oradia_tore_daily', 'tore_monthly_draws'
        ];
        const alreadyMigrated = localStorage.getItem('oradia_tore_lifetime_draws');
        if (!alreadyMigrated) {
            let legacyCount = 0;
            OLD_KEYS.forEach(k => {
                const v = localStorage.getItem(k);
                if (v && !isNaN(parseInt(v, 10))) {
                    legacyCount = Math.max(legacyCount, parseInt(v, 10));
                }
            });
            // Plafonner à 2 pour ne pas bloquer d'emblée les gros utilisateurs
            localStorage.setItem('oradia_tore_lifetime_draws',
              String(Math.min(legacyCount, 2)));
        }
    }

    /**
     * Récupère les données de tirages depuis localStorage
     */
    getDrawData() {
        const data = localStorage.getItem(this.storageKey);
        if (!data) {
            return {
                count: 0,
                lastDraw: null,
                month: new Date().getMonth(),
                year: new Date().getFullYear()
            };
        }
        try {
            return JSON.parse(data);
        } catch (e) {
            return { count: 0, lastDraw: null, month: new Date().getMonth(), year: new Date().getFullYear() };
        }
    }

    /**
     * Sauvegarde les données de tirages
     */
    saveDrawData(data) {
        localStorage.setItem(this.storageKey, JSON.stringify(data));
    }

    /**
     * Vérifie et réinitialise le compteur chaque mois
     */
    checkAndResetMonthly() {
        const data = this.getDrawData();
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();

        // Réinitialiser si on est dans un nouveau mois
        if (data.month !== currentMonth || data.year !== currentYear) {
            this.saveDrawData({
                count: 0,
                lastDraw: null,
                month: currentMonth,
                year: currentYear
            });
        }
    }

    /**
     * Enregistre un nouveau tirage
     */
    recordDraw() {
        const data = this.getDrawData();
        data.count += 1;
        data.lastDraw = new Date().toISOString();
        this.saveDrawData(data);
        
        // Afficher un message si proche de la limite
        if (data.count >= this.maxFreeDraws - 1) {
            this.showLimitWarning(data.count);
        }
    }

    /**
     * Vérifie si l'utilisateur peut faire un tirage
     */
    canDraw() {
        const data = this.getDrawData();
        return data.count < this.maxFreeDraws;
    }

    /**
     * Obtient le nombre de tirages restants
     */
    getRemainingDraws() {
        const data = this.getDrawData();
        return Math.max(0, this.maxFreeDraws - data.count);
    }

    /**
     * Affiche un avertissement de limite
     */
    showLimitWarning(currentCount) {
        const remaining = this.maxFreeDraws - currentCount;
        
        if (remaining === 1) {
            this.showNotification(
                '⚠️ Dernier tirage gratuit',
                `C'est votre dernier tirage gratuit ce mois-ci. Découvrez l'oracle physique pour des tirages illimités !`,
                'warning'
            );
        } else if (remaining === 0) {
            this.showLimitReached();
        }
    }

    /**
     * Affiche le message de limite atteinte
     */
    showLimitReached() {
        // Créer une modale élégante
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-night-blue/90 backdrop-blur-sm z-50 flex items-center justify-center p-4';
        modal.innerHTML = `
            <div class="bg-gradient-to-b from-dark-blue to-night-blue border-2 border-gold/30 rounded-2xl p-8 md:p-12 max-w-2xl w-full text-center relative animate-fade-in-up">
                <div class="w-20 h-20 mx-auto bg-gradient-to-br from-gold/30 to-gold/10 rounded-full border-2 border-gold/50 flex items-center justify-center mb-6">
                    <i class="fas fa-star text-3xl text-gold"></i>
                </div>
                
                <h3 class="cormorant text-3xl md:text-4xl font-bold text-gold mb-4">
                    Vous avez utilisé vos 5 tirages gratuits
                </h3>
                
                <p class="text-lg text-light-gold/90 mb-6 leading-relaxed">
                    Vous avez découvert la puissance de l'Oracle Oradia. 
                    Pour continuer votre chemin de guidance, plusieurs options s'offrent à vous :
                </p>
                
                <div class="grid md:grid-cols-2 gap-4 mb-8">
                    <div class="bg-gold/10 border border-gold/30 rounded-xl p-6">
                        <i class="fas fa-box-open text-3xl text-gold mb-3"></i>
                        <h4 class="font-cinzel text-xl font-bold text-gold mb-2">Oracle Physique</h4>
                        <p class="text-sm text-light-gold/80 mb-4">Tirages illimités avec vos propres cartes</p>
                        <a href="precommande-oracle.html" class="inline-block bg-gradient-to-r from-gold to-light-gold text-night-blue font-bold py-3 px-6 rounded-full hover:shadow-lg transition-all">
                            Précommander
                        </a>
                    </div>
                    
                    <div class="bg-gold/10 border border-gold/30 rounded-xl p-6">
                        <i class="fas fa-calendar text-3xl text-gold mb-3"></i>
                        <h4 class="font-cinzel text-xl font-bold text-gold mb-2">Consultation</h4>
                        <p class="text-sm text-light-gold/80 mb-4">Guidance personnalisée avec moi</p>
                        <a href="rendez-vous.html" class="inline-block bg-gradient-to-r from-gold to-light-gold text-night-blue font-bold py-3 px-6 rounded-full hover:shadow-lg transition-all">
                            Réserver
                        </a>
                    </div>
                </div>
                
                <p class="text-sm text-light-gold/70 mb-6">
                    Vos tirages gratuits se renouvelleront le mois prochain
                </p>
                
                <button onclick="this.closest('.fixed').remove()" class="text-gold/70 hover:text-gold transition-colors">
                    <i class="fas fa-times mr-2"></i>
                    Fermer
                </button>
            </div>
        `;
        
        document.body.appendChild(modal);
    }

    /**
     * Affiche une notification
     */
    showNotification(title, message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `fixed top-4 right-4 bg-gradient-to-r from-gold/20 to-gold/10 border-2 border-gold/30 rounded-xl p-6 max-w-md z-50 animate-fade-in-up shadow-lg backdrop-blur-sm`;
        notification.innerHTML = `
            <div class="flex items-start gap-4">
                <i class="fas fa-${type === 'warning' ? 'exclamation-triangle' : 'info-circle'} text-2xl text-gold"></i>
                <div class="flex-1">
                    <h4 class="font-cinzel font-bold text-gold mb-2">${title}</h4>
                    <p class="text-sm text-light-gold/90">${message}</p>
                </div>
                <button onclick="this.closest('.fixed').remove()" class="text-gold/70 hover:text-gold transition-colors">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Auto-fermeture après 8 secondes
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 8000);
    }

    /**
     * Affiche le compteur de tirages restants
     */
    displayRemainingDraws() {
        const remaining = this.getRemainingDraws();
        const badge = document.createElement('div');
        badge.className = 'fixed bottom-4 left-4 bg-gold/10 border border-gold/30 rounded-full px-4 py-2 backdrop-blur-sm z-40';
        badge.innerHTML = `
            <span class="text-gold text-sm font-semibold">
                <i class="fas fa-gift mr-2"></i>
                ${remaining} tirage${remaining > 1 ? 's' : ''} gratuit${remaining > 1 ? 's' : ''} restant${remaining > 1 ? 's' : ''}
            </span>
        `;
        
        // Supprimer l'ancien badge s'il existe
        const oldBadge = document.querySelector('.fixed.bottom-4.left-4');
        if (oldBadge) oldBadge.remove();
        
        document.body.appendChild(badge);
    }

    // ── Méthodes spécifiques au Tore (limite 3 tirages gratuits/mois) ──

    getToreDrawData() {
        const data = localStorage.getItem('oradia_tore_draws');
        const today = new Date().toDateString();
        if (!data) return { count: 0, day: today };
        try {
            const parsed = JSON.parse(data);
            if (parsed.day !== today) {
                return { count: 0, day: today };
            }
            return parsed;
        } catch (e) {
            return { count: 0, day: today };
        }
    }

    isSubscribed() {
        // 1. Code validé avec expiry stocké
        const data = localStorage.getItem('oradia_subscription');
        if (data) {
            try {
                const { expiry } = JSON.parse(data);
                if (expiry && new Date(expiry) > new Date()) return true;
            } catch (e) {}
        }
        // 2. Session membre active avec flag subscribed (sessionStorage)
        const sess = sessionStorage.getItem('oradia_member_session');
        if (sess) {
            try {
                const { email, subscribed } = JSON.parse(sess);
                if (email && subscribed) return true;
            } catch (e) {}
        }
        // 3. Session persistante localStorage (remember me) avec flag subscribed
        const lSess = localStorage.getItem('oradia_member_session');
        if (lSess) {
            try {
                const { email, subscribed } = JSON.parse(lSess);
                if (email && subscribed) return true;
            } catch (e) {}
        }
        return false;
    }

    canDrawTore() {
        if (this.isSubscribed()) return true;
        const used = parseInt(localStorage.getItem('oradia_tore_lifetime_draws') || '0', 10);
        return used < 2;
    }

    recordToreDraw() {
        if (this.isSubscribed()) return;
        const used = parseInt(localStorage.getItem('oradia_tore_lifetime_draws') || '0', 10);
        localStorage.setItem('oradia_tore_lifetime_draws', String(used + 1));
    }

    getRemainingToreDraws() {
        const used = parseInt(
            localStorage.getItem('oradia_tore_lifetime_draws') || '0', 10
        );
        return Math.max(0, 2 - used);
    }

    showToreLimitReached() {
        const modal = document.createElement('div');
        modal.id = 'tore-limit-modal';
        modal.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(2,6,23,0.85);backdrop-filter:blur(4px);';
        modal.innerHTML = `
            <div style="text-align:center;padding:8px 0 4px;max-width:400px;width:100%;">
                <div style="font-size:1.6rem;margin-bottom:12px;">✦</div>
                <h3 style="font-family:'Cinzel',serif;font-size:1.1rem;
                           color:#d4af37;margin-bottom:12px;letter-spacing:0.05em;">
                  Vos 2 tirages gratuits ont été utilisés
                </h3>
                <p style="color:rgba(233,231,223,0.75);font-size:0.88rem;
                          line-height:1.6;margin-bottom:20px;">
                  Vous avez exploré La Boussole Intérieure à travers 2 tirages complets.
                  Pour continuer à recevoir une guidance approfondie à tout moment,
                  découvrez l'abonnement Oradia.
                </p>

                <!-- CTA principal : abonnement -->
                <a href="/abonnement"
                   style="display:inline-block;background:linear-gradient(135deg,#d4af37,#b8962e);
                          color:#020817;font-family:'Cinzel',serif;font-size:0.9rem;
                          font-weight:700;padding:12px 28px;border-radius:999px;
                          text-decoration:none;letter-spacing:0.04em;
                          box-shadow:0 4px 20px rgba(212,175,55,0.35);">
                  Accéder aux tirages illimités →
                </a>
                <p style="color:rgba(212,175,55,0.5);font-size:0.75rem;margin-top:8px;">
                  8€ / mois · Sans engagement
                </p>

                <!-- Séparateur -->
                <div style="margin:16px auto;width:60px;height:1px;
                            background:rgba(212,175,55,0.2);"></div>

                <!-- CTA secondaire : tirage ponctuel -->
                <a href="#" id="btn-single-draw-purchase"
                     data-todo="create-single-draw-page"
                    style="color:rgba(212,175,55,0.6);font-size:0.82rem;
                           text-decoration:underline;cursor:pointer;display:block;">
                  Ou acheter un tirage unique (3,90€)
                </a>
                <span style="color:rgba(212,175,55,0.35);font-size:0.7rem;
                             display:block;margin-top:4px;">
                  L'abonnement est rentable dès le 3ème tirage
                </span>

                <!-- Fermeture discrète -->
                <button data-close-limit-modal
                        style="display:block;margin:20px auto 0;background:none;border:none;
                               color:rgba(233,231,223,0.3);font-size:0.75rem;
                               cursor:pointer;text-decoration:underline;">
                  Peut-être plus tard
                </button>
            </div>
        `;
        document.body.appendChild(modal);
        
        // Gestionnaire de fermeture
        modal.querySelector('[data-close-limit-modal]')?.addEventListener('click', () => {
            modal.remove();
        });
    }
}

// Instance globale
window.freemiumTracker = new FreemiumTracker();
