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
        // 2. Session membre active (connecté)
        const sess = sessionStorage.getItem('oradia_member_session');
        if (sess) {
            try {
                const { email, subscribed } = JSON.parse(sess);
                if (email && subscribed) return true;
            } catch (e) {}
        }
        return false;
    }

    canDrawTore() {
        if (this.isSubscribed()) return true;
        return this.getToreDrawData().count < 1;
    }

    recordToreDraw() {
        const data = this.getToreDrawData();
        data.count += 1;
        localStorage.setItem('oradia_tore_draws', JSON.stringify(data));
    }

    showToreLimitReached() {
        const modal = document.createElement('div');
        modal.id = 'tore-limit-modal';
        modal.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;';
        modal.innerHTML = `
            <div style="position:absolute;inset:0;background:url('images/oradia-hero-4k.png') center/cover no-repeat;"></div>
            <div style="position:absolute;inset:0;background:linear-gradient(160deg,rgba(2,6,23,0.92) 0%,rgba(5,20,40,0.88) 100%);backdrop-filter:blur(4px);"></div>
            <div style="position:relative;max-width:640px;width:100%;text-align:center;">
                <!-- Logo -->
                <div style="display:flex;align-items:center;justify-content:center;gap:16px;margin-bottom:36px;">
                    <img src="images/logo-hd-v2.jpeg" alt="Oradia" style="width:72px;height:72px;border-radius:50%;object-fit:cover;border:1.5px solid rgba(212,175,55,0.5);box-shadow:0 0 32px rgba(212,175,55,0.25);" />
                    <span style="font-family:'Cormorant Garamond',Georgia,serif;font-size:36px;font-weight:700;letter-spacing:0.25em;text-transform:uppercase;background:linear-gradient(135deg,#f0c75e,#d4af37);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;">ORADIA</span>
                </div>
                <div style="width:72px;height:1px;background:linear-gradient(90deg,transparent,rgba(212,175,55,0.65),transparent);margin:0 auto 32px;"></div>
                <p style="font-family:'Lora',Georgia,serif;font-size:12px;letter-spacing:0.48em;text-transform:uppercase;color:rgba(212,175,55,0.5);margin-bottom:18px;">Votre chemin continue</p>
                <h2 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:clamp(28px,5.5vw,42px);font-weight:700;color:#f0c75e;margin-bottom:22px;line-height:1.2;text-shadow:0 2px 32px rgba(212,175,55,0.2);">Vous avez complété votre<br>tirage gratuit du jour</h2>
                <p style="font-family:'Lora',Georgia,serif;font-size:17px;color:rgba(229,231,235,0.70);line-height:1.8;margin-bottom:36px;max-width:480px;margin-left:auto;margin-right:auto;">Le Tore est une expérience de transformation profonde.<br>L'abonnement mensuel vous ouvre un accès illimité à l'exploration intérieure.</p>
                <!-- CTA abonnement -->
                <a href="tore-abonnement.html" style="display:inline-block;background:linear-gradient(135deg,rgba(212,175,55,0.22),rgba(212,175,55,0.10));border:1.5px solid rgba(212,175,55,0.85);color:#f0c75e;font-family:'Cormorant Garamond',Georgia,serif;font-size:18px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;padding:18px 48px;border-radius:50px;text-decoration:none;box-shadow:0 0 40px rgba(212,175,55,0.2),0 12px 32px rgba(0,0,0,0.55);" onmouseover="this.style.background='linear-gradient(135deg,rgba(212,175,55,0.35),rgba(212,175,55,0.18))'" onmouseout="this.style.background='linear-gradient(135deg,rgba(212,175,55,0.22),rgba(212,175,55,0.10))'">✦ Découvrir l'abonnement</a>
                <!-- Séparateur -->  
                <div style="display:flex;align-items:center;gap:14px;margin:36px 0 20px;">
                    <div style="flex:1;height:1px;background:rgba(212,175,55,0.15);"></div>
                    <span style="font-family:'Lora',Georgia,serif;font-size:13px;color:rgba(212,175,55,0.38);letter-spacing:0.12em;">Déjà abonné ?</span>
                    <div style="flex:1;height:1px;background:rgba(212,175,55,0.15);"></div>
                </div>
                <!-- Bouton connexion -->
                <div style="margin-bottom:16px;">
                    <a href="member/login.html" onclick="sessionStorage.setItem('oradia_login_return', window.location.href)" style="display:inline-flex;align-items:center;gap:10px;background:linear-gradient(135deg,#d4af37,#f4e4c1);color:#0a192f;font-family:'Cormorant Garamond',Georgia,serif;font-size:16px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;padding:14px 36px;border-radius:50px;text-decoration:none;box-shadow:0 8px 24px rgba(212,175,55,0.35);">
                        <i class="fas fa-user-circle"></i> Se connecter à mon espace
                    </a>
                </div>
                <!-- Fermer -->
                <button onclick="document.getElementById('tore-limit-modal').remove()" style="background:none;border:none;color:rgba(212,175,55,0.28);font-family:'Lora',Georgia,serif;font-size:13px;cursor:pointer;letter-spacing:0.08em;margin-top:8px;" onmouseover="this.style.color='rgba(212,175,55,0.6)'" onmouseout="this.style.color='rgba(212,175,55,0.28)'">Fermer</button>
                <p style="font-family:'Lora',Georgia,serif;font-size:12px;color:rgba(148,163,184,0.32);margin-top:20px;">Votre tirage gratuit se renouvelle chaque jour.</p>
            </div>
        `;
        document.body.appendChild(modal);
    }
}

// Instance globale
window.freemiumTracker = new FreemiumTracker();
