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
                #tore-limit-modal .tlm-offers-row { display:flex;gap:8px;margin-bottom:14px;align-items:stretch; }
                #tore-limit-modal .tlm-offers-left { flex:1;display:flex;flex-direction:row;gap:8px;min-width:0; }
                #tore-limit-modal .tlm-offers-left > div { flex:1;display:flex;flex-direction:column; }
                #tore-limit-modal .tlm-preorder { width:160px;flex-shrink:0;border-radius:10px;overflow:hidden;text-decoration:none;position:relative;display:block;transition:opacity 0.2s ease;box-shadow:0 4px 20px rgba(0,0,0,0.4);min-height:200px; }
                #tore-limit-modal .tlm-preorder:hover { opacity:0.88; }
                @media(max-width:420px){ #tore-limit-modal .tlm-preorder { width:110px; } }
            `;
            document.head.appendChild(style);
        }

        const modal = document.createElement('div');
        modal.id = 'tore-limit-modal';
        modal.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:12px;background:rgba(2,6,20,0.88);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);animation:toreModalFadeIn 0.35s ease;overflow-y:auto;';
        modal.innerHTML = `
            <div class="tlm-card" role="dialog" aria-modal="true" aria-label="Tirages offerts utilisés"
                 style="position:relative;width:calc(100vw - 24px);max-width:560px;border-radius:0;overflow:hidden;
                        border:1px solid rgba(212,175,55,0.25);
                        box-shadow:0 32px 90px rgba(0,0,0,0.8),0 0 60px rgba(212,175,55,0.06);
                        font-family:Georgia,'Times New Roman',serif;">

                <!-- ── HEADER style email ── -->
                <div style="background:linear-gradient(160deg,#0d1e3a 0%,#0f2545 100%);padding:26px 24px 20px;text-align:center;border-bottom:1px solid rgba(212,175,55,0.18);position:relative;">
                    <button data-close-limit-modal aria-label="Fermer"
                            style="position:absolute;top:12px;right:14px;background:none;border:none;color:rgba(233,231,223,0.35);font-size:1.4rem;line-height:1;cursor:pointer;padding:4px 8px;">×</button>
                    <div style="display:inline-flex;align-items:center;gap:8px;margin-bottom:12px;">
                        <img src="/images/logo-hd-v2.webp" alt="O" style="width:32px;height:32px;border-radius:50%;border:1px solid rgba(212,175,55,0.4);">
                        <span style="color:#d4af37;font-family:Georgia,serif;font-size:22px;font-weight:700;letter-spacing:6px;text-transform:uppercase;line-height:1;">RADIA</span>
                    </div>
                    <h3 style="margin:0 0 6px;color:#f0c75e;font-family:Georgia,serif;font-size:1.2rem;font-weight:700;letter-spacing:2px;text-transform:uppercase;line-height:1.3;">
                        Vos deux tirages offerts<br>ont été explorés
                    </h3>
                    <p style="margin:0;color:rgba(212,175,55,0.4);font-size:0.65rem;letter-spacing:3px;text-transform:uppercase;">La Boussole Intérieure</p>
                </div>

                <!-- ── CORPS ── -->
                <div style="position:relative;background:url('/images/oradia-hero-4k.webp') center/cover no-repeat;padding:20px 18px;">
                <div style="position:absolute;inset:0;background:rgba(6,14,32,0.84);pointer-events:none;"></div>
                <div style="position:relative;">

                    <p style="color:rgba(233,231,223,0.68);font-size:0.88rem;line-height:1.75;margin:0 auto 18px;text-align:center;font-style:italic;max-width:340px;">
                        Pour continuer à recevoir une guidance approfondie, choisissez la formule qui vous correspond.
                    </p>

                    <!-- Email -->
                    <div id="tlm-email-wrapper" style="display:none;margin-bottom:16px;">
                        <p style="color:rgba(212,175,55,0.55);font-size:0.68rem;letter-spacing:3px;text-transform:uppercase;margin:0 0 7px;text-align:center;">✦ Votre email pour recevoir le lien d'accès</p>
                        <input id="tlm-email-input" type="email" class="tlm-email" placeholder="votre@email.fr" autocomplete="email" />
                    </div>

                    <!-- Séparateur -->
                    <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(212,175,55,0.15),transparent);margin:0 auto 18px;"></div>

                    <!-- Offres + pub côte à côte -->
                    <div class="tlm-offers-row">

                        <!-- Colonne gauche : 2 offres empilées -->
                        <div class="tlm-offers-left">

                            <!-- Découverte -->
                            <div style="flex:1;background:rgba(255,255,255,0.04);border:1px solid rgba(212,175,55,0.2);border-radius:12px;padding:14px 10px 12px;text-align:center;">
                                <p style="color:rgba(212,175,55,0.5);font-size:0.58rem;letter-spacing:3px;text-transform:uppercase;margin:0 0 6px;">Découverte</p>
                                <p style="color:#f0c75e;font-size:1.6rem;font-weight:700;margin:0 0 8px;line-height:1;white-space:nowrap;">5€ <span style="font-size:0.65rem;color:rgba(212,175,55,0.45);font-weight:400;">/mois</span></p>
                                <div style="height:1px;background:rgba(212,175,55,0.1);margin:0 0 8px;"></div>
                                <ul style="list-style:none;padding:0;margin:0 0 10px;text-align:left;color:rgba(233,231,223,0.65);font-size:0.75rem;line-height:1.9;">
                                    <li>✦ 1 tirage par jour</li>
                                    <li>✦ Historique 30 jours</li>
                                </ul>
                                <button id="tlm-btn-decouverte" class="tlm-secondary"
                                        style="width:100%;padding:8px;border-radius:50px;border:1px solid rgba(212,175,55,0.4);
                                               background:rgba(212,175,55,0.05);color:#d4af37;font-size:0.72rem;font-weight:700;
                                               cursor:pointer;letter-spacing:1px;text-transform:uppercase;">
                                    Choisir
                                </button>
                            </div>

                            <!-- Complète -->
                            <div style="flex:1;background:rgba(212,175,55,0.06);border:1.5px solid rgba(212,175,55,0.5);border-radius:12px;padding:14px 10px 12px;text-align:center;box-shadow:0 0 22px rgba(212,175,55,0.1);">
                                <p style="color:rgba(212,175,55,0.5);font-size:0.52rem;letter-spacing:3px;text-transform:uppercase;margin:0 0 1px;">Recommandé</p>
                                <p style="color:rgba(212,175,55,0.65);font-size:0.58rem;letter-spacing:3px;text-transform:uppercase;margin:0 0 6px;">Complète</p>
                                <p style="color:#f0c75e;font-size:1.6rem;font-weight:700;margin:0 0 8px;line-height:1;white-space:nowrap;">8€ <span style="font-size:0.65rem;color:rgba(212,175,55,0.45);font-weight:400;">/mois</span></p>
                                <div style="height:1px;background:rgba(212,175,55,0.18);margin:0 0 8px;"></div>
                                <ul style="list-style:none;padding:0;margin:0 0 10px;text-align:left;color:rgba(233,231,223,0.75);font-size:0.75rem;line-height:1.9;">
                                    <li>✦ Tirages illimités</li>
                                    <li>✦ Historique complet</li>
                                    <li>✦ Espace membres</li>
                                </ul>
                                <button id="tlm-btn-complet" class="tlm-cta"
                                        style="width:100%;padding:9px;border-radius:50px;
                                               background:linear-gradient(135deg,#d4af37,#f0c75e);
                                               color:#050f23;font-size:0.72rem;font-weight:700;
                                               border:none;cursor:pointer;letter-spacing:1px;text-transform:uppercase;
                                               box-shadow:0 4px 18px rgba(212,175,55,0.38);">
                                    Choisir
                                </button>
                            </div>
                        </div>

                        <!-- Colonne droite : pub précommande -->
                        <a href="/precommande-oracle.html" class="tlm-preorder">
                            <img src="/images/medias/banniere-facebook.png" alt="Oracle Oradia"
                                 style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;display:block;">
                            <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(4,10,24,0.92) 0%,rgba(4,10,24,0.45) 55%,rgba(4,10,24,0.1) 100%);"></div>
                            <div style="position:absolute;bottom:0;left:0;right:0;padding:10px 8px;text-align:center;">
                                <p style="margin:0 0 2px;color:rgba(212,175,55,0.65);font-size:0.5rem;letter-spacing:2px;text-transform:uppercase;">Édition limitée</p>
                                <p style="margin:0 0 6px;color:#f5e7a1;font-size:0.72rem;font-weight:700;line-height:1.2;">L'Oracle<br>Oradia</p>
                                <span style="display:inline-block;background:linear-gradient(135deg,#d4af37,#f0c75e);color:#050f23;font-size:0.55rem;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;padding:4px 8px;border-radius:50px;">
                                    dès 38€
                                </span>
                            </div>
                        </a>
                    </div>

                    <button data-close-limit-modal class="tlm-close"
                            style="display:block;width:100%;padding:6px;background:none;border:none;
                                   color:rgba(233,231,223,0.28);font-size:0.78rem;cursor:pointer;
                                   font-style:italic;text-align:center;letter-spacing:0.05em;">
                        Peut-être plus tard
                    </button>
                </div></div>
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
