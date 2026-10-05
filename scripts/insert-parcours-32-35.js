// Insère les étapes 32 à 35 du parcours newsletters, inspirées (sans jamais
// reprendre son texte) de la série documentaire "À la recherche du Code Source"
// (Kevin Finel) : cadre/cerveau prédictif, universalité du dialogue avec ce
// qu'on porte, part protectrice plutôt qu'ennemie, et un teaser (volontairement
// flou) de l'expérience "Le Dialogue Intérieur" encore en test admin-only.
//
// Même convention que les étapes existantes : jamais de "je", pas de tiret
// long, "L'oracle de La Boussole Intérieure" (jamais "La Boussole" seule).
// Insérées SANS extra.parcours_valide : à relire et valider depuis l'onglet
// Newsletter & Réseaux du dashboard, comme toutes les étapes 14-31.
// Idempotent : relancer ce script ne duplique jamais une étape déjà insérée.
//
// Usage (depuis la racine du dépôt) :
//   node --env-file=.env.local scripts/insert-parcours-32-35.js

const { createClient } = require('@supabase/supabase-js');

const ENTRIES = [
  {
    ordre: 32,
    registre: 'lucide',
    subject: `Rudy d'ORADIA - Le cadre qui invente l'expérience`,
    content: `<p>Dans un centre de soin traditionnel du Pérou, un rituel se prépare avant même que la plante ne soit administrée. Le lieu, les chants, les gestes du soignant, l'attente qui s'installe : tout cela compose un cadre, et ce cadre, à lui seul, commence déjà à façonner ce qui va être vécu.</p>
<p>Les neurosciences contemporaines appellent cela le cerveau prédictif. Loin d'enregistrer passivement le monde, le cerveau anticipe sans relâche, construit un modèle, puis interprète ce qui arrive à travers ce modèle. Un même événement, vécu dans deux cadres différents, ne produit pas la même expérience. Ce n'est pas une illusion : c'est ainsi que la perception fonctionne, depuis toujours, dans toutes les cultures.</p>
<p>Les traditions anciennes savaient cela sans le nommer ainsi. Un rituel n'invente pas un miracle, il prépare un terrain. Il annonce au corps et à l'esprit que quelque chose d'important s'apprête à se produire, et cette annonce, seule, modifie déjà ce qui va suivre.</p>
<p>Ce que l'on appelle parfois concentration ou intention n'est rien d'autre que ce cadre, posé consciemment. Avant d'agir, avant de décider, le cadre dans lequel la question est posée détermine une grande partie de la réponse qui pourra émerger.</p>
<p>L'oracle de La Boussole Intérieure ne fonctionne pas autrement. Le silence qu'il demande, la question qu'il invite à formuler avant de tirer une carte, ne sont pas un décor. Ils sont le cadre qui permet à ce qui est déjà là, en vous, de se rendre enfin lisible.</p>`
  },
  {
    ordre: 33,
    registre: 'inspiree',
    subject: `Rudy d'ORADIA - Les esprits n'ont jamais disparu, ils ont changé de nom`,
    content: `<p>Dans la quasi-totalité des cultures humaines, une pratique revient avec une étonnante constance : donner un nom et une présence à ce qui pèse, pour pouvoir s'adresser à cela directement. Esprit, ancêtre, djinn, possession : les formes varient, l'intuition reste la même.</p>
<p>Certains ethnopsychiatres, en travaillant avec des patients venus d'ailleurs, ont fait un choix rare : accueillir leurs esprits plutôt que de les traduire aussitôt dans un vocabulaire occidental qui les aurait disqualifiés. Ce n'est pas dans la croyance exacte que la guérison se loge, mais dans le cadre où cette croyance peut enfin être prise au sérieux.</p>
<p>L'Occident, en se détachant des esprits extérieurs, n'a pas renoncé à cette intuition. Il l'a seulement déplacée vers l'intérieur. Freud et Jung ont parlé d'inconscient, une instance qui a ses propres intentions, parfois opposées à celles de la conscience claire. Plus récemment, certaines approches thérapeutiques ont repris ce principe sous le nom de parts, ou de sous-personnalités.</p>
<p>Ce glissement de vocabulaire ne change rien à l'essentiel : ce qui résiste en soi n'est presque jamais une chose compacte et unique. Ce sont des voix, des mouvements, parfois contradictoires, qui ont chacun leur histoire et leur raison d'être là.</p>
<p>L'oracle de La Boussole Intérieure s'adresse à ces voix sans prétendre les unifier de force. Chaque carte tirée donne une forme provisoire à l'une d'entre elles, le temps d'un dialogue qui n'a rien d'une croyance à adopter : un outil, hérité de partout, pour que ce qui agit en silence puisse enfin être entendu.</p>`
  },
  {
    ordre: 34,
    registre: 'incarnee',
    subject: `Rudy d'ORADIA - Ce qui vous pèse n'est pas votre ennemi`,
    content: `<p>Il y a une tension, une peur, une résistance qui revient, et le premier réflexe est presque toujours le même : la combattre, la faire taire, la traiter comme un défaut à corriger. Pourtant, ce qui pèse n'est presque jamais un ennemi.</p>
<p>Dans les pratiques qui donnent une forme à ce que l'on porte intérieurement, un même constat revient, encore et encore. Interrogée directement, la part qui tenait bon révèle rarement une intention malveillante. Le plus souvent, elle répond qu'elle protège quelque chose, qu'elle a appris, un jour, que vigilance ou retrait étaient nécessaires, et qu'elle n'a simplement jamais reçu le message que ce jour-là est passé.</p>
<p>C'est un gardien qui a fait du zèle, pas un saboteur. Il monte la garde devant une porte qui n'a peut-être plus besoin d'être gardée, avec la même fidélité que le premier jour. Lui demander de disparaître ne fonctionne presque jamais : un gardien qu'on attaque redouble de vigilance, il ne se retire pas.</p>
<p>Ce qui change la relation, c'est de reconnaître ce service rendu, même ancien, même devenu encombrant. Remercier avant de négocier. Signifier que le message a été reçu, et que la garde peut, enfin, se relâcher un peu.</p>
<p>L'oracle de La Boussole Intérieure n'aide pas à faire taire ces voix intérieures. Il aide à leur parler autrement, à y reconnaître une intention protectrice avant d'y voir un obstacle, ce qui, bien souvent, suffit à commencer à désarmer la tension qu'elles portent.</p>`
  },
  {
    ordre: 35,
    registre: 'lucide',
    subject: `Rudy d'ORADIA - Donner une forme à ce qu'on porte`,
    content: `<p>Ce qui n'a pas de forme est presque impossible à affronter. Une inquiétude diffuse, un poids qui n'a pas de nom, une tension qui circule sans qu'on sache où elle commence : tant que cela reste flou, aucun dialogue n'est possible, parce qu'il n'y a personne en face à qui s'adresser.</p>
<p>C'est peut-être la fonction la plus ancienne et la plus universelle du rituel : donner un contour à ce qui n'en a pas. Une couleur, une texture, une présence que l'on peut situer devant soi plutôt que de la laisser diffuse à l'intérieur. Ce geste, aussi simple qu'il paraisse, change déjà la nature de l'expérience.</p>
<p>Car une fois qu'une chose a une forme, elle peut être regardée. Et ce qui peut être regardé peut être écouté, questionné, parfois même remercié. Ce que l'on continue de combattre dans le flou, on peut commencer à l'accueillir dès qu'il prend un visage.</p>
<p>C'est tout l'enjeu d'un passage que l'oracle de La Boussole Intérieure explore de plus en plus : non plus seulement éclairer une situation de l'extérieur, mais offrir un support concret, une carte, une image, à la part intérieure qui demande à être entendue.</p>
<p>Cette piste continue de se préciser. Elle sera annoncée ici, en temps voulu, quand elle sera prête à être partagée plus largement.</p>`
  }
];

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis (node --env-file=.env.local scripts/insert-parcours-32-35.js).');
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, serviceKey);

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

  for (const entry of ENTRIES) {
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
        registre: entry.registre,
        canal: 'parcours',
        cta_text: "Découvrir l'Oracle Oradia",
        cta_url: 'https://oradia.fr'
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
