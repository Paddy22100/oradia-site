// Corrige le positionnement des étapes 10 et 23 du parcours newsletters : elles présentaient
// les travaux de Guillemant, Garnier Malet et Leterrier avec des pincettes ("hypothèses non
// prouvées", "controversé"...). Consigne explicite : le parcours doit assumer de croire à ces
// théories, pas les traiter avec scepticisme. Les étapes 1 à 9 ne sont volontairement pas
// touchées par ce script.
//
// Idempotent : met simplement à jour subject/content des lignes newsletter_drafts identifiées
// par extra->>canal='parcours' et extra->>ordre='10' / '23' — aucune autre colonne modifiée
// (images, extra, statut restent intacts).
//
// Usage (depuis la racine du dépôt) :
//   node --env-file=.env.local scripts/update-parcours-tone-10-23.js

const { createClient } = require('@supabase/supabase-js');

const UPDATES = [
  {
    ordre: 10,
    subject: "Rudy d'ORADIA - Guillemant, Garnier Malet et la physique de l'invisible",
    content: `<p>Vous croiserez, dans cet univers, des auteurs qui explorent une physique de l'invisible. Le double quantique, la rétrocausalité, la conscience qui choisit sa ligne de temps. Jean-Pierre Garnier Malet, ingénieur et chercheur, publie sur le dédoublement quantique depuis plus de vingt ans. Philippe Guillemant, docteur en physique et ancien chercheur au CNRS, développe une physique de la conscience et du temps qui rejoint des intuitions vieilles comme l'humanité.</p>
<p>Je prends le parti de les lire au sérieux, et de croire ce qu'ils avancent : que notre double quantique existe hors du temps linéaire, qu'il explore en permanence plusieurs futurs possibles, et qu'il nous envoie, sous forme d'intuitions, de synchronicités, de pressentiments, des informations sur celui qui nous convient le mieux.</p>
<p>Ce n'est pas une croyance naïve. C'est un choix : celui de prendre au sérieux ce que la physique établie elle-même commence à rendre pensable — le temps qui ralentit avec la vitesse, le passé et le futur qui coexistent au sens géométrique, l'observateur qui influence ce qu'il observe. Garnier Malet et Guillemant vont plus loin, et proposent un mécanisme : le dédoublement. À chaque instant, votre conscience se divise, explore plusieurs futurs en parallèle, et ne réintègre qu'une version — celle vers laquelle votre intention, consciente ou non, vous a orienté.</p>
<p>Cela change tout. Si une part de vous explore déjà les futurs possibles, alors les intuitions ne sont pas des accidents du hasard : ce sont des messages. Les synchronicités ne sont pas des coïncidences qu'on choisit de remarquer : ce sont des signaux d'un futur déjà entrevu qui cherche à se rappeler à vous.</p>
<p>La Boussole Intérieure s'appuie précisément sur cela. Elle vous aide à faire le silence nécessaire pour que ce double, cette part de vous qui voit plus loin, puisse enfin se faire entendre. Le corps qui se pose, le présent qui s'ouvre : ce n'est pas seulement pour votre bien-être immédiat. C'est la condition pour que l'information circule.</p>
<p><em>La Boussole Intérieure. Comprendre, choisir, avancer. Précommandes ouvertes sur oradia.fr.</em></p>`
  },
  {
    ordre: 23,
    subject: "Rudy d'ORADIA - Romuald Leterrier et la rétrocausalité de l'intention",
    content: `<p>Dans le sillage de ces réflexions, vous rencontrerez le travail de Romuald Leterrier, qui explore les synchronicités, les rêves, et ce qu'il nomme la rétrocausalité de l'intention. Un domaine passionnant, qui rejoint directement ce que Garnier Malet et Guillemant décrivent par ailleurs : un futur qui n'est pas simplement subi, mais qui participe, en retour, à façonner le présent.</p>
<p>Ce que ces explorations révèlent est précieux : l'expérience humaine du signe, de la coïncidence signifiante, du sentiment qu'un événement répond à une question intérieure, n'est pas une illusion à corriger. C'est une capacité de perception, ancienne, universelle, que nous avons simplement désapprise à écouter.</p>
<p>Je crois qu'un futur peut influencer le présent — non comme une fatalité écrite d'avance, mais comme une invitation. Poser une intention claire, c'est envoyer un signal vers cette part de vous qui, dans les modèles de Garnier Malet et Leterrier, explore déjà les chemins possibles. Ce qui vous revient ensuite, sous forme d'intuition ou de synchronicité, n'est pas le fruit du hasard : c'est une réponse.</p>
<p>La Boussole se tient exactement là. Elle prend au sérieux votre expérience du sens, et elle prend au sérieux ce qui la rend possible : un lien réel entre ce que vous portez maintenant et ce qui vous attend.</p>
<p><em>La Boussole Intérieure. Comprendre, choisir, avancer. Précommandes ouvertes sur oradia.fr.</em></p>`
  }
];

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis (ex: node --env-file=.env.local scripts/update-parcours-tone-10-23.js).');
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  const results = { updated: [], errors: [] };

  for (const u of UPDATES) {
    const { data: rows, error: fetchErr } = await supabase
      .from('newsletter_drafts')
      .select('id, subject, extra')
      .eq('extra->>canal', 'parcours')
      .eq('extra->>ordre', String(u.ordre));

    if (fetchErr) {
      results.errors.push({ ordre: u.ordre, error: fetchErr.message });
      continue;
    }
    if (!rows || rows.length === 0) {
      results.errors.push({ ordre: u.ordre, error: 'aucune ligne trouvée pour cet ordre' });
      continue;
    }
    if (rows.length > 1) {
      results.errors.push({ ordre: u.ordre, error: `${rows.length} lignes trouvées pour cet ordre — vérifier manuellement avant d'écraser` });
      continue;
    }

    const row = rows[0];
    const { error: updateErr } = await supabase
      .from('newsletter_drafts')
      .update({ subject: u.subject, content: u.content, updated_at: new Date().toISOString() })
      .eq('id', row.id);

    if (updateErr) {
      results.errors.push({ ordre: u.ordre, error: updateErr.message });
      continue;
    }
    results.updated.push({ ordre: u.ordre, id: row.id, ancien_sujet: row.subject, nouveau_sujet: u.subject });
  }

  console.log('\n── Résultat ──');
  console.log(`Mises à jour : ${results.updated.length}`);
  results.updated.forEach(r => console.log(`  ~ n°${r.ordre} (id=${r.id})\n    avant : ${r.ancien_sujet}\n    après : ${r.nouveau_sujet}`));
  console.log(`Erreurs : ${results.errors.length}`);
  results.errors.forEach(r => console.log(`  ! n°${r.ordre} : ${r.error}`));

  if (results.errors.length > 0) process.exit(1);
}

main().catch(e => {
  console.error('Erreur inattendue :', e.message);
  process.exit(1);
});
