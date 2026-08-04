// js/qrng-client.js
// Client QRNG — pré-charge un lot de nombres quantiques depuis /api/qrng
// Fournit un remplaçant drop-in pour Math.random() côté tirage.
//
// RIGUEUR SCIENTIFIQUE :
//   Chaque octet est étiqueté avec sa source réelle ('anu', 'outshift' ou 'fallback').
//   Un tirage n'est considéré "quantique pur" QUE si TOUS ses octets
//   proviennent d'une source quantique vérifiée (ANU ou Outshift/Cisco).
//   Dès qu'un seul octet vient du fallback cryptographique, le tirage entier
//   est marqué 'fallback' et doit être exclu des statistiques de synchronicité.

const QUANTUM_SOURCES = ['anu', 'outshift'];

const QRNG = {
  cache: [],            // tableau d'objets { value, source }
  cacheSize: 50,
  loading: false,
  lastSource: null,     // source du dernier prefetch (info)
  lastDrawSource: null, // 'anu' | 'outshift' | 'fallback' — pureté/source du DERNIER tirage complet
  lastByte: null,       // dernier octet consommé — sert de valeur "présent" à l'étude
  _drawHadFallback: false,
  _drawQuantumSource: null, // source quantique pure rencontrée dans le tirage en cours ('anu' | 'outshift')
  _prefetchPromise: null,

  // Pré-charge un lot depuis notre proxy serverless
  prefetch() {
    if (this.loading) return this._prefetchPromise;
    this.loading = true;
    this._prefetchPromise = fetch(`/api/qrng?count=${this.cacheSize}`)
      .then(r => r.json())
      .then(data => {
        if (data.success && Array.isArray(data.numbers)) {
          // Déterminer la source réelle de ce lot (valeur fiable renvoyée par l'API,
          // pas de parsing du libellé humain `data.source`)
          const src = QUANTUM_SOURCES.includes(data.outcome) ? data.outcome : 'fallback';
          this.lastSource = data.source;
          for (const value of data.numbers) {
            this.cache.push({ value, source: src });
          }
          if (data.warning) console.warn('[QRNG]', data.warning);
        }
      })
      .catch(e => {
        console.warn('[QRNG] prefetch failed, will use crypto fallback:', e.message);
      })
      .finally(() => {
        this.loading = false;
        this._prefetchPromise = null;
      });
    return this._prefetchPromise;
  },

  // Récupère un octet quantique étiqueté, pré-charge si cache bas
  async _getByte() {
    if (this.cache.length < 5) {
      await this.prefetch();
    }
    if (this.cache.length > 0) {
      const byte = this.cache.shift();
      if (QUANTUM_SOURCES.includes(byte.source)) {
        this._drawQuantumSource = byte.source;
      } else {
        this._drawHadFallback = true;
      }
      this.lastByte = byte.value; // "présent" pour l'étude rétrocausalité (octet live du tirage)
      return byte.value;
    }
    // Dernier recours : crypto local (NON quantique) → contamine le tirage
    this._drawHadFallback = true;
    return crypto.getRandomValues(new Uint8Array(1))[0];
  },

  // Retourne un entier entre min (inclus) et max (exclus)
  async getInt(min, max) {
    const range = max - min;
    if (range <= 0) return min;
    if (range === 1) return min;

    // Rejection sampling pour éliminer le biais de modulo
    const threshold = 256 - (256 % range);
    let raw;
    let attempts = 0;
    do {
      raw = await this._getByte();
      attempts++;
    } while (raw >= threshold && attempts < 8);

    return min + (raw % range);
  },

  // ── Suivi de pureté pour un tirage multi-cartes orchestré manuellement ──
  // tore.html appelle getInt() carte par carte (pas drawUnique). On encadre
  // donc le tirage complet par beginDraw()/endDraw() pour savoir s'il est pur.
  beginDraw() {
    this._drawHadFallback = false;
    this._drawQuantumSource = null;
    // Économie de quota des sources quantiques : on ne précharge QU'AU lancement d'un
    // vrai tirage (et non à chaque chargement de page). L'appel démarre pendant
    // l'animation du lancer, donc les octets sont prêts quand les cartes en ont besoin.
    if (this.cache.length < 10) this.prefetch();
  },
  // À appeler depuis un catch qui retombe sur Math.random() : contamine le tirage.
  markFallback() {
    this._drawHadFallback = true;
  },
  // Clôt le tirage et retourne 'anu' | 'outshift' (100% quantique) ou 'fallback'.
  endDraw() {
    this.lastDrawSource = this._drawHadFallback ? 'fallback' : (this._drawQuantumSource || 'fallback');
    return this.lastDrawSource;
  },

  // Tire count indices uniques dans un deck de deckSize éléments (Fisher-Yates quantique)
  // Réinitialise le suivi de pureté : à la fin, lastDrawSource vaut 'anu' ou 'fallback'.
  async drawUnique(deckSize, count) {
    this._drawHadFallback = false; // début d'un nouveau tirage
    this._drawQuantumSource = null;

    const indices = Array.from({ length: deckSize }, (_, i) => i);
    const drawn = [];
    const n = Math.min(count, deckSize);

    for (let i = 0; i < n; i++) {
      const remaining = deckSize - i;
      const pick = await this.getInt(0, remaining);
      drawn.push(indices[pick]);
      indices[pick] = indices[remaining - 1];
    }

    this.lastDrawSource = this._drawHadFallback ? 'fallback' : (this._drawQuantumSource || 'fallback');
    return drawn;
  },
};

// NB : plus de préchargement automatique au chargement de page (il consommait le
// quota ANU pour chaque visiteur, même sans tirage). Le préchargement est déclenché
// par QRNG.beginDraw(), c.-à-d. uniquement quand l'utilisateur lance réellement un tirage.

// Export pour usage en module ES si besoin
if (typeof module !== 'undefined') module.exports = QRNG;
