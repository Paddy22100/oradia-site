// Insertion idempotente des étapes du parcours newsletters dans newsletter_drafts.
//
// Insère chaque entrée de parcours_oradia_20.json comme un brouillon normal
// (statut='brouillon'), SANS extra.parcours_valide — elles restent donc visibles
// et éditables dans l'onglet "Newsletter & Réseaux" du dashboard, avec le badge
// "Parcours n°X — à valider", en attendant relecture + ajout d'illustrations.
// C'est le bouton "Valider pour le Parcours" du dashboard (action=validate-parcours)
// qui les fait ensuite apparaître dans l'onglet Parcours — jamais ce script.
//
// Idempotent : relancer ce script ne duplique jamais une étape déjà insérée
// (vérifie par extra.ordre parmi les entrées extra.canal='parcours' existantes).
//
// Usage (depuis la racine du dépôt — SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY
// vivent dans .env.local, pas .env qui ne contient que la clé anon) :
//   node --env-file=.env.local scripts/insert-parcours-newsletters.js            (les 20)
//   node --env-file=.env.local scripts/insert-parcours-newsletters.js --only=1   (une seule, pour test)

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis (charger .env, ex: node --env-file=.env scripts/insert-parcours-newsletters.js).');
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  const onlyArg = process.argv.find(a => a.startsWith('--only='));
  const onlyOrdre = onlyArg ? parseInt(onlyArg.split('=')[1], 10) : null;

  const jsonPath = path.join(__dirname, '..', 'parcours_oradia_20.json');
  const entries = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  const toProcess = onlyOrdre ? entries.filter(e => e.ordre === onlyOrdre) : entries;
  if (toProcess.length === 0) {
    console.error(`Aucune entrée avec ordre=${onlyOrdre} trouvée dans ${jsonPath}.`);
    process.exit(1);
  }

  // Un seul fetch de l'existant du parcours pour vérifier l'idempotence par ordre.
  const { data: existingRows, error: fetchErr } = await supabase
    .from('newsletter_drafts')
    .select('id, subject, extra')
    .eq('extra->>canal', 'parcours');
  if (fetchErr) {
    console.error('Erreur lecture des étapes parcours existantes :', fetchErr.message);
    process.exit(1);
  }
  const existingOrdres = new Set((existingRows || []).map(r => Number(r.extra?.ordre)));

  const results = { inserted: [], skipped: [], errors: [] };

  for (const entry of toProcess) {
    if (existingOrdres.has(entry.ordre)) {
      results.skipped.push({ ordre: entry.ordre, subject: entry.subject });
      continue;
    }

    const payload = {
      subject: entry.subject,
      content: entry.content,
      intention: null,
      type: 'newsletter',
      statut: 'brouillon',
      images: [],
      extra: {
        ordre: entry.ordre,
        registre: entry.extra?.registre ?? null,
        canal: 'parcours',
        cta_text: entry.extra?.cta_text ?? null,
        cta_url: entry.extra?.cta_url ?? null
        // parcours_valide volontairement absent : à valider manuellement dans le dashboard.
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('newsletter_drafts')
      .insert(payload)
      .select('id')
      .single();

    if (error) {
      results.errors.push({ ordre: entry.ordre, subject: entry.subject, error: error.message });
      continue;
    }
    results.inserted.push({ ordre: entry.ordre, subject: entry.subject, id: data.id });
  }

  console.log('\n── Résultat ──');
  console.log(`Insérées : ${results.inserted.length}`);
  results.inserted.forEach(r => console.log(`  + n°${r.ordre} — ${r.subject} (id=${r.id})`));
  console.log(`Ignorées (déjà présentes) : ${results.skipped.length}`);
  results.skipped.forEach(r => console.log(`  = n°${r.ordre} — ${r.subject}`));
  console.log(`Erreurs : ${results.errors.length}`);
  results.errors.forEach(r => console.log(`  ! n°${r.ordre} — ${r.subject} : ${r.error}`));

  if (results.errors.length > 0) process.exit(1);
}

main().catch(e => {
  console.error('Erreur inattendue :', e.message);
  process.exit(1);
});
