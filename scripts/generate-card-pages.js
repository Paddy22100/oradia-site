// scripts/generate-card-pages.js
// Génère les pages SEO individuelles pour les 118 cartes du deck (data/tore-deck.json).
// Usage : node scripts/generate-card-pages.js
//
// Le visuel de chaque carte n'est PAS inclus dans le HTML servi (donc invisible à un
// crawler ou à un simple clic-droit) : il n'est révélé côté client, via
// js/card-image-gate.js, qu'aux visiteurs dont l'abonnement actif est confirmé par
// /api/auth/check-subscription. Le texte (sens, SEO) reste public et indexable.

const fs = require('fs');
const path = require('path');
const deck = require('../data/tore-deck.json');
const { resolveCardImageUrl } = require('../lib/tore-card-images.js');
const { slugify, titleCase } = require('../lib/tore-card-slug.js');

const FAMILY_LABELS = {
  emotions: 'Émotions', besoins: 'Besoins', transmutation: 'Transmutation',
  archetypes: 'Archétypes', revelations: 'Révélations', actions: 'Actions',
  memoire_cosmos: 'Mémoire Cosmos'
};

const MIRROR_PAIRS = {
  // Émotions
  'JOIE': 'TRISTESSE', 'TRISTESSE': 'JOIE',
  'AMOUR': 'SOLITUDE', 'SOLITUDE': 'AMOUR',
  'ÉMERVEILLEMENT': 'DÉGOÛT', 'DÉGOÛT': 'ÉMERVEILLEMENT',
  'SÉRÉNITÉ': 'CONFUSION', 'CONFUSION': 'SÉRÉNITÉ',
  'COLÈRE': 'IMPUISSANCE', 'IMPUISSANCE': 'COLÈRE',
  'COURAGE': 'PEUR', 'PEUR': 'COURAGE',
  'CONFIANCE': 'HONTE', 'HONTE': 'CONFIANCE',
  'FIERTÉ': 'CULPABILITÉ', 'CULPABILITÉ': 'FIERTÉ',
  'IMPATIENCE': 'PATIENCE', 'PATIENCE': 'IMPATIENCE',
  // Besoins
  'RECONNAISSANCE': 'SÉCURITÉ', 'SÉCURITÉ': 'RECONNAISSANCE',
  'LIBERTÉ': 'SOUTIEN', 'SOUTIEN': 'LIBERTÉ',
  'REPOS': 'CLARTÉ', 'CLARTÉ': 'REPOS',
  'APPARTENANCE': 'AUTONOMIE', 'AUTONOMIE': 'APPARTENANCE',
  'STIMULATION': 'HARMONIE', 'HARMONIE': 'STIMULATION',
  'AMOUR REÇU': 'LE SENS', 'LE SENS': 'AMOUR REÇU',
  'PROTECTION': 'EXPANSION', 'EXPANSION': 'PROTECTION',
  'INTIMITÉ': 'CRÉATIVITÉ', 'CRÉATIVITÉ': 'INTIMITÉ',
  'AUTHENTICITÉ': 'GUIDANCE', 'GUIDANCE': 'AUTHENTICITÉ',
  // Transmutation
  'ACCEPTATION': 'TRANSFORMATION', 'TRANSFORMATION': 'ACCEPTATION',
  'LÂCHER-PRISE': 'LIBÉRATION', 'LIBÉRATION': 'LÂCHER-PRISE',
  'PARDON': 'ALIGNEMENT', 'ALIGNEMENT': 'PARDON',
  'DÉTACHEMENT': 'PURIFICATION', 'PURIFICATION': 'DÉTACHEMENT',
  'ANCRAGE': 'OUVERTURE', 'OUVERTURE': 'ANCRAGE',
  'FLUIDITÉ': 'CLARIFICATION', 'CLARIFICATION': 'FLUIDITÉ',
  'PRISON MENTALE': 'ESPRIT LIBRE', 'ESPRIT LIBRE': 'PRISON MENTALE',
  'VIDE': 'PLÉNITUDE', 'PLÉNITUDE': 'VIDE',
  'INCARNATION': 'TRANSCENDANCE', 'TRANSCENDANCE': 'INCARNATION',
  // Archétypes
  'LE SAGE': 'LE GUERRIER', 'LE GUERRIER': 'LE SAGE',
  'LA PRÊTRESSE': 'LE BÂTISSEUR', 'LE BÂTISSEUR': 'LA PRÊTRESSE',
  'LE RÊVEUR': 'LE VISIONNAIRE', 'LE VISIONNAIRE': 'LE RÊVEUR',
  "L'ENFANT": 'LE VOYAGEUR', 'LE VOYAGEUR': "L'ENFANT",
  'LE MAGE': 'LE PASSEUR', 'LE PASSEUR': 'LE MAGE',
  'LE VEILLEUR': 'LE PORTEUR', 'LE PORTEUR': 'LE VEILLEUR',
  'LE NOMADE': 'LA TISSEUSE', 'LA TISSEUSE': 'LE NOMADE',
  "L'ALCHIMISTE": 'LE JUSTE', 'LE JUSTE': "L'ALCHIMISTE",
  "L'OBSERVATEUR": "L'INITIATEUR", "L'INITIATEUR": "L'OBSERVATEUR",
  // Révélations
  'CLÉ': 'PORTE', 'PORTE': 'CLÉ',
  'MESSAGE': 'SYNCHRONICITÉ', 'SYNCHRONICITÉ': 'MESSAGE',
  'SIGNE': 'VISION', 'VISION': 'SIGNE',
  'PRÉSAGE': 'ÉVEIL', 'ÉVEIL': 'PRÉSAGE',
  'LUMIÈRE': 'DÉVOILEMENT', 'DÉVOILEMENT': 'LUMIÈRE',
  'VÉRITÉ': 'ILLUSION', 'ILLUSION': 'VÉRITÉ',
  'ÉTINCELLE': 'SILENCE', 'SILENCE': 'ÉTINCELLE',
  'CHIFFRE': 'SYMBOLE', 'SYMBOLE': 'CHIFFRE',
  'ORIGINE': 'DESTIN', 'DESTIN': 'ORIGINE',
  // Actions
  'AGIR': 'ÉCOUTER', 'ÉCOUTER': 'AGIR',
  'DIRE': 'RECEVOIR', 'RECEVOIR': 'DIRE',
  'CRÉER': 'ACCUEILLIR', 'ACCUEILLIR': 'CRÉER',
  'PARTAGER': 'PROTÉGER', 'PROTÉGER': 'PARTAGER',
  'ALLER VERS': 'SE RETIRER', 'SE RETIRER': 'ALLER VERS',
  'CHOISIR': 'PATIENTER', 'PATIENTER': 'CHOISIR',
  'EXPRIMER': 'OBSERVER', 'OBSERVER': 'EXPRIMER',
  'ORDONNER': 'RÉCONCILIER', 'RÉCONCILIER': 'ORDONNER',
  'MANIFESTER': 'ARRÊTER', 'ARRÊTER': 'MANIFESTER'
};

// Sens original, écrit spécifiquement pour ces pages (jamais une reprise du
// texte du livret physique, qui reste exclusif à l'expérience payante).
const MEANINGS = {
  JOIE: "Dans l'Oracle Oradia, la carte Joie appartient à la famille des Émotions. Elle porte une polarité yang, tournée vers l'expansion et l'élan plutôt que le retrait. Tirer la carte Joie signale généralement un mouvement de légèreté qui traverse le moment présent, une énergie qui circule sans effort ni calcul. C'est une carte qui accompagne les périodes où quelque chose s'ouvre naturellement, sans qu'il soit besoin de le forcer.",
  TRISTESSE: "La carte Tristesse appartient à la famille des Émotions, avec une polarité yin tournée vers l'intériorité. Elle n'indique pas un échec mais un mouvement de descente, un moment où quelque chose se dépose et cherche à se relâcher. La tristesse invite à ralentir plutôt qu'à combattre ce qui se retire, le temps qu'une clarté nouvelle se forme.",
  AMOUR: "La carte Amour, famille Émotions, polarité yang, indique une énergie qui relie et rassemble. Elle signale la présence d'un lien authentique, une confiance qui circule entre deux personnes ou entre soi et une situation. Tirer cette carte invite à reconnaître ce qui, dans la relation, mérite d'être nommé et accueilli.",
  SOLITUDE: "La carte Solitude, famille Émotions, polarité yin, évoque un retrait nécessaire plutôt qu'un isolement subi. Elle marque un temps où l'on se recentre loin du bruit et des attentes extérieures. Cette carte accompagne souvent une phase de maturation silencieuse, avant qu'une direction plus claire ne se dessine.",
  ÉMERVEILLEMENT: "La carte Émerveillement, famille Émotions, polarité yang, ouvre une brèche dans le regard habituel. Elle signale l'arrivée d'une fraîcheur, d'une curiosité qui perçoit le monde autrement. Tirer cette carte invite à se laisser surprendre, sans chercher immédiatement à tout expliquer.",
  DÉGOÛT: "La carte Dégoût, famille Émotions, polarité yin, indique un rejet clair de ce qui ne convient plus. Elle n'est pas là pour être réprimée mais pour être entendue comme une information précise sur une limite atteinte. Cette carte invite à distinguer ce qui doit être écarté de ce qui peut encore être transformé.",
  SÉRÉNITÉ: "La carte Sérénité, famille Émotions, polarité yang, évoque un état d'équilibre où le monde se reflète sans bruit intérieur. Elle signale une période où les tensions s'apaisent d'elles-mêmes. Tirer cette carte invite à profiter de cette stabilité pour observer une situation avec plus de recul.",
  CONFUSION: "La carte Confusion, famille Émotions, polarité yin, évoque un moment où les repères habituels se brouillent. Elle n'annonce pas une erreur mais une étape où plusieurs pistes coexistent encore sans hiérarchie claire. Cette carte invite à ne pas forcer une décision tant que la brume n'est pas levée.",
  COLÈRE: "La carte Colère, famille Émotions, polarité yang, indique une énergie qui cherche à se libérer d'une contrainte. Elle signale une frontière qui a été franchie et qui demande à être reconnue. Tirer cette carte invite à utiliser cette force pour affirmer une limite plutôt qu'à la subir.",
  IMPUISSANCE: "La carte Impuissance, famille Émotions, polarité yin, évoque un moment où l'action semble suspendue. Elle ne signale pas un manque de valeur mais un passage où la force ne trouve pas encore son chemin. Cette carte invite à patienter sans se juger, le temps que le mouvement redevienne possible.",
  COURAGE: "La carte Courage, famille Émotions, polarité yang, indique un pas fait malgré l'incertitude. Elle signale une capacité à avancer sans attendre que toutes les peurs aient disparu. Tirer cette carte invite à franchir une étape précise, même modestement.",
  PEUR: "La carte Peur, famille Émotions, polarité yin, évoque un mouvement qui se fige devant l'inconnu. Elle n'est pas là pour être ignorée mais pour indiquer une zone qui demande prudence ou préparation. Cette carte invite à identifier précisément ce qui inquiète, plutôt qu'à le laisser dans le flou.",
  CONFIANCE: "La carte Confiance, famille Émotions, polarité yang, évoque un ancrage stable, comme un arbre enraciné vers la lumière. Elle signale une période où l'on peut s'appuyer sur ses propres ressources ou sur un lien fiable. Tirer cette carte invite à agir depuis cette assise plutôt que depuis le doute.",
  HONTE: "La carte Honte, famille Émotions, polarité yin, évoque un mouvement de repli, un visage qui se détourne. Elle signale une blessure liée au regard des autres ou à soi-même, qui demande à être reconnue sans jugement supplémentaire. Cette carte invite à un accueil doux de ce qui a été caché.",
  FIERTÉ: "La carte Fierté, famille Émotions, polarité yang, indique une stabilité gagnée par une traversée réelle. Elle signale qu'une épreuve passée continue de soutenir la personne aujourd'hui. Tirer cette carte invite à reconnaître ce chemin parcouru, sans fausse modestie.",
  CULPABILITÉ: "La carte Culpabilité, famille Émotions, polarité yin, évoque une lourdeur née d'un geste jugé mal ajusté. Elle ne demande pas une punition mais une réparation possible, quand elle est encore utile. Cette carte invite à distinguer la responsabilité réelle du poids que l'on s'impose en trop.",
  IMPATIENCE: "La carte Impatience, famille Émotions, polarité yang, évoque une énergie qui piaffe avant que le moment ne soit venu. Elle signale un désir fort d'avancer, parfois plus vite que la situation ne le permet. Tirer cette carte invite à canaliser cet élan plutôt qu'à le retenir totalement.",
  PATIENCE: "La carte Patience, famille Émotions, polarité yin, évoque un mûrissement qui se fait dans l'ombre, sans précipitation. Elle signale qu'un résultat est en formation mais pas encore visible. Cette carte invite à faire confiance au temps nécessaire plutôt qu'à forcer une conclusion prématurée.",

  RECONNAISSANCE: "La carte Reconnaissance, famille Besoins, polarité yang, évoque un besoin d'être vu et validé dans ce que l'on apporte. Elle signale qu'une part de soi attend d'être nommée par un regard extérieur. Tirer cette carte invite à identifier où ce besoin se joue précisément en ce moment.",
  SÉCURITÉ: "La carte Sécurité, famille Besoins, polarité yin, évoque un besoin de stabilité, un foyer où se reposer. Elle signale l'importance de consolider une base avant d'avancer plus loin. Cette carte invite à vérifier ce qui, concrètement, permettrait de se sentir plus en confiance.",
  LIBERTÉ: "La carte Liberté, famille Besoins, polarité yang, évoque un besoin de mouvement, de clôtures invisibles à faire tomber. Elle signale une aspiration à décider par soi-même, sans contrainte extérieure excessive. Tirer cette carte invite à repérer ce qui, précisément, limite cet espace aujourd'hui.",
  SOUTIEN: "La carte Soutien, famille Besoins, polarité yin, évoque un besoin d'appui, deux forces qui se rejoignent pour tenir ensemble. Elle signale qu'une situation gagnerait à ne pas être portée seul. Cette carte invite à identifier qui, ou quoi, pourrait constituer un appui réel en ce moment.",
  REPOS: "La carte Repos, famille Besoins, polarité yin, évoque un besoin de ralentir, un corps qui se dépose. Elle signale qu'une pause n'est pas un luxe mais une nécessité pour la suite. Tirer cette carte invite à s'autoriser un temps réellement disponible pour ne rien faire.",
  CLARTÉ: "La carte Clarté, famille Besoins, polarité yang, évoque un besoin de voir net, un soleil qui perce la brume. Elle signale qu'une situation confuse gagnerait à être reformulée simplement. Cette carte invite à poser la question exacte qui manque encore.",
  APPARTENANCE: "La carte Appartenance, famille Besoins, polarité yin, évoque un besoin de faire partie d'un cercle qui accueille. Elle signale l'importance d'un lien de groupe, familial ou choisi. Tirer cette carte invite à repérer où ce besoin se fait sentir, ou où il est déjà comblé sans être remarqué.",
  AUTONOMIE: "La carte Autonomie, famille Besoins, polarité yang, évoque un besoin d'avancer sans attendre d'autorisation extérieure. Elle signale une capacité, parfois sous-utilisée, à décider par soi-même. Cette carte invite à identifier un pas que l'on peut faire seul, dès maintenant.",
  STIMULATION: "La carte Stimulation, famille Besoins, polarité yang, évoque un besoin d'étincelle, de nouveauté qui relance le mouvement. Elle signale qu'une routine pourrait avoir besoin d'un élément qui la ranime. Tirer cette carte invite à chercher ce qui, concrètement, redonnerait de l'élan.",
  HARMONIE: "La carte Harmonie, famille Besoins, polarité yin, évoque un besoin d'accord, comme des cordes justement accordées. Elle signale l'importance de faire coïncider plusieurs éléments plutôt que d'en forcer un seul. Cette carte invite à chercher un ajustement plutôt qu'un compromis subi.",
  'AMOUR REÇU': "La carte Amour Reçu, famille Besoins, polarité yang, évoque un besoin d'être touché par la douceur d'autrui. Elle signale l'importance de se laisser recevoir, pas seulement donner. Tirer cette carte invite à vérifier si ce mouvement de réception est réellement autorisé en ce moment.",
  'LE SENS': "La carte Le Sens, famille Besoins, polarité yin, évoque un besoin de direction, une lanterne qui éclaire le chemin. Elle signale la recherche d'une cohérence entre ce que l'on fait et ce que l'on veut réellement vivre. Cette carte invite à formuler ce qui donnerait sens à la situation actuelle.",
  PROTECTION: "La carte Protection, famille Besoins, polarité yin, évoque un besoin d'abri, un manteau qui couvre de chaleur. Elle signale qu'une part fragile mérite d'être mise à l'abri pour le moment. Tirer cette carte invite à identifier ce qui a besoin d'être protégé, sans pour autant s'enfermer.",
  EXPANSION: "La carte Expansion, famille Besoins, polarité yang, évoque un besoin d'élargir l'horizon, d'aller au-delà des limites connues. Elle signale une aspiration à grandir, dans un projet, une relation ou une pensée. Cette carte invite à repérer la direction précise vers laquelle cette expansion cherche à se produire.",
  INTIMITÉ: "La carte Intimité, famille Besoins, polarité yin, évoque un besoin d'espace protégé où déposer ce qui est secret. Elle signale l'importance d'un lien suffisamment sûr pour se dévoiler. Tirer cette carte invite à identifier où ce besoin de proximité vraie se fait sentir.",
  CRÉATIVITÉ: "La carte Créativité, famille Besoins, polarité yang, évoque un besoin de façonner une forme neuve à partir d'une étincelle. Elle signale une énergie qui cherche à s'exprimer concrètement. Cette carte invite à donner une forme, même modeste, à ce qui cherche à naître.",
  AUTHENTICITÉ: "La carte Authenticité, famille Besoins, polarité yin, évoque un besoin de laisser tomber le masque pour que le visage réel demeure. Elle signale une aspiration à être vu tel que l'on est, sans ajustement de façade. Tirer cette carte invite à identifier où un masque pourrait aujourd'hui être déposé.",
  GUIDANCE: "La carte Guidance, famille Besoins, polarité yang, évoque un besoin de repère, une étoile qui brille au-dessus du chemin. Elle signale l'utilité de chercher un appui extérieur pour éclairer une décision. Cette carte invite à identifier quelle forme de guidance serait la plus juste en ce moment.",

  ACCEPTATION: "La carte Acceptation, famille Transmutation, polarité yin, évoque une pierre qui se laisse sculpter par la rivière plutôt que de lui résister. Elle signale un mouvement où l'on cesse de lutter contre ce qui est déjà là. Tirer cette carte invite à distinguer ce qui peut encore être changé de ce qui demande simplement à être reconnu.",
  TRANSFORMATION: "La carte Transformation, famille Transmutation, polarité yang, évoque le bois qui brûle et devient flamme. Elle signale un changement de nature, pas seulement d'apparence. Cette carte invite à accueillir ce que ce passage exige de laisser derrière soi.",
  'LÂCHER-PRISE': "La carte Lâcher-prise, famille Transmutation, polarité yin, évoque une feuille qui tombe et nourrit la terre. Elle signale le moment de cesser de contrôler ce qui ne dépend plus de nous. Tirer cette carte invite à identifier précisément ce qu'il s'agit de relâcher.",
  LIBÉRATION: "La carte Libération, famille Transmutation, polarité yang, évoque une digue qui cède et laisse la vie circuler à nouveau. Elle signale la fin d'une contrainte qui pesait depuis un moment. Cette carte invite à observer ce qui redevient possible une fois l'obstacle levé.",
  PARDON: "La carte Pardon, famille Transmutation, polarité yin, évoque des chaînes brisées qui rouillent désormais au sol. Elle signale un mouvement de dénouement, envers soi ou envers un autre. Tirer cette carte invite à mesurer ce que ce geste libère, sans obligation de tout excuser.",
  ALIGNEMENT: "La carte Alignement, famille Transmutation, polarité yang, évoque des astres qui se rassemblent sur un même axe. Elle signale une cohérence retrouvée entre plusieurs parties de soi ou d'un projet. Cette carte invite à repérer ce qui, une fois aligné, rendrait le mouvement plus fluide.",
  DÉTACHEMENT: "La carte Détachement, famille Transmutation, polarité yin, évoque un oiseau qui s'élève sans s'accrocher aux branches. Elle signale la possibilité de prendre de la distance sans rompre le lien. Tirer cette carte invite à observer une situation depuis un peu plus haut.",
  PURIFICATION: "La carte Purification, famille Transmutation, polarité yang, évoque une eau claire qui traverse la roche. Elle signale un processus de nettoyage, intérieur ou concret, encore en cours. Cette carte invite à laisser ce mouvement se poursuivre sans le précipiter.",
  ANCRAGE: "La carte Ancrage, famille Transmutation, polarité yin, évoque des racines qui plongent dans un sol fertile. Elle signale un besoin de stabilité avant d'aller plus loin. Tirer cette carte invite à identifier ce qui, concrètement, pourrait servir d'appui solide en ce moment.",
  OUVERTURE: "La carte Ouverture, famille Transmutation, polarité yang, évoque une porte qui s'entrouvre laissant passer la lumière. Elle signale la possibilité d'un passage qui n'était pas visible auparavant. Cette carte invite à remarquer ce qui, discrètement, commence déjà à s'ouvrir.",
  FLUIDITÉ: "La carte Fluidité, famille Transmutation, polarité yin, évoque une rivière qui contourne l'obstacle sans effort. Elle signale la possibilité de s'adapter plutôt que de forcer un passage. Tirer cette carte invite à chercher le contournement plutôt que l'affrontement direct.",
  CLARIFICATION: "La carte Clarification, famille Transmutation, polarité yang, évoque l'essentiel qui apparaît dans une lumière retrouvée. Elle signale qu'un tri est en train de s'opérer entre ce qui compte et ce qui encombre. Cette carte invite à nommer ce qui devient enfin net.",
  'PRISON MENTALE': "La carte Prison Mentale, famille Transmutation, polarité yin, évoque une pensée qui tourne et referme l'horizon. Elle signale un schéma répétitif qui limite le champ des possibles perçus. Tirer cette carte invite à repérer la pensée précise qui maintient cette fermeture.",
  'ESPRIT LIBRE': "La carte Esprit Libre, famille Transmutation, polarité yang, évoque un passage qui s'ouvre et laisse circuler la lumière intérieure. Elle signale une libération du mental, une pensée qui retrouve de l'espace. Cette carte invite à observer ce qui devient possible une fois cette liberté retrouvée.",
  VIDE: "La carte Vide, famille Transmutation, polarité yin, évoque une coupe vide qui attend d'être remplie. Elle signale un espace non encore occupé, plutôt qu'un manque définitif. Tirer cette carte invite à accueillir cette vacance sans se précipiter pour la combler.",
  PLÉNITUDE: "La carte Plénitude, famille Transmutation, polarité yang, évoque un vase qui déborde de miel et d'offrandes. Elle signale un moment d'abondance ressentie, matérielle ou intérieure. Cette carte invite à reconnaître pleinement ce qui est déjà présent.",
  INCARNATION: "La carte Incarnation, famille Transmutation, polarité yin, évoque un pas qui touche la terre lourde. Elle signale le besoin de rendre concret ce qui reste encore à l'état d'idée. Tirer cette carte invite à identifier le premier geste réel qui ancrerait ce mouvement.",
  TRANSCENDANCE: "La carte Transcendance, famille Transmutation, polarité yang, évoque une route qui s'éclaire autrement depuis la hauteur. Elle signale la possibilité de prendre du recul sur une situation qui semblait bloquée. Cette carte invite à chercher ce point de vue élargi.",

  "L'ALCHIMISTE": "L'Alchimiste, archétype de polarité yin, évoque le plomb qui rêve de devenir or. Il incarne la capacité à transformer une matière brute, une épreuve ou une limite, en quelque chose de précieux. Tirer cette carte invite à repérer ce qui, dans une situation difficile, pourrait déjà être en train de se transmuter.",
  'LE BÂTISSEUR': "Le Bâtisseur, archétype de polarité yang, évoque une structure qui s'élève quand le geste est clair. Il incarne la capacité à donner une forme durable à une intention. Cette carte invite à identifier la prochaine pierre concrète à poser.",
  'LA PRÊTRESSE': "La Prêtresse, archétype de polarité yin, évoque un voile qui se soulève dans l'espace intérieur. Elle incarne l'accès à une connaissance sensible, plus intuitive que rationnelle. Tirer cette carte invite à faire confiance à ce que l'on perçoit sans pouvoir encore l'expliquer.",
  'LE VOYAGEUR': "Le Voyageur, archétype de polarité yang, évoque chaque pas qui transforme celui qui marche. Il incarne le mouvement comme moteur de transformation personnelle. Cette carte invite à considérer un déplacement, réel ou symbolique, comme une part du chemin lui-même.",
  'LE NOMADE': "Le Nomade, archétype de polarité yang, évoque un pas qui demeure stable même quand l'horizon recule. Il incarne une capacité à rester soi-même à travers le changement constant. Tirer cette carte invite à identifier ce qui, en soi, reste fiable quel que soit le contexte.",
  'LE RÊVEUR': "Le Rêveur, archétype de polarité yin, évoque un œil fermé qui voit ce que le monde tait. Il incarne l'accès à l'imaginaire comme source d'information à part entière. Cette carte invite à prendre au sérieux une intuition ou une image intérieure récurrente.",
  'LE VISIONNAIRE': "Le Visionnaire, archétype de polarité yang, évoque un regard qui perce les âges à venir. Il incarne la capacité à anticiper une direction avant qu'elle ne soit visible pour d'autres. Tirer cette carte invite à formuler clairement l'intuition d'avenir qui se dessine.",
  'LA TISSEUSE': "La Tisseuse, archétype de polarité yin, évoque un fil qui relie ce que la vie a séparé. Elle incarne la capacité à recoudre des liens ou des sens dispersés. Cette carte invite à repérer ce qui, actuellement, cherche à être relié.",
  'LE GUERRIER': "Le Guerrier, archétype de polarité yang, évoque un cœur qui frappe avec droiture. Il incarne une force engagée au service d'une cause claire, sans agressivité gratuite. Tirer cette carte invite à identifier le combat qui mérite vraiment d'être mené.",
  'LE SAGE': "Le Sage, archétype de polarité yin, évoque un silence qui enseigne plus que mille mots. Il incarne une forme de recul qui laisse la situation se clarifier d'elle-même. Cette carte invite à observer avant d'agir, ou à choisir simplement de ne rien dire pour l'instant.",
  'LE MAGE': "Le Mage, archétype de polarité yang, évoque l'invisible qui répond à celui qui sait écouter. Il incarne une capacité à agir sur ce qui ne se voit pas directement. Tirer cette carte invite à considérer une dimension moins évidente de la situation.",
  "L'ENFANT": "L'Enfant, archétype de polarité yin, évoque un premier pas qui s'avance sans mémoire du chemin. Il incarne une capacité à recommencer sans le poids de l'expérience passée. Cette carte invite à retrouver une forme de spontanéité, même dans un contexte sérieux.",
  'LE JUSTE': "Le Juste, archétype de polarité yang, évoque une main qui tranche en paix et rétablit l'équilibre. Il incarne une décision prise avec clarté plutôt que par réaction. Tirer cette carte invite à chercher la position la plus équilibrée, pas nécessairement la plus confortable.",
  'LE VEILLEUR': "Le Veilleur, archétype de polarité yin, évoque une conscience qui ne fuit pas ce qui dérange. Il incarne une vigilance calme, attentive à ce qui se joue en arrière-plan. Cette carte invite à regarder en face un élément que l'on évite peut-être.",
  'LE PASSEUR': "Le Passeur, archétype de polarité yang, évoque celui qui traverse et relie sans s'attarder. Il incarne une capacité à accompagner un changement sans s'y accrocher. Tirer cette carte invite à envisager son propre rôle dans une transition en cours.",
  'LE PORTEUR': "Le Porteur, archétype de polarité yin, évoque celui qui soutient ce qui doit grandir et lui offre un appui solide. Il incarne une présence stable au service d'un projet ou d'une personne. Cette carte invite à identifier ce que l'on porte actuellement, et si ce poids reste juste.",
  "L'INITIATEUR": "L'Initiateur, archétype de polarité yang, évoque un geste qui ouvre un seuil irréversible. Il incarne le moment précis où une chose commence réellement. Tirer cette carte invite à repérer ce premier pas qui engage la suite.",
  "L'OBSERVATEUR": "L'Observateur, archétype de polarité yin, évoque un retrait qui éclaire ce que l'agitation masque. Il incarne la valeur de prendre du champ avant de conclure. Cette carte invite à observer une situation sans intervenir tout de suite.",

  CLÉ: "La carte Clé, famille Révélations, polarité yang, évoque un objet caché qui ouvre une chambre secrète. Elle signale l'existence d'un élément précis capable de débloquer une situation. Tirer cette carte invite à chercher ce détail, souvent discret, qui change la lecture d'ensemble.",
  PORTE: "La carte Porte, famille Révélations, polarité yin, évoque une ouverture qui se dessine dans un mur. Elle signale un passage possible là où l'on ne voyait qu'un obstacle. Cette carte invite à repérer cette ouverture, même partielle.",
  MESSAGE: "La carte Message, famille Révélations, polarité yang, évoque un murmure qui s'élève, porteur d'un sens à écouter. Elle signale qu'une information importante circule déjà, sous une forme parfois discrète. Tirer cette carte invite à prêter attention à ce qui vient d'être dit ou remarqué récemment.",
  SYNCHRONICITÉ: "La carte Synchronicité, famille Révélations, polarité yin, évoque deux instants qui se touchent et font apparaître un sens. Elle signale la valeur d'une coïncidence qui, prise au sérieux, éclaire une situation. Cette carte invite à noter les rapprochements qui semblent trop précis pour être anodins.",
  SIGNE: "La carte Signe, famille Révélations, polarité yin, évoque un indice modeste qui attire l'œil attentif. Elle signale qu'un détail, en apparence mineur, mérite d'être considéré. Tirer cette carte invite à revenir sur ce que l'on a peut-être trop vite écarté.",
  VISION: "La carte Vision, famille Révélations, polarité yang, évoque un œil qui perce au-delà des voiles habituels. Elle signale une capacité à voir plus loin que la situation immédiate. Cette carte invite à formuler ce que l'on perçoit sans encore le nommer pleinement.",
  PRÉSAGE: "La carte Présage, famille Révélations, polarité yin, évoque un souffle d'avenir qui traverse déjà le présent. Elle signale qu'une tendance se dessine avant même d'être confirmée. Tirer cette carte invite à observer les premiers signes d'une évolution en cours.",
  ÉVEIL: "La carte Éveil, famille Révélations, polarité yang, évoque une conscience qui s'ouvre et rend tout visible autrement. Elle signale une prise de conscience qui change la lecture d'une situation entière. Cette carte invite à accueillir ce que l'on vient de comprendre, même si cela déplace des certitudes.",
  LUMIÈRE: "La carte Lumière, famille Révélations, polarité yang, évoque un rayon qui fend l'ombre. Elle signale une clarté qui arrive, parfois soudainement, sur un point resté flou. Tirer cette carte invite à accueillir cette clarté sans chercher à la minimiser.",
  DÉVOILEMENT: "La carte Dévoilement, famille Révélations, polarité yin, évoque un rideau qui s'écarte et laisse la scène apparaître. Elle signale qu'une information ou une vérité va, ou vient de, se révéler. Cette carte invite à se préparer à voir une situation telle qu'elle est réellement.",
  VÉRITÉ: "La carte Vérité, famille Révélations, polarité yang, évoque un voile qui tombe et laisse l'essence apparaître. Elle signale le moment de nommer les choses telles qu'elles sont, sans détour. Tirer cette carte invite à identifier ce qu'il devient nécessaire de dire clairement.",
  ILLUSION: "La carte Illusion, famille Révélations, polarité yin, évoque une image qui trompe et captive. Elle signale la présence possible d'un malentendu ou d'une projection à vérifier. Cette carte invite à distinguer ce qui est réellement observé de ce qui est simplement supposé.",
  ÉTINCELLE: "La carte Étincelle, famille Révélations, polarité yang, évoque un feu qui naît d'une poussière de pierre. Elle signale le tout début d'une idée ou d'un projet, encore fragile mais réel. Tirer cette carte invite à protéger ce commencement plutôt qu'à le juger trop vite.",
  SILENCE: "La carte Silence, famille Révélations, polarité yin, évoque une absence de bruit qui révèle l'essentiel. Elle signale la valeur d'une pause, avant de répondre ou de conclure. Cette carte invite à laisser un vide s'installer, plutôt qu'à le remplir immédiatement.",
  CHIFFRE: "La carte Chiffre, famille Révélations, polarité yang, évoque un nombre qui ordonne un univers caché. Elle signale la présence d'une structure ou d'une régularité derrière ce qui semblait dispersé. Tirer cette carte invite à chercher la logique sous-jacente à une situation.",
  SYMBOLE: "La carte Symbole, famille Révélations, polarité yin, évoque une image muette qui parle au cœur. Elle signale qu'une représentation, un rêve ou un objet porte un sens à décoder. Cette carte invite à s'attarder sur ce qui revient sous forme d'image plutôt que de mot.",
  ORIGINE: "La carte Origine, famille Révélations, polarité yin, évoque une source qui coule en amont de tout. Elle signale l'intérêt de remonter à la racine d'une situation plutôt que d'en traiter les effets. Tirer cette carte invite à se demander d'où vient réellement ce qui se joue aujourd'hui.",
  DESTIN: "La carte Destin, famille Révélations, polarité yang, évoque une flèche qui vole vers son but. Elle signale une trajectoire qui semble déjà engagée, avec une direction propre. Cette carte invite à reconnaître ce mouvement plutôt qu'à chercher à le contrôler entièrement.",

  AGIR: "La carte Agir, famille Actions, polarité yang, évoque une graine qui pousse en sortant de terre. Elle signale que le moment est venu de passer du projet au geste concret. Tirer cette carte invite à identifier la première action possible, même minime.",
  ÉCOUTER: "La carte Écouter, famille Actions, polarité yin, évoque une oreille qui se penche sur le murmure. Elle signale l'utilité de recevoir avant de répondre. Cette carte invite à laisser parler l'autre, ou la situation, un peu plus longtemps.",
  DIRE: "La carte Dire, famille Actions, polarité yang, évoque une parole qui tranche comme un souffle clair. Elle signale le moment d'exprimer ce qui restait tu. Tirer cette carte invite à formuler simplement ce qu'il devient nécessaire de dire.",
  RECEVOIR: "La carte Recevoir, famille Actions, polarité yin, évoque un cœur ouvert qui accueille le don. Elle signale la capacité, parfois oubliée, à laisser entrer ce qui est offert. Cette carte invite à vérifier si l'on se permet réellement de recevoir en ce moment.",
  CRÉER: "La carte Créer, famille Actions, polarité yang, évoque un geste qui façonne ce qui n'existait pas encore. Elle signale une énergie disponible pour donner naissance à quelque chose de concret. Tirer cette carte invite à passer à la fabrication plutôt qu'à rester dans l'idée.",
  ACCUEILLIR: "La carte Accueillir, famille Actions, polarité yin, évoque une porte qui s'ouvre à l'inattendu. Elle signale une disposition à laisser entrer ce qui n'était pas prévu. Cette carte invite à ne pas refermer trop vite une porte qui vient de s'ouvrir.",
  PARTAGER: "La carte Partager, famille Actions, polarité yang, évoque une coupe qui passe de main en main. Elle signale l'intérêt de faire circuler ce que l'on détient, ressource, idée ou expérience. Tirer cette carte invite à identifier ce qui gagnerait à être transmis plutôt que gardé.",
  PROTÉGER: "La carte Protéger, famille Actions, polarité yin, évoque un abri qui se dresse autour du fragile. Elle signale la nécessité de mettre quelque chose à l'écart, le temps qu'il se consolide. Cette carte invite à repérer ce qui a besoin d'être mis en sécurité maintenant.",
  'ALLER VERS': "La carte Aller Vers, famille Actions, polarité yang, évoque un pas qui cherche la rencontre. Elle signale l'utilité de faire le premier mouvement plutôt que d'attendre. Tirer cette carte invite à identifier vers qui, ou vers quoi, ce pas pourrait se diriger.",
  'SE RETIRER': "La carte Se Retirer, famille Actions, polarité yin, évoque le sage qui quitte la foule. Elle signale l'intérêt de prendre de la distance plutôt que de rester dans l'agitation. Cette carte invite à s'autoriser un retrait, même temporaire.",
  CHOISIR: "La carte Choisir, famille Actions, polarité yang, évoque un carrefour qui appelle une décision. Elle signale qu'une situation ne peut plus rester en suspens indéfiniment. Tirer cette carte invite à nommer les options réelles avant de trancher.",
  PATIENTER: "La carte Patienter, famille Actions, polarité yin, évoque un fruit qui mûrit lentement. Elle signale que l'action juste, ici, consiste à ne pas agir tout de suite. Cette carte invite à observer ce qui a encore besoin de temps.",
  EXPRIMER: "La carte Exprimer, famille Actions, polarité yang, évoque ce que l'on porte qui prend forme en parole claire. Elle signale le moment de traduire un ressenti interne en mots communicables. Tirer cette carte invite à chercher les mots justes pour ce qui, jusque-là, restait intérieur.",
  OBSERVER: "La carte Observer, famille Actions, polarité yin, évoque un œil qui contemple sans agir. Elle signale l'intérêt de simplement regarder une situation avant d'intervenir. Cette carte invite à suspendre l'action le temps d'une observation attentive.",
  ORDONNER: "La carte Ordonner, famille Actions, polarité yang, évoque une main qui trace l'alignement des pierres. Elle signale un besoin de mettre de la structure dans ce qui est dispersé. Tirer cette carte invite à organiser concrètement un ou deux éléments désordonnés.",
  RÉCONCILIER: "La carte Réconcilier, famille Actions, polarité yin, évoque des mains qui se rejoignent après la discorde. Elle signale la possibilité de renouer un lien abîmé. Cette carte invite à identifier le geste, même modeste, qui pourrait amorcer ce rapprochement.",
  MANIFESTER: "La carte Manifester, famille Actions, polarité yang, évoque une parole qui devient chair. Elle signale le passage d'une intention à une réalité concrète et visible. Tirer cette carte invite à observer ce qui, précisément, est en train de se matérialiser.",
  ARRÊTER: "La carte Arrêter, famille Actions, polarité yin, évoque un pas qui s'interrompt, la poussière qui retombe. Elle signale la nécessité de mettre fin à un mouvement qui ne sert plus. Cette carte invite à reconnaître ce qu'il est temps de cesser.",

  'LE TORE': "La carte Le Tore, famille Mémoire Cosmos, relie l'ombre et la lumière ; de son centre pulse la danse éternelle des cycles. Elle situe le tirage dans une perspective plus large que la seule situation présente, celle des mouvements cycliques qui traversent une vie. Tirer cette carte invite à considérer où l'on se trouve dans un cycle plus vaste.",
  'MÉMOIRE CELLULAIRE': "La carte Mémoire Cellulaire, famille Mémoire Cosmos, évoque un corps qui conserve la trace du vivant, une bibliothèque où rien ne se perd. Elle signale qu'une information physique ou ancienne pourrait éclairer la situation actuelle. Cette carte invite à écouter ce que le corps indique, au-delà du mental.",
  'MÉMOIRE COLLECTIVE': "La carte Mémoire Collective, famille Mémoire Cosmos, évoque un groupe qui rêve à travers l'individu, une conscience partagée qui tisse un monde commun. Elle signale qu'une dynamique plus large que la sphère personnelle est peut-être à l'œuvre. Tirer cette carte invite à replacer une situation dans son contexte familial, social ou culturel.",
  'ARCHIVE DU VIVANT': "La carte Archive du Vivant, famille Mémoire Cosmos, évoque des racines qui prolongent une histoire plus vaste que l'individu. Elle signale un héritage, reçu et à transmettre, qui dépasse la seule trajectoire personnelle. Cette carte invite à considérer ce que l'on porte d'une lignée plus large.",
  "SOUVENIR D'ÂME": "La carte Souvenir d'Âme, famille Mémoire Cosmos, évoque des résonances anciennes qui émergent sans prévenir, cherchant moins à expliquer qu'à révéler. Elle signale qu'un écho profond, difficile à situer précisément, traverse la situation. Tirer cette carte invite à accueillir cette résonance sans exiger d'elle une explication immédiate.",
  'LE SOUFFLE DU VIVANT': "La carte Le Souffle du Vivant, famille Mémoire Cosmos, évoque une respiration secrète qui traverse le monde, dans son rythme naît l'impulsion du vivant. Elle signale une force qui anime la situation, plus vaste que la seule volonté personnelle. Cette carte invite à se relier à ce mouvement plutôt qu'à vouloir tout maîtriser.",
  'TEMPS INTÉRIEUR': "La carte Temps Intérieur, famille Mémoire Cosmos, évoque un instant silencieux où tout converge, ouvrant la porte des rythmes profonds. Elle signale une temporalité intérieure différente du calendrier extérieur. Tirer cette carte invite à honorer son propre rythme plutôt que celui imposé de l'extérieur.",
  'LIGNES DE VIE': "La carte Lignes de Vie, famille Mémoire Cosmos, évoque une graine qui porte en silence des chemins multiples, chaque choix traçant une direction qui attend d'être vécue. Elle signale l'existence de plusieurs trajectoires possibles à partir du même point. Cette carte invite à considérer les options encore ouvertes, sans se figer sur une seule.",
  'POINT ZÉRO': "La carte Point Zéro, famille Mémoire Cosmos, évoque un centre où tout se suspend dans un silence dense, là où s'esquisse la naissance d'un monde nouveau. Elle signale un moment de bascule, un point de départ plutôt qu'une fin. Tirer cette carte invite à reconnaître ce commencement, même s'il ne prend pas encore de forme visible.",
  'TISSAGE COSMIQUE': "La carte Tissage Cosmique, famille Mémoire Cosmos, évoque des fils invisibles qui se cherchent dans l'ombre, révélant dans leur rencontre une cohérence secrète. Elle signale que des éléments apparemment séparés pourraient former un ensemble plus cohérent qu'il n'y paraît. Cette carte invite à chercher le lien caché entre deux choses qui semblaient sans rapport."
};

// resolveCardImageUrl renvoie une URL absolue (utile pour les emails) ; les
// pages du site utilisent des chemins relatifs comme /images/... (voir joie.html).
function toRelativeImagePath(absoluteUrl) {
  if (!absoluteUrl) return null;
  return absoluteUrl.replace(/^https:\/\/oradia\.fr/, '');
}

const CARTES_DIR = path.join(__dirname, '..', 'cartes');
if (!fs.existsSync(CARTES_DIR)) fs.mkdirSync(CARTES_DIR, { recursive: true });

function buildPage({ name, familyLabel, polarity, quote, meaning, mirror, slug, imageUrl }) {
  const polarityLabel = polarity === 'yang' ? 'Yang' : 'Yin';
  const displayName = titleCase(name);
  const mirrorSlug = mirror ? slugify(mirror) : null;
  const mirrorDisplay = mirror ? titleCase(mirror) : null;

  const mirrorBlock = mirror ? `
    <div class="mirror-link">
      <p>Carte miroir</p>
      <a href="/cartes/${mirrorSlug}.html">${mirrorDisplay} &rarr;</a>
    </div>` : '';

  const mirrorSentence = mirror
    ? `Dans le système des cartes miroirs d'Oradia, ${displayName} répond à <a href="/cartes/${mirrorSlug}.html" style="color:#d4af37;border-bottom:1px solid rgba(212,175,55,0.3);">${mirrorDisplay}</a> : les deux ne s'opposent pas, elles se répondent, comme deux versants d'un même mouvement.`
    : `Cette carte appartient aux dix cartes de Mémoire Cosmos, une famille sans carte miroir, qui apporte une perspective plus large (temps, mémoire, cycles) quand le tirage l'appelle.`;

  const imgAlt = `Carte ${displayName}, famille ${familyLabel}, Oracle Oradia`;
  // Le visuel n'est jamais servi dans le HTML initial (voir js/card-image-gate.js) :
  // il n'apparaît, injecté côté client, qu'après confirmation d'un abonnement actif.
  const cardVisualAttrs = imageUrl
    ? ` id="card-visual" data-image="${imageUrl}" data-alt="${imgAlt.replace(/"/g, '&quot;')}"`
    : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Carte ${displayName} &middot; Signification | Oracle Oradia</title>
  <meta name="description" content="Que signifie la carte ${displayName} dans l'Oracle Oradia ? Famille ${familyLabel}, polarité ${polarityLabel}. Découvrez son sens et tirez-la gratuitement.">
  <link rel="canonical" href="https://oradia.fr/cartes/${slug}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="https://oradia.fr/cartes/${slug}">
  <meta property="og:title" content="Carte ${displayName} &middot; Signification | Oracle Oradia">
  <meta property="og:description" content="Famille ${familyLabel}, polarité ${polarityLabel}.">
  <meta property="og:image" content="https://oradia.fr/images/medias/apercu_stripe.jpg">
  <meta property="og:site_name" content="Oradia">
  <meta property="og:locale" content="fr_FR">
  <meta name="author" content="Rudy Boucheron">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "Carte ${displayName} \\u00b7 Signification | Oracle Oradia",
    "description": "Famille ${familyLabel}, polarité ${polarityLabel}.",
    "author": { "@type": "Person", "name": "Rudy Boucheron", "url": "https://oradia.fr/a-propos.html" },
    "publisher": { "@type": "Organization", "name": "Oradia", "url": "https://oradia.fr" },
    "datePublished": "2026-09-15",
    "dateModified": "2026-09-15",
    "url": "https://oradia.fr/cartes/${slug}",
    "inLanguage": "fr"
  }
  <\/script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=Lora:ital,wght@0,400;0,500;1,400&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: linear-gradient(rgba(10,25,47,0.82), rgba(10,25,47,0.92)), url('/images/oradia-hero-4k.webp') center top / cover no-repeat fixed, #0a192f; color: #c8c0a8; font-family: 'Lora', Georgia, serif; min-height: 100vh; }
    a { color: inherit; text-decoration: none; }
    main { max-width: 640px; margin: 0 auto; padding: 48px 24px 96px; }
    .back-link { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: rgba(212,175,55,0.5); margin-bottom: 32px; transition: color 0.2s; letter-spacing: 0.05em; }
    .back-link:hover { color: #d4af37; }
    .card-visual { text-align: center; margin-bottom: 32px; }
    .card-visual img { display: block; width: 240px; height: 360px; object-fit: cover; border-radius: 14px; border: 1px solid rgba(212,175,55,0.4); box-shadow: 0 12px 40px rgba(0,0,0,0.45); margin: 0 auto; }
    .card-locked { width: 240px; height: 360px; margin: 0 auto; border-radius: 14px; border: 1px solid rgba(212,175,55,0.25); background: rgba(212,175,55,0.04); box-shadow: 0 12px 40px rgba(0,0,0,0.45); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; padding: 24px; }
    .card-locked .lock-icon { font-size: 30px; opacity: 0.7; }
    .card-locked p { font-size: 13px; color: rgba(200,192,168,0.75); line-height: 1.6; }
    .card-locked a { font-size: 12.5px; color: #d4af37; border: 1px solid rgba(212,175,55,0.35); border-radius: 50px; padding: 8px 18px; letter-spacing: 0.03em; }
    .card-locked a:hover { background: rgba(212,175,55,0.08); }
    .card-meta { font-size: 12px; color: rgba(212,175,55,0.5); letter-spacing: 0.18em; text-transform: uppercase; margin-bottom: 10px; text-align: center; }
    h1 { font-family: 'Cormorant Garamond', Georgia, serif; font-size: clamp(32px, 5vw, 46px); font-weight: 400; color: #f0c75e; line-height: 1.2; margin-bottom: 22px; text-align: center; }
    .quote { font-family: 'Cormorant Garamond', Georgia, serif; font-style: italic; font-size: 19px; color: #f5e7a1; text-align: center; line-height: 1.6; margin: 0 auto 40px; max-width: 460px; opacity: 0.9; }
    .article-body { font-size: 16.5px; line-height: 1.85; color: #c8c0a8; }
    .article-body p { margin-bottom: 22px; }
    .cta-block { margin-top: 56px; padding: 36px; background: rgba(212,175,55,0.05); border: 1px solid rgba(212,175,55,0.15); border-radius: 12px; text-align: center; }
    .cta-block p { font-size: 14.5px; color: rgba(200,192,168,0.7); margin-bottom: 22px; line-height: 1.7; font-style: italic; }
    .cta-btn { display: inline-block; background: linear-gradient(135deg, #d4af37, #f5e7a1); color: #0a1628; font-family: 'Cormorant Garamond', Georgia, serif; font-size: 16px; font-weight: 600; padding: 14px 36px; border-radius: 50px; letter-spacing: 0.05em; transition: opacity 0.2s; margin: 0 6px 10px; }
    .cta-btn:hover { opacity: 0.88; }
    .cta-btn.secondary { background: transparent; border: 1px solid rgba(212,175,55,0.4); color: #d4af37; }
    .mirror-link { display: block; margin-top: 48px; padding-top: 28px; border-top: 1px solid rgba(212,175,55,0.15); text-align: center; }
    .mirror-link p { font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: rgba(212,175,55,0.5); margin-bottom: 10px; }
    .mirror-link a { color: #d4af37; font-family: 'Cormorant Garamond', Georgia, serif; font-size: 19px; border-bottom: 1px solid rgba(212,175,55,0.3); padding-bottom: 2px; }
  </style>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <link rel="stylesheet" href="/style.css">
  <script src="/security.js"><\/script>
</head>
<body>
  <div id="header-placeholder"></div>

  <main>
    <a href="/cartes.html" class="back-link">&larr; Toutes les cartes</a>

    <div class="card-visual"${cardVisualAttrs}>
      <div class="card-locked">
        <span class="lock-icon">&#128274;</span>
        <p>Visuel r&eacute;serv&eacute; aux abonn&eacute;&middot;e&middot;s</p>
        <a href="/member/login.html">Se connecter</a>
      </div>
    </div>
    <p class="card-meta">Famille ${familyLabel} &middot; Polarit&eacute; ${polarityLabel}</p>
    <h1>Carte ${displayName}</h1>
    <p class="quote">&laquo;&nbsp;${quote}&nbsp;&raquo;</p>

    <div class="article-body">
      <p>${meaning}</p>
      <p>${mirrorSentence}</p>
      <p>Cette page en donne le sens g&eacute;n&eacute;ral. Dans un tirage r&eacute;el, la carte ${displayName} se lit toujours en lien avec les autres cartes tir&eacute;es et avec l'intention pos&eacute;e au d&eacute;part, c'est cette lecture combin&eacute;e, propre &agrave; chaque tirage, que l'oracle en ligne d&eacute;veloppe.</p>
    </div>

    <div class="cta-block">
      <p>Envie de voir quelles cartes l'oracle r&eacute;v&egrave;le pour votre propre question&nbsp;?</p>
      <a href="/tore.html" class="cta-btn">Faire un tirage gratuit</a>
      <a href="/precommande-oracle.html" class="cta-btn secondary">D&eacute;couvrir l'oracle physique</a>
    </div>
${mirrorBlock}
  </main>

  <div id="footer-placeholder"></div>
  <script src="/components/header-manager.js" defer><\/script>
  <script src="/components/footer-manager.js" defer><\/script>
  <script src="/js/page-tracker.js" defer><\/script>
  <script src="/js/card-image-gate.js" defer><\/script>
</body>
</html>
`;
}

let created = 0, missingMeaning = [], missingImage = [];

Object.keys(deck).forEach(familyKey => {
  const familyLabel = FAMILY_LABELS[familyKey] || familyKey;
  deck[familyKey].forEach(card => {
    const name = card.name;
    const slug = slugify(name);

    const meaning = MEANINGS[name];
    if (!meaning) { missingMeaning.push(name); return; }

    const imageUrl = toRelativeImagePath(resolveCardImageUrl(name));
    if (!imageUrl) missingImage.push(name);

    const html = buildPage({
      name, familyLabel, polarity: card.polarity, quote: card.quote,
      meaning, mirror: MIRROR_PAIRS[name] || null, slug, imageUrl
    });

    fs.writeFileSync(path.join(CARTES_DIR, `${slug}.html`), html, 'utf8');
    created++;
  });
});

console.log(`Créées: ${created}`);
if (missingMeaning.length) console.log('MEANINGS manquants pour:', missingMeaning.join(', '));
if (missingImage.length) console.log('Images introuvables pour:', missingImage.join(', '));
