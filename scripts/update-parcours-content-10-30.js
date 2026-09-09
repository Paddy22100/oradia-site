// Réécrit en profondeur les étapes 10 à 30 du parcours newsletters :
// - jamais à la première personne du singulier ("je") ;
// - ancré dans un parcours d'apprentissage initiatique spirituel : conscience, hasard
//   quantique, rétrocausalité, temps, neurosciences, biais cognitifs, Jung, savoirs
//   anciens empiriques ;
// - aucun tiret long (—) ;
// - "L'oracle de La Boussole Intérieure" partout où le texte désigne l'outil comme
//   agent (jamais "La Boussole" seule) ;
// - plus de ligne de signature finale ("La Boussole Intérieure. Comprendre, choisir,
//   avancer. Précommandes ouvertes sur oradia.fr.") en bas de chaque étape.
//
// Ne touche JAMAIS une étape déjà validée (extra.parcours_valide === true) — vérifié
// avant chaque écriture, et l'étape est purement et simplement sautée si c'est le cas.
// Remplace scripts/update-parcours-tone-10-23.js (contenu maintenant obsolète : seules
// deux étapes y étaient couvertes, avec l'ancien ton encore trop scientifique/sceptique).
//
// Usage (depuis la racine du dépôt) :
//   node --env-file=.env.local scripts/update-parcours-content-10-30.js

const { createClient } = require('@supabase/supabase-js');

const UPDATES = [
  {
    ordre: 10,
    subject: `Rudy d'ORADIA - Guillemant, Garnier Malet et la physique de l'invisible`,
    content: `<p>Dans cet univers, certains chercheurs explorent une physique de l'invisible. Jean-Pierre Garnier Malet, ingénieur et chercheur, publie depuis plus de vingt ans sur le dédoublement quantique de la conscience. Philippe Guillemant, docteur en physique et ancien chercheur au CNRS, développe une physique du temps et de la conscience qui rejoint des intuitions vieilles comme l'humanité : celle d'un double intérieur qui perçoit au-delà de l'instant présent.</p>
<p>Leur travail invite à prendre au sérieux ce que la physique établie rend déjà pensable : le temps qui ralentit avec la vitesse, le passé et le futur qui coexistent au sens géométrique, l'observateur qui influence ce qu'il observe. Garnier Malet et Guillemant proposent un mécanisme plus précis encore, celui du dédoublement : à chaque instant, la conscience se divise, explore plusieurs futurs en parallèle, et n'en réintègre qu'un seul, celui vers lequel l'intention, consciente ou non, oriente le choix.</p>
<p>Ce mécanisme change la lecture des intuitions et des synchronicités. Si une part de la conscience explore déjà les futurs possibles, une intuition n'est plus un accident du hasard : c'est un message qui remonte. Une synchronicité n'est plus une coïncidence qu'on choisit de remarquer : c'est le signal d'un futur déjà entrevu, qui cherche à se rappeler au présent.</p>
<p>Ce n'est pas une croyance à embrasser aveuglément, mais une hypothèse cohérente, appuyée par des chercheurs sérieux, qui rejoint aussi des savoirs bien plus anciens. Les traditions chamaniques, les oracles antiques et les pratiques divinatoires de toutes les cultures reposent depuis des millénaires sur cette même intuition empirique, que la science redécouvre aujourd'hui avec ses propres outils.</p>
<p>L'oracle de La Boussole Intérieure s'appuie sur ce même principe. Il aide à faire le silence nécessaire pour que ce double, cette part de la conscience qui voit plus loin, puisse enfin se faire entendre. Le corps qui se pose, le présent qui s'ouvre : la condition pour que l'information circule.</p>`
  },
  {
    ordre: 11,
    subject: `Rudy d'ORADIA - La brume n'est pas un vide`,
    content: `<p>Il arrive que la vie dépose dans une zone de brume. Les repères s'effacent, les élans retombent, ce qui donnait sens hier ne répond plus. Le premier réflexe est de fuir cette sensation, ou de la corriger au plus vite.</p>
<p>Carl Gustav Jung décrivait ce type de traversée comme une étape nécessaire du processus d'individuation, la lente transformation par laquelle une personne devient pleinement elle-même. Les traditions alchimiques anciennes, dont Jung s'est nourri pour construire sa psychologie, nommaient cette phase la nigredo, l'œuvre au noir : un moment d'obscurité qui précède toujours une clarification plus profonde.</p>
<p>Et si cette brume était un signe plutôt qu'un manque ? Pendant des années, une grande partie du comportement humain est portée par des automatismes : des directions prises par habitude, des rôles endossés sans avoir été choisis. Les neurosciences décrivent ce pilote intérieur comme un ensemble de circuits appris, efficaces, mais aveugles au changement du terrain.</p>
<p>La brume apparaît souvent quand ce pilote cesse de répondre, là où les anciennes réponses ne collent plus à la vie devenue nouvelle. Ce n'est pas une panne, c'est un décalage qui devient enfin perceptible. Ce qui ressemble à une perte de sens est parfois la première fois depuis longtemps où plus rien ne décide à la place de celui ou celle qui traverse cette zone.</p>
<p>La question n'est plus de retrouver les repères d'avant, mais de distinguer lesquels étaient vraiment les siens, et lesquels avaient été adoptés par simple inertie.</p>
<p>La zone de brume n'est pas un lieu où l'on se perd. C'est un lieu où l'on peut, pour une fois, cesser de se suivre aveuglément, et commencer à se choisir.</p>`
  },
  {
    ordre: 12,
    subject: `Rudy d'ORADIA - Quand l'attente devient le chemin`,
    content: `<p>Il y a une scène que presque tout le monde connaît. On a semé, ou décidé, ou envoyé le message qui compte, et il ne reste plus qu'à attendre. Les journées s'étirent, rien ne bouge en surface, et l'impatience s'installe comme si le temps lui-même avait cessé de travailler.</p>
<p>Sous la terre pourtant, une graine ne reste jamais immobile. Elle absorbe l'humidité, gonfle, déploie une radicelle avant même qu'aucune pousse ne perce le sol. Le jardinier qui gratterait la terre chaque matin pour vérifier ne ferait qu'interrompre ce travail. Rien de ce qui compte, dans une germination, ne se voit depuis l'extérieur avant l'heure.</p>
<p>La physique quantique offre une image proche de cette expérience. Tant qu'un système n'est pas observé, il n'est pas figé dans un seul état : il explore plusieurs possibles à la fois, superposés, avant qu'une mesure n'en fixe un seul. L'attente ressemble à cela. Ce qui semble immobile en surface explore peut-être, sous le seuil de la conscience, plusieurs futurs à la fois, avant qu'un seul ne se cristallise dans le réel.</p>
<p>L'impatience naît d'une confusion précise : elle prend l'absence de signe visible pour une absence de mouvement. Or le corps, lui, sait la différence. Une tension au ventre, un sommeil agité, une pensée qui revient sans cesse au même endroit ne sont pas des signes que rien ne se passe. Ce sont les signes que quelque chose, précisément, est en train de se réorganiser.</p>
<p>Le seuil n'est donc pas la ligne qu'on franchit à l'arrivée. C'est tout ce temps souterrain, invisible et pourtant actif, qui prépare le moment où quelque chose pourra enfin affleurer. Vouloir l'accélérer ne change rien à la maturation. Cela ne fait qu'ajouter de la tension à un processus qui suit déjà son propre rythme.</p>
<p>L'oracle de La Boussole Intérieure ne raccourcit pas cette attente. Il aide à la traverser autrement, à reconnaître, dans ce qui semble immobile, le travail réel qui s'y accomplit déjà.</p>`
  },
  {
    ordre: 13,
    subject: `Rudy d'ORADIA - Le barrage`,
    content: `<p>Ce que l'on nomme élan, ou énergie vitale, n'est pas une substance que l'on pourrait mettre en flacon. C'est le nom que l'expérience donne à quelque chose de très réel : la sensation de circuler, ou de ne plus circuler. Toutes les cultures l'ont nommé.</p>
<p>Le qi de la médecine chinoise, le prana des traditions indiennes, le mana des cultures polynésiennes désignent, sous des formes différentes, cette même intuition empirique, affinée sur des millénaires d'observation directe du corps. Les neurosciences contemporaines, avec le système nerveux autonome et le nerf vague, en décrivent aujourd'hui les mécanismes précis. Deux langages différents pour une même expérience vécue.</p>
<p>Imaginons ce mouvement comme un fluide. Il cherche la pente et emprunte le chemin le plus disponible. Tant que rien ne l'entrave, il ne fait aucun bruit. Puis vient un barrage, construit pour de bonnes raisons, à une époque où le flux emportait tout et où il fallait retenir pour survivre. L'ouvrage a tenu. Il tient encore, longtemps après que la crue soit passée.</p>
<p>Un barrage ne coûte rien à tenir. Mais il s'use. Il travaille en silence, sous une pression constante, et cette usure est cumulative et invisible. Le corps connaît cela sous d'autres noms : le sommeil qui se dégrade, la fatigue qui s'installe. Le prix de l'adaptation ne se paie pas pendant le danger. Il se paie après, en usure.</p>
<p>Et le fluide ne renonce pas. Retenu, il cherche des issues, il ressort ailleurs. Ce sont les symptômes : non le problème, mais le chemin qu'un mouvement empêché a trouvé pour continuer d'exister.</p>
<p>On ne guérit pas un barrage en le renforçant. On ouvre une vanne, un peu, on regarde ce qui descend. Ouvrir une vanne, c'est allonger une expiration, laisser une sensation remonter jusqu'à être sentie. Le fluide reprend sa pente. On a seulement cessé de retenir.</p>`
  },
  {
    ordre: 14,
    subject: `Rudy d'ORADIA - Les non-dits du cœur, ces chaînes douces`,
    content: `<p>Deux personnes se taisent l'une devant l'autre, et pourtant tout circule. Une déception non dite, un besoin jamais nommé, une blessure ancienne qu'on préfère ne pas rouvrir. Le silence n'est pas vide. Il est plein de ce qu'on a choisi de ne pas dire, et ce non-dit continue de tenir la relation, aussi sûrement qu'un fil tendu entre deux mains qui n'osent plus se lâcher ni se serrer.</p>
<p>Le psychologue Marshall Rosenberg, en observant des milliers de conflits, a fait un constat simple : la plupart des tensions ne viennent pas d'un désaccord sur les faits, mais d'une confusion entre l'observation, le jugement, l'émotion et le besoin. Dire tu ne m'écoutes jamais accuse. Dire la solitude pèse, et le besoin d'être entendu n'a pas été nommé, ouvre. Le lien se referme sur le premier, il se rouvre sur le second.</p>
<p>Ce que l'on appelle attachement est souvent, en réalité, un empilement de ces besoins jamais formulés. Chacun attend que l'autre devine, et personne ne devine tout à fait juste. La chaîne n'est pas faite d'amour en trop. Elle est faite de mots qu'on a eu peur de prononcer, par crainte de déranger, de paraître exigeant, ou simplement de ne pas être compris.</p>
<p>Nommer un besoin ne fragilise pas un lien. Cela lui donne enfin une forme sur laquelle l'autre peut s'appuyer. Ce n'est pas un aveu de faiblesse, c'est un acte de clarté, et la clarté est souvent ce qui manque le plus dans les relations qui durent depuis longtemps.</p>
<p>L'oracle de La Boussole Intérieure aide à retrouver, sous la plainte ou le silence, le besoin réel qui attend d'être dit. Une fois nommé, il peut enfin circuler autrement qu'en tension.</p>`
  },
  {
    ordre: 15,
    subject: `Rudy d'ORADIA - Chronos, Kairos, Aiôn`,
    content: `<p>Les Grecs, pour parler du temps, avaient trois mots là où beaucoup de langues modernes n'en ont qu'un. Cette distinction, vieille de vingt-cinq siècles, éclaire une expérience que beaucoup vivent sans parvenir à la nommer.</p>
<p>Chronos, c'est le temps que l'on mesure. Successif, divisible, identique à lui-même. Celui du calendrier et des créneaux. On le gagne, on le perd, on l'optimise. Kairos, c'est tout autre chose : le moment opportun. Non pas un instant quand, mais un instant où quelque chose peut se faire. Une porte qui s'ouvre, brièvement. Il ne se planifie pas, il se saisit. Aiôn, enfin, c'est le temps du déploiement d'une vie, celui qui persiste sans se compter.</p>
<p>Les personnes qui disent manquer de temps n'en manquent presque jamais. Leurs heures sont là, comptées. Ce qui leur manque n'est pas Chronos. C'est Kairos. Aucune porte ne s'ouvre, rien n'est jamais le bon moment.</p>
<p>Or Chronos ne se dilate jamais. C'est Kairos qui apparaît quand le souffle ralentit. Le bon moment n'est pas une case du calendrier. C'est un état du corps dans lequel le présent redevient assez large pour qu'on puisse y agir.</p>
<p>L'oracle de La Boussole Intérieure ne donne pas plus de Chronos. Il fait apparaître du Kairos.</p>`
  },
  {
    ordre: 16,
    subject: `Rudy d'ORADIA - La synchronicité vous parle de vous`,
    content: `<p>Vous pensez à quelqu'un, il appelle. Un mot croisé le matin resurgit le soir. Ces coïncidences frappent, et il est tentant d'y voir un message envoyé par le monde. Carl Gustav Jung a passé une partie de sa vie à prendre ce phénomène au sérieux, jusqu'à lui donner un nom : la synchronicité, ce qu'il définissait comme un principe de connexion acausale, deux événements liés par le sens plutôt que par la cause.</p>
<p>Le cerveau, lorsqu'une intention l'habite, se met à détecter partout ce qui s'y rapporte. On remarque ce qu'on ne voyait pas, et on ne compte jamais les fois où l'on a pensé à quelqu'un sans qu'il appelle : ces non-événements ne laissent aucune trace. Les neurosciences décrivent ce biais cognitif avec précision. Il explique une grande partie de ce qu'on remarque, sans épuiser pour autant la question de ce qui se produit.</p>
<p>Car pour Jung comme pour les modèles plus récents de Garnier Malet et Guillemant, la coïncidence n'est pas seulement une affaire de perception. Une synchronicité informe sur ce qui, en vous, était déjà en mouvement, et pourrait aussi être le signe d'un lien réel entre votre état intérieur et ce qui se manifeste autour de vous, deux expressions d'un même processus plutôt qu'un simple hasard de l'attention.</p>
<p>Un tirage fonctionne selon cette même logique. Sa valeur ne vient pas seulement de ce que vous y reconnaissez de vous-même : elle vient aussi de ce lien, que Jung pressentait et que la physique du dédoublement commence à formuler autrement, entre l'intérieur et ce qui se présente au bon moment.</p>`
  },
  {
    ordre: 17,
    subject: `Rudy d'ORADIA - La liberté est un intervalle`,
    content: `<p>On imagine souvent le libre arbitre comme un pouvoir sur le monde : choisir son avenir, orienter les événements. C'est peut-être placer la liberté au mauvais endroit.</p>
<p>Entre ce qui déclenche une réaction et la réaction elle-même, il existe un écart. Chez un système nerveux en alerte, cet écart se referme : la réaction suit le stimulus sans qu'aucun choix ne s'intercale. On croit décider, alors qu'on ne fait que réagir, poussé par un passé qui prédit à sa place.</p>
<p>Les neurosciences ont mesuré cet écart avec précision, notamment à travers les expériences du physiologiste Benjamin Libet sur le délai entre l'activité cérébrale et la décision consciente. Elles n'ont pas aboli le libre arbitre : elles ont montré où il se loge réellement, non dans le déclenchement de l'action, mais dans la capacité à l'infléchir avant qu'elle ne s'accomplisse.</p>
<p>La vraie liberté n'est pas de commander au monde. C'est d'élargir cet intervalle. D'ouvrir, entre le déclencheur et la réponse, un espace où quelque chose d'autre que l'automatisme peut se glisser. Un espace où l'on peut voir ce qui monte, reconnaître d'où cela vient, et ne pas le suivre aveuglément.</p>
<p>Cet écart ne s'obtient pas par la volonté. Il s'obtient par le corps, parce que c'est l'état du système nerveux qui commande l'épaisseur du présent. Le souffle ralenti l'ouvre. La tension le referme.</p>
<p>L'oracle de La Boussole Intérieure ne promet pas de choisir votre destin. Il aide à ouvrir l'intervalle où un choix, enfin, devient possible. C'est modeste, et c'est la plus grande liberté qui soit.</p>`
  },
  {
    ordre: 18,
    subject: `Rudy d'ORADIA - L'arbre porte son passé`,
    content: `<p>Un arbre porte dans sa forme toute son histoire. Chaque bifurcation passée, chaque branche maîtresse, chaque blessure cicatrisée oriente ce qui pourra encore pousser. Rien de ce qui a poussé ne peut être défait.</p>
<p>Et pourtant l'arbre n'est pas achevé. La sève se distribue. Ce qui est nourri croît, ce qui ne l'est plus s'étiole, et la forme de l'année prochaine se décide dans cette répartition. Le futur n'est pas inscrit d'avance dans l'arbre. Mais il n'est pas non plus totalement ouvert : il est contraint par tout ce qui a précédé.</p>
<p>L'épigénétique, cette discipline récente des neurosciences, décrit un mécanisme voisin : les expériences vécues, en particulier les plus marquantes, peuvent modifier l'expression des gènes sans changer le code lui-même, et laisser une empreinte transmissible. Le passé façonne le terrain sans jamais fermer entièrement le champ des possibles.</p>
<p>La liberté ne consiste pas à tout pouvoir, elle consiste à diriger la sève à l'intérieur de ce champ. Recreuser un chemin ne se fait pas par décision. Cela se fait par répétition, et la répétition passe par le corps. Chaque geste répété creuse un peu plus le sillon choisi.</p>
<p>L'oracle de La Boussole Intérieure accompagne cette lente redirection. Non pas transformer l'arbre d'un coup, mais nourrir, jour après jour, la branche que l'on souhaite voir grandir.</p>`
  },
  {
    ordre: 19,
    subject: `Rudy d'ORADIA - La répétition n'est pas une malédiction, c'est une signature`,
    content: `<p>Le même obstacle revient. La même dispute, sous une autre forme. Le même mur financier, professionnel, créatif, qui semblait pourtant compris, dépassé, résolu, et qui se redresse un peu plus loin sur le chemin. On y voit facilement une malédiction, comme si quelque chose refusait obstinément d'apprendre.</p>
<p>Le cerveau ne fonctionne pourtant pas par malédiction. Il fonctionne par motifs. Une situation ancienne, vécue comme menaçante ou insatisfaite, laisse une empreinte, et cette empreinte devient un filtre à travers lequel des situations nouvelles sont reconnues, classées, traitées, souvent avant même que la conscience n'ait eu le temps d'intervenir. Ce n'est pas une faiblesse de caractère. C'est un biais cognitif, un système de reconnaissance qui a été efficace un jour, et qui continue de tourner.</p>
<p>Carl Gustav Jung nommait complexe cette même dynamique : un noyau émotionnel autonome, formé autour d'une expérience marquante, capable de s'activer seul et de rejouer le même scénario tant qu'il n'a pas été reconnu consciemment. Ce qui revient n'est donc pas un hasard malheureux. C'est une signature, au sens le plus littéral : une marque reconnaissable, qui indique où se trouve encore un motif non intégré.</p>
<p>Combattre le motif de front ne le fait pas taire. On ne raye pas une signature en appuyant plus fort dessus. Ce qui la transforme, c'est de la reconnaître au moment où elle apparaît, de la nommer pour ce qu'elle est, une réponse ancienne rejouée sur un présent différent, et de laisser, une seule fois, une réponse neuve prendre sa place.</p>
<p>L'oracle de La Boussole Intérieure ne promet pas de faire disparaître ce qui revient. Il aide à le reconnaître assez tôt pour, cette fois, choisir autrement.</p>`
  },
  {
    ordre: 20,
    subject: `Rudy d'ORADIA - D'où viennent les idées`,
    content: `<p>Une idée neuve semble parfois tomber du ciel, si complète, si soudaine, qu'on la croit reçue de l'extérieur. Cette impression mérite d'être prise au sérieux plutôt que d'être immédiatement corrigée.</p>
<p>Une partie du mécanisme est bien documentée par les neurosciences de la créativité. Il faut d'abord un stock : personne n'a jamais eu d'idée neuve dans un domaine qu'il ignore. Puis une variation : dans les états de relâchement, l'esprit associe librement des éléments qui ne se parlent pas d'ordinaire. Enfin une sélection : quelque chose retient, trie, garde. Ce brassage se fait hors de la conscience, d'où l'illumination, l'idée qui surgit sous la douche, en marchant, en jouant d'un instrument.</p>
<p>Mais ce mécanisme décrit le comment, pas nécessairement tout le pourquoi. Si le modèle du dédoublement quantique de Garnier Malet et Guillemant est juste, l'état de relâchement n'est peut-être pas seulement une recombinaison interne : c'est aussi la porte par laquelle une information explorée ailleurs, dans un futur possible déjà entrevu par une part plus vaste de la conscience, peut enfin remonter jusqu'à la pensée consciente.</p>
<p>Un indice mérite d'être noté : si les idées venaient uniquement d'un ailleurs parfait, elles seraient toutes justes. Or beaucoup sont mauvaises, y compris chez les esprits les plus créatifs. Le tri reste un travail intérieur, même quand l'étincelle vient d'ailleurs.</p>
<p>L'oracle de La Boussole Intérieure n'apporte pas de réponse toute faite. Il installe l'état de relâchement où ce qui doit remonter, d'où que cela vienne, peut enfin se recombiner et se laisser reconnaître.</p>`
  },
  {
    ordre: 21,
    subject: `Rudy d'ORADIA - Le souffle, cette aiguille`,
    content: `<p>De tous les leviers disponibles sur l'état intérieur, le souffle est le plus immédiat. C'est le seul pont volontaire vers un système qui, autrement, échappe à la volonté.</p>
<p>Quand la respiration ralentit, en particulier quand l'expiration s'allonge, un signal circule du corps vers le cerveau par le nerf vague. Ce signal apaise, ordonne, ralentit. Le rythme cardiaque s'assouplit, et l'état d'ensemble bascule vers le calme. Ce n'est pas une croyance, c'est un mécanisme documenté par les neurosciences.</p>
<p>Les traditions anciennes l'avaient observé bien avant que la physiologie ne le mesure. Le pranayama indien, la respiration taoïste, les techniques de souffle des chamanismes sibériens reposent toutes sur la même intuition empirique : ralentir le souffle change l'état de conscience. Des millénaires de pratique convergent avec les découvertes récentes sur le nerf vague.</p>
<p>Et parce que le temps vécu se fabrique à partir de ces signaux corporels, ralentir le souffle ne calme pas seulement : cela dilate le présent. Le monde cesse de presser. L'espace intérieur se rouvre. Trois expirations lentes suffisent souvent à déplacer le point de vue.</p>
<p>Chaque tirage commence par là. Avant les mots, avant l'image, le souffle. Car rien de ce qui suit ne serait audible dans un corps encore en alerte.</p>`
  },
  {
    ordre: 22,
    subject: `Rudy d'ORADIA - Vocation et sens : la sève qui vous traverse`,
    content: `<p>Une question revient souvent, sous des formes différentes : à quoi cela sert-il vraiment ? Elle se pose rarement dans le confort. Elle surgit dans les carrefours, quand un métier, une vie, une routine ne suffisent plus à répondre à ce qu'on cherche.</p>
<p>Aucun organisme vivant ne se pose cette question seul. Une racine ne pousse pas pour elle-même, elle nourrit l'arbre, qui abrite un oiseau, qui disperse une graine, qui deviendra une autre racine ailleurs. Le vivant n'a jamais fonctionné par unités séparées, mais par circulation. Ce que l'on appelle vocation n'est peut-être rien d'autre que le moment où l'on ressent, avec netteté, sa propre place dans cette circulation plus large.</p>
<p>Certaines civilisations anciennes, notamment en Égypte, ont bâti des sociétés d'une remarquable longévité en organisant leur vie collective autour de ce principe : chaque geste, chaque saison, chaque fonction sociale était pensé en lien avec un ordre plus vaste, celui du fleuve, des cycles, du vivant qui les portait. Cette intuition ancienne mérite d'être prise au sérieux : une vie déconnectée du tout se fatigue plus vite qu'une vie qui se sait reliée.</p>
<p>Chercher sa vocation, ce n'est donc pas chercher un rôle unique et parfait, à trouver une fois pour toutes. C'est sentir, encore et encore, la direction dans laquelle l'élan nourrit quelque chose de plus grand que soi, et accepter que cette direction puisse bouger avec le temps, comme la sève change de trajet selon les saisons sans jamais cesser de circuler.</p>
<p>L'oracle de La Boussole Intérieure ne donne pas de réponse toute faite sur la vocation. Il aide à sentir, dans le présent retrouvé, où la sève a envie d'aller aujourd'hui.</p>`
  },
  {
    ordre: 23,
    subject: `Rudy d'ORADIA - Romuald Leterrier et la rétrocausalité de l'intention`,
    content: `<p>Le travail de Romuald Leterrier explore les synchronicités, les rêves, et ce qu'il nomme la rétrocausalité de l'intention. Un domaine qui rejoint directement les mécanismes décrits par Garnier Malet et Guillemant : un futur qui n'est pas simplement subi, mais qui participe, en retour, à façonner le présent.</p>
<p>Ces explorations éclairent une expérience humaine universelle : le sentiment qu'un événement répond à une question intérieure, la coïncidence qui semble trop précise pour être fortuite. Cette perception n'est pas une illusion à corriger. C'est une capacité ancienne, présente dans toutes les cultures sous des formes diverses, que les sociétés modernes ont largement désapprise.</p>
<p>Un futur peut influencer le présent, non comme une fatalité écrite d'avance, mais comme une invitation. Poser une intention claire, c'est envoyer un signal vers cette part de la conscience qui, dans les modèles de Garnier Malet et Leterrier, explore déjà les chemins possibles. Ce qui revient ensuite, sous forme d'intuition ou de synchronicité, n'est pas le fruit du hasard : c'est une réponse.</p>
<p>L'oracle de La Boussole Intérieure prend au sérieux cette expérience du sens, et ce qui la rend possible : un lien réel entre ce qui se porte maintenant et ce qui attend plus loin dans le temps.</p>`
  },
  {
    ordre: 24,
    subject: `Rudy d'ORADIA - Quand le soi et le temps se dissolvent`,
    content: `<p>Ceux qui méditent depuis longtemps rapportent une expérience étrange : dans les états les plus profonds, le sentiment d'être un soi séparé s'atténue, et le sentiment du temps s'efface avec lui. Les deux disparaissent ensemble.</p>
<p>Ce n'est pas une coïncidence poétique. Le sentiment d'être un soi continu se construit, comme la durée, à partir du flux permanent des sensations du corps. Puisqu'ils puisent à la même source, ils varient ensemble. Modifier le rapport au corps modifie les deux.</p>
<p>Les traditions non duelles, qu'elles viennent de l'Advaita Vedanta indien ou du bouddhisme, décrivent depuis des siècles cette même dissolution comme la porte d'un état plus vaste de conscience. Jung, dans ses derniers travaux, s'en est approché avec le concept de Soi, cette totalité psychique qui dépasse le moi ordinaire et son sentiment de séparation.</p>
<p>Cela éclaire ces instants où le temps semble suspendu : la contemplation d'un paysage, l'absorption dans un geste, la présence pleine auprès d'un être aimé. Dans ces moments, on ne se sent plus séparé, et l'on ne compte plus les minutes. Le soi s'allège, le temps s'ouvre. Ces états ne sont pas réservés aux moines. Ils s'effleurent dans la vie ordinaire, chaque fois que l'attention se pose vraiment.</p>
<p>Un tirage, à sa mesure, ouvre une petite fenêtre de cet ordre. Un moment où l'on cesse de courir, où le présent s'épaissit, où l'on se retrouve simplement là.</p>`
  },
  {
    ordre: 25,
    subject: `Rudy d'ORADIA - Accueillir ce qui monte`,
    content: `<p>Une émotion monte, et le premier réflexe est souvent de la repousser. La colère paraît inconvenante, la tristesse encombrante, la peur honteuse. On apprend, parfois dès l'enfance, à ranger ce qui déborde plutôt qu'à le regarder. Le calme qu'on obtient ainsi n'est pourtant pas de la sérénité. C'est une émotion mise sous pression, qui attend son heure.</p>
<p>Les neurosciences décrivent l'émotion comme un signal, pas comme un défaut. Elle informe sur un besoin satisfait ou menacé, elle mobilise le corps pour agir en conséquence, puis elle est censée se dissiper une fois le message reçu. Ce cycle dure rarement plus de quelques minutes lorsqu'il va à son terme. Ce qui s'éternise, ce n'est presque jamais l'émotion elle-même. C'est la résistance qu'on lui oppose.</p>
<p>Accueillir une émotion ne veut pas dire lui obéir. Cela veut dire lui laisser le temps d'être sentie, nommée, traversée, sans la juger et sans agir immédiatement sous son emprise. Entre sentir la colère et la déverser sur quelqu'un, il y a tout un espace où elle peut simplement être reconnue pour ce qu'elle transporte comme information.</p>
<p>La sérénité, ainsi comprise, n'est pas l'absence d'émotion. C'est la capacité à laisser circuler ce qui monte sans en être submergé ni le nier. Un corps qui accueille ainsi ses mouvements intérieurs gagne, avec le temps, une stabilité que la seule maîtrise ne donne jamais.</p>
<p>L'oracle de La Boussole Intérieure ouvre cet espace d'accueil, quelques minutes, le temps d'un tirage. Ce qui s'y sent n'a pas besoin d'être combattu. Il a seulement besoin d'être reconnu.</p>`
  },
  {
    ordre: 26,
    subject: `Rudy d'ORADIA - Le passé déguisé en avenir`,
    content: `<p>Voici peut-être l'une des idées les plus utiles de tout ce parcours. Une partie de ce que l'on prend pour une perception de l'avenir est en réalité une projection du passé.</p>
<p>Le système nerveux ne se contente pas de réagir à ce qui arrive. Il anticipe. À partir de tout ce qui a été vécu, il prédit en permanence ce qui vient, et il ajuste l'état du corps en conséquence. Quand cette prédiction est juste, on l'appelle intuition. Quand elle est périmée, décalée d'une vie qui n'existe plus, on l'appelle symptôme. C'est le même mécanisme. La peur qui saisit sans raison n'est pas toujours une prémonition : elle peut être une scène ancienne qui se rejoue sur le présent.</p>
<p>Mais tout pressentiment n'est pas réductible à cela. Les modèles de la rétrocausalité, portés par Garnier Malet, Guillemant et Leterrier, décrivent une autre source possible : une information qui viendrait réellement d'un futur déjà exploré, et non d'un passé simplement recyclé. Les deux mécanismes coexistent, et la difficulté, précisément, est de les distinguer.</p>
<p>Comprendre cela change tout. Cela permet de ne plus obéir aveuglément à un signal, mais de lui demander : de quand viens-tu ? Du passé qui se rejoue, ou d'un futur qui cherche à se faire entendre ?</p>
<p>L'oracle de La Boussole Intérieure ouvre l'espace où cette question devient possible, celui où l'on peut distinguer la vieille alarme qui n'a plus lieu d'être du signal qui, lui, mérite d'être écouté.</p>`
  },
  {
    ordre: 27,
    subject: `Rudy d'ORADIA - Ce que la conscience sait faire`,
    content: `<p>Personne ne sait ce qu'est la conscience. C'est l'une des rares questions où l'honnêteté impose de le reconnaître : ici, la science elle-même atteint sa limite. On peut décrire le cerveau dans le détail, prédire des comportements, et ne toujours pas expliquer pourquoi tout cela s'accompagne d'un ressenti, pourquoi il y a un effet que cela fait d'être soi. Les philosophes appellent cela le problème difficile de la conscience.</p>
<p>Ce mystère est réel, et il attire toutes les extrapolations. C'est précisément parce que la science n'a pas encore résolu la question que des chercheurs comme Guillemant et Garnier Malet peuvent proposer des modèles où la conscience ne se limite pas au cerveau, où elle explore le temps autrement que de manière strictement linéaire. Un mystère non résolu laisse la porte ouverte à ces hypothèses, plutôt que de les fermer.</p>
<p>Ce que l'on peut dire, en tout cas, est déjà beau. La conscience permet de s'observer soi-même. De voir son propre automatisme fonctionner, de reconnaître qu'une réaction appartient à une scène ancienne, et de ne pas la suivre. Ce n'est pas seulement un pouvoir sur le monde extérieur. C'est une prise sur soi, et peut-être, si les modèles du dédoublement sont justes, une fenêtre sur davantage encore.</p>
<p>L'oracle de La Boussole Intérieure ne résout pas le mystère. Il donne simplement cette prise sur soi, un instant, dans l'épaisseur retrouvée du présent.</p>`
  },
  {
    ordre: 28,
    subject: `Rudy d'ORADIA - Le geste qui décide`,
    content: `<p>On peut comprendre beaucoup, ressentir beaucoup, et ne rien changer. La lucidité seule ne transforme pas une vie. Il manque toujours le geste.</p>
<p>Dans l'image du pêcheur, tout le patient travail de l'intention et de l'attente ne sert à rien sans le ferrage : ce mouvement net, engagé, au bon moment. Sans lui, la touche se perd, le possible retourne à l'état de possible, et rien ne se concrétise.</p>
<p>Il en va de même pour chacun. Sentir la direction juste ne suffit pas. À un moment, il faut poser l'acte, incarné, réel, qui fait basculer une possibilité dans l'existence. C'est là, et seulement là, que la liberté se prouve.</p>
<p>Et ce geste n'a pas besoin d'être grand. Un mot dit, un pas fait, une porte poussée. Ce qui compte n'est pas l'ampleur, c'est l'engagement réel du corps dans une direction choisie plutôt que subie.</p>
<p>L'oracle de La Boussole Intérieure ne s'arrête pas à la compréhension. Il conduit jusqu'au seuil du geste, et laisse chacun le franchir. Car c'est à chacun, et à chacun seul, de ferrer.</p>`
  },
  {
    ordre: 29,
    subject: `Rudy d'ORADIA - Un oracle ne prédit pas comme on l'imagine`,
    content: `<p>Disons-le clairement, car c'est le cœur de ce que propose ce parcours. L'oracle de La Boussole Intérieure ne fonctionne pas comme une machine à prédire l'avenir de façon mécanique et déterminée.</p>
<p>Ce qu'il fait est plus subtil. Le geste du tirage impose un arrêt. Le souffle se pose, l'attention revient aux sensations, le temps cesse de presser. Dans cet état, ce qui était porté sans le savoir peut enfin remonter : des émotions réelles, des besoins tus, une direction qu'on n'osait pas nommer. Une partie de cette information vient de l'intérieur, remontée depuis le passé et le corps.</p>
<p>Mais si les modèles de Garnier Malet, Guillemant et Leterrier tiennent, une autre partie pourrait venir d'ailleurs : de cette part de la conscience qui, selon eux, explore déjà plusieurs futurs possibles, hors du temps linéaire. L'hexagramme qui se dessine donnerait alors forme à la fois à ce qui était déjà là, sous la surface, et à ce qui a été entrevu plus loin dans le temps.</p>
<p>La justesse d'un tirage ne prouve rien de façon définitive. Mais elle invite à une hypothèse cohérente avec ce que ce parcours a exploré depuis le début : dans le calme retrouvé, ce n'est peut-être pas seulement soi qu'on entend enfin, c'est aussi un signal venu de plus loin dans le temps.</p>
<p>Un oracle ne montre pas l'avenir comme un livre déjà écrit. Il dilate le présent jusqu'à ce qu'un choix, informé par ce qui remonte, y tienne.</p>`
  },
  {
    ordre: 30,
    subject: `Rudy d'ORADIA - Revenir au centre`,
    content: `<p>Voici le terme de ce parcours, et le moment de rassembler ce qui compte, en quelques mots simples à emporter.</p>
<p>Le temps vécu se fabrique dans le corps, et il s'ouvre quand on ralentit. Une partie de ce qu'on prend pour l'avenir est le passé qui parle, une autre partie peut être, si les physiciens du dédoublement ont raison, un signal réel venu d'un futur déjà entrevu. La liberté n'est pas un pouvoir sur le monde, mais un espace intérieur que chacun peut élargir. Et rien ne se transforme sans le geste qui, un jour, engage tout cela dans le réel.</p>
<p>Ce parcours a traversé la conscience, le hasard quantique, la rétrocausalité, le temps, les neurosciences, les biais cognitifs, les intuitions de Jung, et des savoirs empiriques bien plus anciens que toutes ces disciplines réunies. Aucun de ces champs, seul, n'épuise le mystère. Ensemble, ils dessinent une direction : celle d'une conscience plus vaste que ce qu'on croit d'ordinaire, et d'un présent qui mérite toute l'attention qu'on peut lui offrir.</p>
<p>L'oracle de La Boussole Intérieure n'est rien d'autre qu'un rappel. Un objet qui invite, régulièrement, à s'arrêter, à revenir au centre, et à écouter ce qui est déjà su sans le savoir.</p>
<p>Le chemin ne se trouve pas dans l'oracle. Il se trouve à l'intérieur. L'oracle aide seulement à s'en souvenir. Merci d'avoir fait cette route. Elle ne fait que commencer.</p>`
  }
];

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis (ex: node --env-file=.env.local scripts/update-parcours-content-10-30.js).');
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  const results = { updated: [], skippedValidated: [], errors: [] };

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
    if (row.extra?.parcours_valide === true) {
      results.skippedValidated.push({ ordre: u.ordre, subject: row.subject });
      continue;
    }

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
  console.log(`Sautées (déjà validées) : ${results.skippedValidated.length}`);
  results.skippedValidated.forEach(r => console.log(`  = n°${r.ordre} — ${r.subject}`));
  console.log(`Erreurs : ${results.errors.length}`);
  results.errors.forEach(r => console.log(`  ! n°${r.ordre} : ${r.error}`));

  if (results.errors.length > 0) process.exit(1);
}

main().catch(e => {
  console.error('Erreur inattendue :', e.message);
  process.exit(1);
});
