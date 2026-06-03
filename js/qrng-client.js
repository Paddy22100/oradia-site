// js/qrng-client.js
// Client QRNG — pré-charge un lot de nombres quantiques depuis /api/qrng
// Fournit un remplaçant drop-in pour Math.random() côté tirage

const QRNG = {
  cache: [],
  cacheSize: 50,
  loading: false,
  lastSource: null,
  _prefetchPromise: null,

  // Pré-charge un lot depuis notre proxy serverless
  prefetch() {
    if (this.loading) return this._prefetchPromise;
    this.loading = true;
    this._prefetchPromise = fetch(`/api/qrng?count=${this.cacheSize}`)
      .then(r => r.json())
      .then(data => {
        if (data.success && Array.isArray(data.numbers)) {
          this.cache = this.cache.concat(data.numbers);
          this.lastSource = data.source;
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

  // Récupère un octet quantique (0-255), pré-charge si cache bas
  async _getByte() {
    if (this.cache.length < 5) {
      await this.prefetch();
    }
    if (this.cache.length > 0) {
      return this.cache.shift();
    }
    // Dernier recours : crypto
    return crypto.getRandomValues(new Uint8Array(1))[0];
  },

  // Retourne un entier entre min (inclus) et max (exclus)
  // Équivalent à Math.floor(Math.random() * (max - min)) + min
  async getInt(min, max) {
    const range = max - min;
    if (range <= 0) return min;
    if (range === 1) return min;

    // Rejection sampling pour éliminer le biais de modulo
    // Pour un deck ≤ 50 cartes, un seul octet suffit presque toujours
    const threshold = 256 - (256 % range);
    let raw;
    let attempts = 0;
    do {
      raw = await this._getByte();
      attempts++;
    } while (raw >= threshold && attempts < 8);

    return min + (raw % range);
  },

  // Tire count indices uniques dans un deck de deckSize éléments (Fisher-Yates quantique)
  async drawUnique(deckSize, count) {
    const indices = Array.from({ length: deckSize }, (_, i) => i);
    const drawn = [];
    const n = Math.min(count, deckSize);

    for (let i = 0; i < n; i++) {
      const remaining = deckSize - i;
      const pick = await this.getInt(0, remaining);
      drawn.push(indices[pick]);
      // Swap avec le dernier pour retirer l'élement sans splice coûteux
      indices[pick] = indices[remaining - 1];
    }

    return drawn;
  },
};

// Pré-chargement anticipé dès le chargement de la page
document.addEventListener('DOMContentLoaded', () => QRNG.prefetch());

// Export pour usage en module ES si besoin
if (typeof module !== 'undefined') module.exports = QRNG;
