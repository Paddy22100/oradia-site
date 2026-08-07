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

    // Tirages bonus gagnés via le parrainage (voir js/referral.js) — s'ajoutent
    // aux 2 tirages gratuits de base, jamais un remplacement.
    getBonusDraws() {
        return parseInt(localStorage.getItem('oradia_tore_bonus_draws') || '0', 10);
    }

    addBonusDraws(n) {
        if (!n || n <= 0) return;
        const current = this.getBonusDraws();
        localStorage.setItem('oradia_tore_bonus_draws', String(current + n));
    }

    canDrawTore() {
        if (this.isSubscribed()) return true;
        const used = parseInt(localStorage.getItem('oradia_tore_lifetime_draws') || '0', 10);
        return used < (2 + this.getBonusDraws());
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
        return Math.max(0, 2 + this.getBonusDraws() - used);
    }

    showToreLimitReached() {
        if (document.getElementById('tore-limit-modal')) return;
        if (!document.getElementById('tore-limit-modal-styles')) {
            const style = document.createElement('style');
            style.id = 'tore-limit-modal-styles';
            style.textContent = `
                @keyframes toreModalFadeIn { from{opacity:0} to{opacity:1} }
                @keyframes toreModalCardIn { from{opacity:0;transform:translateY(24px) scale(0.96)} to{opacity:1;transform:translateY(0) scale(1)} }
                #tore-limit-modal .tlm-card { animation:toreModalCardIn 0.55s cubic-bezier(0.22,1,0.36,1); }
                #tore-limit-modal .tlm-cta:hover { opacity:0.88; transform:translateY(-2px); box-shadow:0 12px 40px rgba(212,175,55,0.55) !important; }
                #tore-limit-modal .tlm-secondary:hover { background:rgba(212,175,55,0.1) !important; border-color:rgba(212,175,55,0.6) !important; transform:translateY(-1px); }
                #tore-limit-modal .tlm-cta, #tore-limit-modal .tlm-secondary { transition:all 0.22s ease; }
                #tore-limit-modal .tlm-email { width:100%;box-sizing:border-box;background:rgba(7,20,42,0.8);border:1px solid rgba(212,175,55,0.35);border-radius:8px;padding:11px 16px;color:#f5e7a1;font-size:0.9rem;outline:none;font-family:Georgia,serif; }
                #tore-limit-modal .tlm-email::placeholder { color:rgba(212,175,55,0.3); }
                #tore-limit-modal .tlm-email:focus { border-color:rgba(212,175,55,0.65);box-shadow:0 0 0 3px rgba(212,175,55,0.1); }
                #tore-limit-modal .tlm-close:hover { color:rgba(233,231,223,0.6) !important; }
                #tore-limit-modal .tlm-offers-row { display:flex;gap:10px;margin-bottom:20px;align-items:stretch; }
                #tore-limit-modal .tlm-offers-left { flex:1;display:flex;flex-direction:row;gap:10px;min-width:0; }
                #tore-limit-modal .tlm-offers-left > div { flex:1;display:flex;flex-direction:column; }
                #tore-limit-modal .tlm-preorder { width:190px;flex-shrink:0;border-radius:12px;overflow:hidden;text-decoration:none;position:relative;display:block;transition:transform 0.2s ease,box-shadow 0.2s ease;box-shadow:0 4px 20px rgba(0,0,0,0.4);min-height:210px; }
                #tore-limit-modal .tlm-preorder:hover { transform:scale(1.02);box-shadow:0 8px 32px rgba(212,175,55,0.25); }
                @media(max-width:440px){ #tore-limit-modal .tlm-preorder { width:130px; } }
                @media(max-width:360px){ #tore-limit-modal .tlm-preorder { width:100px; } }
            `;
            document.head.appendChild(style);
        }

        const modal = document.createElement('div');
        modal.id = 'tore-limit-modal';
        modal.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:12px;background:url(\'/images/oradia-hero-4k.webp\') center/cover no-repeat;animation:toreModalFadeIn 0.35s ease;overflow-y:auto;';
        modal.style.setProperty('--tlm-bg', 'rgba(2,6,20,0.82)');
        // Overlay sombre sur l'image hero
        const bgOverlay = document.createElement('div');
        bgOverlay.style.cssText = 'position:fixed;inset:0;z-index:-1;background:rgba(2,6,20,0.82);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);';
        modal.appendChild(bgOverlay);
        modal.innerHTML = `
            <div class="tlm-card" role="dialog" aria-modal="true" aria-label="Tirages offerts utilisés"
                 style="position:relative;width:calc(100vw - 24px);max-width:600px;border-radius:0;overflow:hidden;
                        border:1px solid rgba(212,175,55,0.25);
                        box-shadow:0 32px 90px rgba(0,0,0,0.8),0 0 60px rgba(212,175,55,0.06);
                        font-family:Georgia,'Times New Roman',serif;">

                <!-- ── HEADER style email ── -->
                <div style="background:linear-gradient(160deg,#0d1e3a 0%,#0f2545 100%);padding:30px 28px 24px;text-align:center;border-bottom:1px solid rgba(212,175,55,0.18);position:relative;">
                    <button data-close-limit-modal aria-label="Fermer"
                            style="position:absolute;top:12px;right:14px;background:none;border:none;color:rgba(233,231,223,0.35);font-size:1.4rem;line-height:1;cursor:pointer;padding:4px 8px;">×</button>
                    <div style="display:inline-flex;align-items:center;gap:8px;margin-bottom:14px;">
                        <img src="/images/logo-hd-v2.webp" alt="O" style="width:36px;height:36px;border-radius:50%;border:1px solid rgba(212,175,55,0.4);">
                        <span style="color:#d4af37;font-family:Georgia,serif;font-size:24px;font-weight:700;letter-spacing:5px;text-transform:uppercase;line-height:1;">RADIA</span>
                    </div>
                    <h3 style="margin:0 0 8px;color:#f0c75e;font-family:Georgia,serif;font-size:1.4rem;font-weight:700;letter-spacing:1px;text-transform:uppercase;line-height:1.35;">
                        Vos deux tirages offerts<br>ont été explorés
                    </h3>
                    <p style="margin:0;color:rgba(212,175,55,0.45);font-size:0.75rem;letter-spacing:3px;text-transform:uppercase;">La Boussole Intérieure</p>
                </div>

                <!-- ── CORPS ── -->
                <div style="background:rgba(6,14,32,0.96);padding:26px 22px;">
                <div style="position:relative;">

                    <p style="color:rgba(233,231,223,0.75);font-size:1rem;line-height:1.75;margin:0 auto 22px;text-align:center;font-style:italic;max-width:400px;">
                        Pour continuer à recevoir une guidance approfondie, choisissez la formule qui vous correspond.
                    </p>

                    <!-- Séparateur -->
                    <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(212,175,55,0.15),transparent);margin:0 auto 20px;"></div>

                    <!-- Offres + pub côte à côte -->
                    <div class="tlm-offers-row">

                        <!-- Colonne gauche : 2 offres empilées -->
                        <div class="tlm-offers-left">

                            <!-- Complète — offre unique -->
                            <div style="flex:1;background:rgba(212,175,55,0.06);border:1.5px solid rgba(212,175,55,0.5);border-radius:14px;padding:20px 16px 16px;text-align:center;box-shadow:0 0 28px rgba(212,175,55,0.1);display:flex;flex-direction:column;">
                                <p style="color:rgba(212,175,55,0.7);font-size:0.72rem;letter-spacing:2px;text-transform:uppercase;margin:0 0 8px;">Accès complet · Offre de lancement</p>
                                <p style="margin:0 0 4px;line-height:1;">
                                    <span style="color:rgba(212,175,55,0.35);font-size:1.1rem;font-weight:700;text-decoration:line-through;margin-right:6px;">8€</span>
                                    <span style="color:#f0c75e;font-size:1.75rem;font-weight:700;">5€ <span style="font-size:0.72rem;color:rgba(212,175,55,0.5);font-weight:400;">/1er mois</span></span>
                                </p>
                                <p style="color:rgba(212,175,55,0.5);font-size:0.72rem;letter-spacing:0.5px;margin:0 0 10px;">puis 8€/mois · sans engagement</p>
                                <div style="height:1px;background:rgba(212,175,55,0.18);margin:0 0 10px;"></div>
                                <ul style="list-style:none;padding:0;margin:0 0 12px;text-align:left;color:rgba(233,231,223,0.8);font-size:0.85rem;line-height:2;">
                                    <li>✦ Tirages illimités</li>
                                    <li>✦ Historique complet</li>
                                    <li>✦ Espace membres</li>
                                </ul>
                                <button id="tlm-btn-complet" class="tlm-cta"
                                        style="width:100%;padding:12px;border-radius:50px;
                                               background:linear-gradient(135deg,#d4af37,#f0c75e);
                                               color:#050f23;font-size:0.85rem;font-weight:700;
                                               border:none;cursor:pointer;letter-spacing:1px;text-transform:uppercase;
                                               box-shadow:0 4px 18px rgba(212,175,55,0.38);margin-top:auto;">
                                    Choisir
                                </button>
                            </div>
                        </div>

                        <!-- Colonne droite : pub précommande -->
                        <a href="/precommande-oracle.html" class="tlm-preorder">
                            <img src="/images/medias/apercu_stripe.webp" alt="Oracle Oradia coffret physique"
                                 style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;display:block;">
                            <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(3,8,20,0.96) 0%,rgba(3,8,20,0.5) 50%,rgba(3,8,20,0.15) 100%);"></div>
                            <!-- Badge haut -->
                            <div style="position:absolute;top:8px;left:0;right:0;text-align:center;">
                                <span style="display:inline-block;background:rgba(212,175,55,0.15);border:1px solid rgba(212,175,55,0.4);color:#d4af37;font-size:0.6rem;letter-spacing:1.5px;text-transform:uppercase;padding:4px 9px;border-radius:50px;">Édition limitée</span>
                            </div>
                            <!-- Contenu bas -->
                            <div style="position:absolute;bottom:0;left:0;right:0;padding:12px 10px;text-align:center;">
                                <p style="margin:0 0 3px;color:#f5e7a1;font-size:0.9rem;font-weight:700;line-height:1.25;text-shadow:0 1px 4px rgba(0,0,0,0.8);">Tenez-le<br>entre vos mains</p>
                                <p style="margin:0 0 8px;color:rgba(212,175,55,0.7);font-size:0.65rem;line-height:1.4;">64 cartes · Livret · Coffret</p>
                                <span style="display:inline-block;background:linear-gradient(135deg,#d4af37,#f0c75e);color:#050f23;font-size:0.75rem;font-weight:700;letter-spacing:0.5px;padding:6px 11px;border-radius:50px;box-shadow:0 2px 8px rgba(212,175,55,0.4);">
                                    Je réserve · 38€
                                </span>
                            </div>
                        </a>
                    </div>

                    <!-- Séparateur -->
                    <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(212,175,55,0.15),transparent);margin:20px auto;"></div>

                    <!-- Parrainage : alternative gratuite au paiement -->
                    <div style="text-align:center;margin-bottom:20px;">
                        <p style="color:#f0c75e;font-family:Georgia,serif;font-size:1.05rem;font-weight:700;margin:0 0 6px;">
                            <i class="fas fa-gift" style="margin-right:7px;font-size:0.9rem;"></i>Ou offrez un tirage à un proche
                        </p>
                        <p style="color:rgba(233,231,223,0.65);font-size:0.85rem;line-height:1.65;margin:0 auto 16px;max-width:380px;">
                            Partagez votre lien : la personne qui l'utilise reçoit un tirage gratuit — et vous en gagnez un aussi.
                        </p>
                        <div style="display:flex;flex-wrap:wrap;gap:8px;max-width:400px;width:100%;margin:0 auto;box-sizing:border-box;">
                            <input id="tlm-referral-link-input" type="text" readonly
                                style="flex:1 1 180px;min-width:0;width:100%;background:rgba(5,20,40,0.85);border:1px solid rgba(212,175,55,0.3);border-radius:10px;color:#e8d9b0;font-family:Georgia,serif;font-size:12.5px;padding:12px;outline:none;box-sizing:border-box;text-align:center;">
                            <button id="tlm-referral-copy-btn" class="tlm-secondary"
                                style="flex:1 1 auto;background:transparent;color:#f0c75e;border:1px solid rgba(212,175,55,0.5);border-radius:10px;padding:0 18px;font-family:Georgia,serif;font-size:0.85rem;font-weight:700;cursor:pointer;min-height:44px;">
                                <i class="fas fa-copy" style="margin-right:6px;font-size:12px;"></i>Copier
                            </button>
                            <button id="tlm-referral-share-btn" class="tlm-secondary" style="display:none;flex:1 1 auto;background:transparent;color:#f0c75e;border:1px solid rgba(212,175,55,0.5);border-radius:10px;padding:0 18px;font-family:Georgia,serif;font-size:0.85rem;font-weight:700;cursor:pointer;min-height:44px;">
                                <i class="fas fa-share-nodes" style="margin-right:6px;font-size:12px;"></i>Partager
                            </button>
                        </div>
                    </div>

                    <p style="color:rgba(233,231,223,0.32);font-size:0.72rem;text-align:center;margin:10px 0 8px;font-style:italic;">
                        En vous abonnant, vous serez ajouté(e) à notre newsletter. Désabonnement possible à tout moment.
                    </p>
                    <button data-close-limit-modal class="tlm-close"
                            style="display:block;width:100%;padding:6px;background:none;border:none;
                                   color:rgba(233,231,223,0.28);font-size:0.85rem;cursor:pointer;
                                   font-style:italic;text-align:center;letter-spacing:0.05em;">
                        Peut-être plus tard
                    </button>
                </div></div>
            </div>
        `;
        document.body.appendChild(modal);

        if (window.oradiaReferral) {
            window.oradiaReferral.wireShareUI(
                document.getElementById('tlm-referral-link-input'),
                document.getElementById('tlm-referral-copy-btn'),
                document.getElementById('tlm-referral-share-btn')
            );
        }

        // Email connu depuis la session membre (pré-rempli dans Stripe si disponible)
        let knownEmail = '';
        try {
            const sessStr = sessionStorage.getItem('oradia_member_session')
                          || localStorage.getItem('oradia_member_session');
            if (sessStr) knownEmail = JSON.parse(sessStr).email || '';
        } catch (_) {}

        // Handler checkout commun aux deux boutons
        const handleCheckout = async (type) => {
            const email = knownEmail || '';

            const btnC = document.getElementById('tlm-btn-complet');
            if (btnC) { btnC.disabled = true; btnC.textContent = 'Chargement…'; btnC.style.opacity = '0.6'; btnC.style.cursor = 'default'; }

            try {
                const resp = await fetch('/api/create-checkout-session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type, email, promoCode: 'promo_1TtZP25oaKXBczQqQEQ85oV7' })
                });
                const data = await resp.json();
                if (data.url) {
                    window.location.href = data.url;
                } else {
                    throw new Error('No URL returned');
                }
            } catch (_) {
                if (btnC) { btnC.disabled = false; btnC.style.opacity = '1'; btnC.style.cursor = 'pointer'; btnC.textContent = "S'abonner"; }
                alert('Une erreur est survenue. Réessayez.');
            }
        };

        modal.querySelector('#tlm-btn-complet')?.addEventListener('click', () => handleCheckout('tore-complet'));

        const closeModal = () => modal.remove();
        modal.querySelectorAll('[data-close-limit-modal]').forEach(btn => btn.addEventListener('click', closeModal));
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
        const onKey = (e) => { if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', onKey); } };
        document.addEventListener('keydown', onKey);
    }
}

// Instance globale
window.freemiumTracker = new FreemiumTracker();

