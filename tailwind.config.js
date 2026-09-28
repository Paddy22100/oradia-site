// Tailwind compilé (remplace le CDN cdn.tailwindcss.com, qui compilait dans le navigateur).
// Build : npm run build:css → assets/tailwind*.css (fichiers commités : Vercel n'a pas
// d'étape de build sur ce projet). À relancer après tout ajout de classe Tailwind.
//
// Quatre feuilles, pour reproduire à l'identique les anciennes configurations inline :
// - tailwind.css           : pages du site (couleurs Oradia communes) ;
// - tailwind-guidance.css  : guidance.html (night-blue #040d1c, light-gold #f0c75e) ;
// - tailwind-livraison.css : livraison.html (palette propre) ;
// - tailwind-default.css   : pages sans configuration (fiches cartes…), thème par défaut.
const content = [
  './*.html', './en/**/*.html', './cartes/**/*.html', './member/**/*.html', './user/**/*.html',
  './admin/**/*.html', './blog/**/*.html', './components/**/*.{html,js}', './js/**/*.js',
  './scripts/**/*.js'
];

const animation = {
  'float': 'float 6s ease-in-out infinite',
  'pulse-slow': 'pulse 4s ease-in-out infinite',
  'shimmer': 'shimmer 3s ease-in-out infinite'
};

const variants = {
  main: {
    colors: { 'night-blue': '#0a192f', 'gold': '#d4af37', 'light-gold': '#f5e7a1', 'dark-blue': '#051428', 'celtic-blue': '#1a365d' },
    fontFamily: {
      'cormorant': ['Cormorant Garamond', 'serif'], 'poppins': ['Poppins', 'sans-serif'],
      'cinzel': ['Cinzel', 'serif'], 'lora': ['Lora', 'serif']
    },
    animation
  },
  guidance: {
    colors: { 'night-blue': '#040d1c', 'gold': '#d4af37', 'light-gold': '#f0c75e' },
    fontFamily: { cormorant: ['"Cormorant Garamond"', 'Georgia', 'serif'] }
  },
  livraison: {
    colors: { 'night-blue': '#051428', 'dark-blue': '#1A365D', 'gold': '#D4AF37', 'light-gold': '#F4E4C1' },
    fontFamily: { 'cormorant': ['Cormorant Garamond', 'serif'], 'cinzel': ['Cinzel', 'serif'], 'lora': ['Lora', 'serif'] },
    animation
  },
  default: {}
};

const variant = process.env.TW_VARIANT || 'main';
const contentFor = {
  guidance: ['./guidance.html', './en/guidance.html', './components/**/*.{html,js}', './js/**/*.js'],
  livraison: ['./livraison.html', './en/livraison.html', './components/**/*.{html,js}', './js/**/*.js']
};

module.exports = {
  content: contentFor[variant] || content,
  theme: { extend: variants[variant] }
};
