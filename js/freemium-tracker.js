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
        if (document.getElementById('tore-limit-modal')) return;
        _saveToreEmailSilent();

        if (!document.getElementById('tore-limit-modal-styles')) {
            const style = document.createElement('style');
            style.id = 'tore-limit-modal-styles';
            style.textContent = `
                @keyframes toreModalFadeIn { from { opacity:0; } to { opacity:1; } }
                @keyframes toreModalCardIn { from { opacity:0; transform:translateY(16px) scale(0.97); } to { opacity:1; transform:translateY(0) scale(1); } }
                @keyframes toreStarPulse { 0%,100% { transform:scale(1); opacity:0.9; } 50% { transform:scale(1.15); opacity:1; } }
                #tore-limit-modal .tlm-card { animation: toreModalCardIn 0.45s cubic-bezier(0.22,1,0.36,1); }
                #tore-limit-modal .tlm-star { animation: toreStarPulse 2.6s ease-in-out infinite; }
                #tore-limit-modal .tlm-cta { transition:transform 0.25s ease, box-shadow 0.25s ease; }
                #tore-limit-modal .tlm-cta:hover { transform:translateY(-2px); box-shadow:0 8px 30px rgba(212,175,55,0.5); }
                #tore-limit-modal .tlm-secondary { transition:background 0.2s ease, border-color 0.2s ease, transform 0.2s ease; }
                #tore-limit-modal .tlm-secondary:hover { background:rgba(212,175,55,0.1); border-color:rgba(212,175,55,0.55); transform:translateY(-1px); }
                #tore-limit-modal .tlm-close { transition:color 0.2s ease, border-color 0.2s ease; }
                #tore-limit-modal .tlm-close:hover { color:rgba(233,231,223,0.85); border-color:rgba(233,231,223,0.35); }
                #tore-limit-modal .tlm-email { width:100%;box-sizing:border-box;background:rgba(255,255,255,0.05);border:1px solid rgba(212,175,55,0.4);border-radius:8px;padding:10px 14px;color:#f5e7a1;font-size:0.88rem;outline:none;font-family:Georgia,serif; }
                #tore-limit-modal .tlm-email::placeholder { color:rgba(212,175,55,0.35); }
                #tore-limit-modal .tlm-email:focus { border-color:rgba(212,175,55,0.75); }
                #tore-limit-modal .tlm-offer { flex:1;border-radius:14px;padding:18px 12px;text-align:center; }
            `;
            document.head.appendChild(style);
        }

        const modal = document.createElement('div');
        modal.id = 'tore-limit-modal';
        modal.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(2,6,23,0.85);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);animation:toreModalFadeIn 0.3s ease;';
        modal.innerHTML = `
            <div class="tlm-card" role="dialog" aria-modal="true" aria-label="Tirages offerts utilisés"
                 style="position:relative;text-align:center;max-width:480px;width:100%;
                        padding:36px 24px 28px;border-radius:20px;
                        background:linear-gradient(160deg,#0c1730 0%,#0a1224 100%);
                        border:1px solid rgba(212,175,55,0.28);
                        box-shadow:0 24px 70px rgba(0,0,0,0.6),0 0 60px rgba(212,175,55,0.08);">

                <button data-close-limit-modal aria-label="Fermer"
                        style="position:absolute;top:14px;right:16px;background:none;border:none;
                               color:rgba(233,231,223,0.4);font-size:1.3rem;line-height:1;cursor:pointer;padding:4px;">&times;</button>

                <div class="tlm-star" style="font-size:2rem;color:#d4af37;margin-bottom:12px;text-shadow:0 0 20px rgba(212,175,55,0.5);">✦</div>

                <h3 style="font-family:'Cinzel',serif;font-size:1.15rem;color:#d4af37;margin:0 0 10px;letter-spacing:0.05em;line-height:1.4;">
                    Vous avez exploré vos deux tirages offerts
                </h3>
                <p style="color:rgba(233,231,223,0.72);font-size:0.88rem;line-height:1.65;margin:0 auto 20px;max-width:360px;">
                    Pour continuer à recevoir une guidance approfondie, choisissez la formule qui vous correspond.
                </p>

                <!-- Champ email (affiché si email non connu) -->
                <div id="tlm-email-wrapper" style="display:none;margin-bottom:16px;">
                    <input id="tlm-email-input" type="email" class="tlm-email" placeholder="Votre adresse email" autocomplete="email" />
                </div>

                <!-- Grille 2 offres -->
                <div style="display:flex;gap:10px;margin-bottom:20px;">

                    <!-- Découverte -->
                    <div class="tlm-offer" style="border:1px solid rgba(212,175,55,0.32);background:rgba(255,255,255,0.02);">
                        <p style="color:rgba(212,175,55,0.55);font-size:0.68rem;letter-spacing:0.2em;text-transform:uppercase;margin:0 0 6px;">Découverte</p>
                        <p style="color:#f0c75e;font-size:1.5rem;font-weight:700;margin:0 0 12px;font-family:'Cinzel',serif;">5€<span style="font-size:0.75rem;font-weight:400;color:rgba(212,175,55,0.6);">/mois</span></p>
                        <ul style="list-style:none;padding:0;margin:0 0 16px;text-align:left;color:rgba(233,231,223,0.7);font-size:0.8rem;line-height:1.8;">
                            <li>✦ 1 tirage par jour</li>
                            <li>✦ Historique 30 jours</li>
                        </ul>
                        <button id="tlm-btn-decouverte" class="tlm-secondary"
                                style="width:100%;padding:10px 8px;border-radius:999px;border:1px solid rgba(212,175,55,0.4);
                                       background:rgba(212,175,55,0.06);color:#d4af37;font-size:0.82rem;font-weight:600;
                                       cursor:pointer;font-family:Georgia,serif;">
                            Choisir Découverte
                        </button>
                    </div>

                    <!-- Complète (mise en avant) -->
                    <div class="tlm-offer" style="border:2px solid rgba(212,175,55,0.65);background:rgba(212,175,55,0.06);
                                                   box-shadow:0 0 28px rgba(212,175,55,0.1);">
                        <p style="color:rgba(212,175,55,0.5);font-size:0.62rem;letter-spacing:0.2em;text-transform:uppercase;margin:0 0 2px;">Recommandé</p>
                        <p style="color:rgba(212,175,55,0.65);font-size:0.65rem;letter-spacing:0.18em;text-transform:uppercase;margin:0 0 6px;">Complète</p>
                        <p style="color:#f0c75e;font-size:1.5rem;font-weight:700;margin:0 0 12px;font-family:'Cinzel',serif;">8€<span style="font-size:0.75rem;font-weight:400;color:rgba(212,175,55,0.6);">/mois</span></p>
                        <ul style="list-style:none;padding:0;margin:0 0 16px;text-align:left;color:rgba(233,231,223,0.7);font-size:0.8rem;line-height:1.8;">
                            <li>✦ Tirages illimités</li>
                            <li>✦ Historique complet</li>
                            <li>✦ Espace membres</li>
                        </ul>
                        <button id="tlm-btn-complet" class="tlm-cta"
                                style="width:100%;padding:10px 8px;border-radius:999px;
                                       background:linear-gradient(135deg,#e6c456,#c79b2f);
                                       color:#0a1224;font-size:0.82rem;font-weight:700;
                                       border:none;cursor:pointer;font-family:'Cinzel',serif;
                                       box-shadow:0 4px 20px rgba(212,175,55,0.35);">
                            Choisir l'offre Complète
                        </button>
                    </div>

                </div>

                <button data-close-limit-modal class="tlm-close"
                        style="display:inline-block;padding:7px 18px;border-radius:999px;
                               background:none;border:1px solid rgba(233,231,223,0.12);
                               color:rgba(233,231,223,0.42);font-size:0.78rem;cursor:pointer;">
                    Peut-être plus tard
                </button>
            </div>
        `;
        document.body.appendChild(modal);

        // Email connu depuis la session membre
        let knownEmail = '';
        try {
            const sessStr = sessionStorage.getItem('oradia_member_session')
                          || localStorage.getItem('oradia_member_session');
            if (sessStr) knownEmail = JSON.parse(sessStr).email || '';
        } catch (_) {}

        if (!knownEmail) {
            document.getElementById('tlm-email-wrapper').style.display = 'block';
        }

        // Handler checkout commun aux deux boutons
        const handleCheckout = async (type) => {
            const emailInput = document.getElementById('tlm-email-input');
            const email = knownEmail || (emailInput ? emailInput.value.trim() : '');

            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                const wrapper = document.getElementById('tlm-email-wrapper');
                if (wrapper) wrapper.style.display = 'block';
                if (emailInput) {
                    emailInput.style.borderColor = '#e05252';
                    emailInput.focus();
                }
                return;
            }

            const btnD = document.getElementById('tlm-btn-decouverte');
            const btnC = document.getElementById('tlm-btn-complet');
            [btnD, btnC].forEach(b => {
                if (b) { b.disabled = true; b.textContent = 'Chargement…'; b.style.opacity = '0.6'; b.style.cursor = 'default'; }
            });

            try {
                const resp = await fetch('/api/create-checkout-session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type, email })
                });
                const data = await resp.json();
                if (data.url) {
                    window.location.href = data.url;
                } else {
                    throw new Error('No URL returned');
                }
            } catch (_) {
                [btnD, btnC].forEach(b => {
                    if (b) { b.disabled = false; b.style.opacity = '1'; b.style.cursor = 'pointer'; }
                });
                if (btnD) btnD.textContent = 'Choisir Découverte';
                if (btnC) btnC.textContent = "Choisir l'offre Complète";
                alert('Une erreur est survenue. Réessayez.');
            }
        };

        modal.querySelector('#tlm-btn-decouverte')?.addEventListener('click', () => handleCheckout('tore-decouverte'));
        modal.querySelector('#tlm-btn-complet')?.addEventListener('click',    () => handleCheckout('tore-complet'));

        const closeModal = () => modal.remove();
        modal.querySelectorAll('[data-close-limit-modal]').forEach(btn => btn.addEventListener('click', closeModal));
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
        const onKey = (e) => { if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', onKey); } };
        document.addEventListener('keydown', onKey);
    }
}

// Instance globale
window.freemiumTracker = new FreemiumTracker();

function _saveToreEmailSilent() {
    try {
        const sources = [
            sessionStorage.getItem('oradia_member_session'),
            localStorage.getItem('oradia_member_session'),
            sessionStorage.getItem('oradia_session'),
            sessionStorage.getItem('userData'),
            localStorage.getItem('userEmail')
        ];
        let email = '';
        for (const s of sources) {
            if (!s) continue;
            if (s.startsWith('{')) { const e = JSON.parse(s).email; if (e) { email = e; break; } }
            else if (s.includes('@')) { email = s; break; }
        }
        if (!email) return;
        fetch('/api/auth/save-tore-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        }).catch(() => {});
    } catch(e) {}
}
