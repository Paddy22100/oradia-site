// scripts/generate-card-pages-en.js
// Génère les pages SEO individuelles anglaises pour les 118 cartes du deck
// (data/tore-deck.json), sous en/cartes/<slug>.html. Usage :
//   node scripts/generate-card-pages-en.js
//
// Miroir de scripts/generate-card-pages.js : mêmes règles (visuel jamais
// servi dans le HTML initial, révélé côté client via js/card-image-gate.js
// après confirmation d'abonnement), mais noms/citations/significations
// traduits en anglais et slugs calculés sur le nom anglais.

const fs = require('fs');
const path = require('path');
const deck = require('../data/tore-deck.json');
const { resolveCardImageUrl } = require('../lib/tore-card-images.js');
const { slugify } = require('../lib/tore-card-slug.js');
const MIRROR_PAIRS = require('./_mirror-pairs.js');
const EN_NAMES = require('./_en-card-names.js');

const FAMILY_LABELS = {
  emotions: 'Emotions', besoins: 'Needs', transmutation: 'Transmutation',
  archetypes: 'Archetypes', revelations: 'Revelations', actions: 'Actions',
  memoire_cosmos: 'Cosmic Memory'
};

const EN_QUOTES = require('./_en-card-quotes.js');


const EN_MEANINGS = {
  JOIE: "In the Oradia Oracle, the Joy card belongs to the Emotions family. It carries a yang polarity, turned toward expansion and momentum rather than withdrawal. Drawing the Joy card generally signals a movement of lightness passing through the present moment, an energy that circulates without effort or calculation. It's a card that accompanies periods when something opens naturally, with no need to force it.",
  TRISTESSE: "The Sadness card belongs to the Emotions family, with a yin polarity turned inward. It doesn't indicate failure, but a downward movement, a moment when something settles and seeks release. Sadness invites you to slow down rather than fight what's withdrawing, while a new clarity forms.",
  AMOUR: "The Love card, Emotions family, yang polarity, indicates an energy that connects and gathers. It signals the presence of an authentic bond, a trust that flows between two people or between yourself and a situation. Drawing this card invites you to recognize what, within the relationship, deserves to be named and welcomed.",
  SOLITUDE: "The Solitude card, Emotions family, yin polarity, evokes a necessary withdrawal rather than an imposed isolation. It marks a time of recentering, away from noise and outside expectations. This card often accompanies a phase of quiet maturation, before a clearer direction takes shape.",
  ÉMERVEILLEMENT: "The Wonder card, Emotions family, yang polarity, opens a crack in the usual way of seeing. It signals the arrival of freshness, a curiosity that perceives the world differently. Drawing this card invites you to let yourself be surprised, without rushing to explain everything.",
  DÉGOÛT: "The Disgust card, Emotions family, yin polarity, indicates a clear rejection of what no longer fits. It isn't there to be suppressed, but to be heard as precise information about a limit that's been reached. This card invites you to distinguish what must be set aside from what can still be transformed.",
  SÉRÉNITÉ: "The Serenity card, Emotions family, yang polarity, evokes a state of balance where the world reflects back without inner noise. It signals a period when tensions ease on their own. Drawing this card invites you to use this stability to observe a situation with more perspective.",
  CONFUSION: "The Confusion card, Emotions family, yin polarity, evokes a moment when the usual landmarks blur. It isn't announcing a mistake, but a stage where several paths still coexist without a clear hierarchy. This card invites you not to force a decision until the fog has lifted.",
  COLÈRE: "The Anger card, Emotions family, yang polarity, indicates an energy seeking to free itself from a constraint. It signals a boundary that has been crossed and needs to be acknowledged. Drawing this card invites you to use this force to assert a limit rather than simply endure it.",
  IMPUISSANCE: "The Powerlessness card, Emotions family, yin polarity, evokes a moment when action seems suspended. It doesn't signal a lack of worth, but a passage where strength hasn't yet found its way. This card invites you to wait without judging yourself, until movement becomes possible again.",
  COURAGE: "The Courage card, Emotions family, yang polarity, indicates a step taken despite uncertainty. It signals an ability to move forward without waiting for every fear to disappear. Drawing this card invites you to take one precise step, even modestly.",
  PEUR: "The Fear card, Emotions family, yin polarity, evokes a movement that freezes before the unknown. It isn't there to be ignored, but to point to an area that calls for caution or preparation. This card invites you to identify precisely what's worrying you, rather than leaving it vague.",
  CONFIANCE: "The Trust card, Emotions family, yang polarity, evokes a stable anchoring, like a tree rooted toward the light. It signals a period when you can lean on your own resources or on a reliable bond. Drawing this card invites you to act from that foundation rather than from doubt.",
  HONTE: "The Shame card, Emotions family, yin polarity, evokes a movement of retreat, a face turning away. It signals a wound tied to how others see you, or how you see yourself, which needs to be acknowledged without further judgment. This card invites a gentle welcome for what's been hidden.",
  FIERTÉ: "The Pride card, Emotions family, yang polarity, indicates a stability earned through a real passage. It signals that a past trial continues to support you today. Drawing this card invites you to recognize this path traveled, without false modesty.",
  CULPABILITÉ: "The Guilt card, Emotions family, yin polarity, evokes a heaviness born of a gesture judged ill-fitted. It doesn't call for punishment, but for possible repair, when that's still useful. This card invites you to distinguish real responsibility from the extra weight you place on yourself.",
  IMPATIENCE: "The Impatience card, Emotions family, yang polarity, evokes an energy pawing the ground before the moment has come. It signals a strong desire to move forward, sometimes faster than the situation allows. Drawing this card invites you to channel that momentum rather than hold it back entirely.",
  PATIENCE: "The Patience card, Emotions family, yin polarity, evokes a ripening that happens in the shade, without haste. It signals that a result is forming but not yet visible. This card invites you to trust the time it needs rather than force a premature conclusion.",

  RECONNAISSANCE: "The Recognition card, Needs family, yang polarity, evokes a need to be seen and validated for what you bring. It signals that a part of you is waiting to be named by an outside gaze. Drawing this card invites you to identify exactly where this need is playing out right now.",
  SÉCURITÉ: "The Security card, Needs family, yin polarity, evokes a need for stability, a home to rest in. It signals the importance of consolidating a foundation before moving further. This card invites you to check what, concretely, would help you feel more secure.",
  LIBERTÉ: "The Freedom card, Needs family, yang polarity, evokes a need for movement, for invisible fences to come down. It signals a longing to decide for yourself, without excessive outside constraint. Drawing this card invites you to pinpoint exactly what's limiting that space today.",
  SOUTIEN: "The Support card, Needs family, yin polarity, evokes a need for backing, two forces joining to hold together. It signals that a situation would benefit from not being carried alone. This card invites you to identify who, or what, could offer real support right now.",
  REPOS: "The Rest card, Needs family, yin polarity, evokes a need to slow down, a body setting itself down. It signals that a pause isn't a luxury but a necessity for what comes next. Drawing this card invites you to allow yourself real, unhurried time to do nothing.",
  CLARTÉ: "The Clarity card, Needs family, yang polarity, evokes a need to see clearly, a sun breaking through the mist. It signals that a confusing situation would benefit from being simply reframed. This card invites you to ask the precise question that's still missing.",
  APPARTENANCE: "The Belonging card, Needs family, yin polarity, evokes a need to be part of a circle that welcomes you. It signals the importance of a group bond, whether family or chosen. Drawing this card invites you to notice where this need is showing up, or where it's already fulfilled without being acknowledged.",
  AUTONOMIE: "The Autonomy card, Needs family, yang polarity, evokes a need to move forward without waiting for outside approval. It signals a capacity, sometimes underused, to decide for yourself. This card invites you to identify one step you can take alone, starting now.",
  STIMULATION: "The Stimulation card, Needs family, yang polarity, evokes a need for a spark, for novelty that reignites momentum. It signals that a routine might need something to bring it back to life. Drawing this card invites you to look for what, concretely, would restore that momentum.",
  HARMONIE: "The Harmony card, Needs family, yin polarity, evokes a need for accord, like strings tuned just right. It signals the importance of bringing several elements into agreement rather than forcing just one. This card invites you to seek adjustment rather than a compromise you simply endure.",
  'AMOUR REÇU': "The Love Received card, Needs family, yang polarity, evokes a need to be touched by another's gentleness. It signals the importance of letting yourself receive, not only give. Drawing this card invites you to check whether this movement of receiving is truly allowed right now.",
  'LE SENS': "The Meaning card, Needs family, yin polarity, evokes a need for direction, a lantern lighting the path. It signals a search for coherence between what you do and what you truly want to live. This card invites you to put into words what would give meaning to your current situation.",
  PROTECTION: "The Protection card, Needs family, yin polarity, evokes a need for shelter, a cloak covering you with warmth. It signals that a fragile part of you deserves to be sheltered for now. Drawing this card invites you to identify what needs protecting, without shutting yourself away.",
  EXPANSION: "The Expansion card, Needs family, yang polarity, evokes a need to widen the horizon, to move beyond known limits. It signals a longing to grow, in a project, a relationship, or a way of thinking. This card invites you to pinpoint the exact direction this expansion is seeking to take.",
  INTIMITÉ: "The Intimacy card, Needs family, yin polarity, evokes a need for a protected space to set down what is secret. It signals the importance of a bond safe enough to be truly open in. Drawing this card invites you to identify where this need for real closeness is being felt.",
  CRÉATIVITÉ: "The Creativity card, Needs family, yang polarity, evokes a need to shape a new form out of a spark. It signals an energy seeking concrete expression. This card invites you to give shape, even a modest one, to what's seeking to be born.",
  AUTHENTICITÉ: "The Authenticity card, Needs family, yin polarity, evokes a need to drop the mask so the real face can remain. It signals a longing to be seen as you truly are, without adjusting the surface. Drawing this card invites you to identify where a mask could be set down today.",
  GUIDANCE: "The Guidance card, Needs family, yang polarity, evokes a need for a point of reference, a star shining above the path. It signals the usefulness of seeking outside support to shed light on a decision. This card invites you to identify what form of guidance would be truest right now.",

  ACCEPTATION: "The Acceptance card, Transmutation family, yin polarity, evokes a stone letting itself be shaped by the river rather than resisting it. It signals a shift where you stop fighting what's already there. Drawing this card invites you to distinguish what can still be changed from what simply asks to be acknowledged.",
  TRANSFORMATION: "The Transformation card, Transmutation family, yang polarity, evokes wood burning and becoming flame. It signals a change of nature, not merely of appearance. This card invites you to welcome what this passage requires you to leave behind.",
  'LÂCHER-PRISE': "The Letting Go card, Transmutation family, yin polarity, evokes a leaf falling and nourishing the earth. It signals the moment to stop controlling what no longer depends on you. Drawing this card invites you to identify precisely what needs to be released.",
  LIBÉRATION: "The Liberation card, Transmutation family, yang polarity, evokes a dam giving way, letting life flow again. It signals the end of a constraint that had been weighing on you for a while. This card invites you to notice what becomes possible again once the obstacle lifts.",
  PARDON: "The Forgiveness card, Transmutation family, yin polarity, evokes broken chains now rusting on the ground. It signals a movement of release, toward yourself or toward another. Drawing this card invites you to measure what this gesture frees, without any obligation to excuse everything.",
  ALIGNEMENT: "The Alignment card, Transmutation family, yang polarity, evokes stars gathering along a shared axis. It signals a coherence regained between several parts of yourself or of a project. This card invites you to identify what, once aligned, would make the movement flow more easily.",
  DÉTACHEMENT: "The Detachment card, Transmutation family, yin polarity, evokes a bird rising without clinging to the branches. It signals the possibility of gaining distance without breaking the bond. Drawing this card invites you to observe a situation from a little higher up.",
  PURIFICATION: "The Purification card, Transmutation family, yang polarity, evokes clear water passing through rock. It signals a cleansing process, inner or concrete, still underway. This card invites you to let this movement continue without rushing it.",
  ANCRAGE: "The Grounding card, Transmutation family, yin polarity, evokes roots sinking into fertile soil. It signals a need for stability before going further. Drawing this card invites you to identify what, concretely, could serve as a solid support right now.",
  OUVERTURE: "The Opening card, Transmutation family, yang polarity, evokes a door easing open, letting light through. It signals the possibility of a passage that wasn't visible before. This card invites you to notice what, quietly, is already beginning to open.",
  FLUIDITÉ: "The Fluidity card, Transmutation family, yin polarity, evokes a river flowing around an obstacle without effort. It signals the possibility of adapting rather than forcing a way through. Drawing this card invites you to look for the path around rather than a direct confrontation.",
  CLARIFICATION: "The Clarification card, Transmutation family, yang polarity, evokes what matters appearing in light regained. It signals that a sorting process is underway between what counts and what's just clutter. This card invites you to name what's finally becoming clear.",
  'PRISON MENTALE': "The Mental Prison card, Transmutation family, yin polarity, evokes a thought spinning and closing in the horizon. It signals a repetitive pattern limiting the range of possibilities you can perceive. Drawing this card invites you to identify the exact thought maintaining this closure.",
  'ESPRIT LIBRE': "The Free Spirit card, Transmutation family, yang polarity, evokes a passage opening, letting inner light flow freely. It signals a release of the mind, a thought regaining space. This card invites you to observe what becomes possible once this freedom is regained.",
  VIDE: "The Emptiness card, Transmutation family, yin polarity, evokes an empty cup waiting to be filled. It signals a space not yet occupied, rather than a permanent lack. Drawing this card invites you to welcome this vacancy without rushing to fill it.",
  PLÉNITUDE: "The Fullness card, Transmutation family, yang polarity, evokes a vase overflowing with honey and offerings. It signals a moment of felt abundance, material or inner. This card invites you to fully recognize what's already present.",
  INCARNATION: "The Incarnation card, Transmutation family, yin polarity, evokes a step touching the heavy earth. It signals a need to make concrete what still remains at the stage of an idea. Drawing this card invites you to identify the first real gesture that would ground this movement.",
  TRANSCENDANCE: "The Transcendence card, Transmutation family, yang polarity, evokes a road lighting up differently when seen from above. It signals the possibility of gaining perspective on a situation that seemed stuck. This card invites you to seek that wider vantage point.",

  "L'ALCHIMISTE": "The Alchemist, an archetype of yin polarity, evokes lead dreaming of becoming gold. It embodies the capacity to transform raw material, a trial, or a limitation, into something precious. Drawing this card invites you to notice what, in a difficult situation, might already be beginning to transmute.",
  'LE BÂTISSEUR': "The Builder, an archetype of yang polarity, evokes a structure rising when the gesture is clear. It embodies the capacity to give a lasting form to an intention. This card invites you to identify the next concrete stone to lay.",
  'LA PRÊTRESSE': "The Priestess, an archetype of yin polarity, evokes a veil lifting within the inner space. She embodies access to a sensitive knowing, more intuitive than rational. Drawing this card invites you to trust what you perceive even before you can explain it.",
  'LE VOYAGEUR': "The Traveler, an archetype of yang polarity, evokes every step transforming the one who walks. It embodies movement as an engine of personal transformation. This card invites you to consider a journey, real or symbolic, as part of the path itself.",
  'LE NOMADE': "The Nomad, an archetype of yang polarity, evokes a step that holds steady even as the horizon recedes. It embodies a capacity to remain yourself through constant change. Drawing this card invites you to identify what, within you, stays reliable whatever the context.",
  'LE RÊVEUR': "The Dreamer, an archetype of yin polarity, evokes a closed eye seeing what the world leaves unspoken. It embodies access to imagination as a source of information in its own right. This card invites you to take seriously a recurring intuition or inner image.",
  'LE VISIONNAIRE': "The Visionary, an archetype of yang polarity, evokes a gaze piercing the ages yet to come. It embodies the capacity to anticipate a direction before it becomes visible to others. Drawing this card invites you to put into clear words the intuition of the future taking shape.",
  'LA TISSEUSE': "The Weaver, an archetype of yin polarity, evokes a thread reconnecting what life has separated. She embodies the capacity to mend scattered bonds or meanings. This card invites you to notice what, right now, is seeking to be reconnected.",
  'LE GUERRIER': "The Warrior, an archetype of yang polarity, evokes a heart striking with integrity. It embodies a force engaged in service of a clear cause, without gratuitous aggression. Drawing this card invites you to identify the fight that truly deserves to be fought.",
  'LE SAGE': "The Sage, an archetype of yin polarity, evokes a silence that teaches more than a thousand words. It embodies a form of stepping back that lets the situation clarify itself. This card invites you to observe before acting, or simply to choose not to say anything for now.",
  'LE MAGE': "The Magician, an archetype of yang polarity, evokes the unseen answering the one who knows how to listen. It embodies a capacity to act on what isn't directly visible. Drawing this card invites you to consider a less obvious dimension of the situation.",
  "L'ENFANT": "The Child, an archetype of yin polarity, evokes a first step moving forward with no memory of the path. It embodies a capacity to begin again without the weight of past experience. This card invites you to recover a form of spontaneity, even in a serious context.",
  'LE JUSTE': "The Just One, an archetype of yang polarity, evokes a hand deciding in peace and restoring balance. It embodies a decision made with clarity rather than reaction. Drawing this card invites you to seek the most balanced position, not necessarily the most comfortable one.",
  'LE VEILLEUR': "The Watcher, an archetype of yin polarity, evokes an awareness that does not flee from what disturbs. It embodies a calm vigilance, attentive to what's playing out in the background. This card invites you to face directly something you might be avoiding.",
  'LE PASSEUR': "The Ferryman, an archetype of yang polarity, evokes one who crosses over and connects without lingering. It embodies a capacity to accompany a change without holding onto it. Drawing this card invites you to consider your own role in a transition underway.",
  'LE PORTEUR': "The Bearer, an archetype of yin polarity, evokes one who upholds what must grow and gives it solid support. It embodies a stable presence in service of a project or a person. This card invites you to identify what you're currently carrying, and whether that weight still feels right.",
  "L'INITIATEUR": "The Initiator, an archetype of yang polarity, evokes a gesture opening an irreversible threshold. It embodies the precise moment when something truly begins. Drawing this card invites you to identify that first step which commits you to what follows.",
  "L'OBSERVATEUR": "The Observer, an archetype of yin polarity, evokes a stepping back that reveals what agitation conceals. It embodies the value of gaining distance before concluding anything. This card invites you to watch a situation without intervening just yet.",

  CLÉ: "The Key card, Revelations family, yang polarity, evokes a hidden object opening a secret chamber. It signals the existence of a precise element capable of unlocking a situation. Drawing this card invites you to look for that often discreet detail that changes the whole reading.",
  PORTE: "The Door card, Revelations family, yin polarity, evokes an opening taking shape within a wall. It signals a possible passage where you only saw an obstacle. This card invites you to notice that opening, even a partial one.",
  MESSAGE: "The Message card, Revelations family, yang polarity, evokes a murmur rising, carrying a meaning to be heard. It signals that important information is already circulating, sometimes in a discreet form. Drawing this card invites you to pay attention to what's just been said or noticed recently.",
  SYNCHRONICITÉ: "The Synchronicity card, Revelations family, yin polarity, evokes two moments touching and revealing meaning. It signals the value of a coincidence which, taken seriously, sheds light on a situation. This card invites you to note the connections that seem too precise to be trivial.",
  SIGNE: "The Sign card, Revelations family, yin polarity, evokes a modest clue catching the attentive eye. It signals that a seemingly minor detail deserves consideration. Drawing this card invites you to go back to something you may have dismissed too quickly.",
  VISION: "The Vision card, Revelations family, yang polarity, evokes an eye seeing beyond the usual veils. It signals a capacity to see further than the immediate situation. This card invites you to put into words what you perceive, even before you can fully name it.",
  PRÉSAGE: "The Omen card, Revelations family, yin polarity, evokes a breath of the future already passing through the present. It signals that a trend is taking shape before it's even confirmed. Drawing this card invites you to observe the first signs of a change underway.",
  ÉVEIL: "The Awakening card, Revelations family, yang polarity, evokes an awareness opening and lighting everything differently. It signals a realization that changes how an entire situation reads. This card invites you to welcome what you've just understood, even if it shifts certainties.",
  LUMIÈRE: "The Light card, Revelations family, yang polarity, evokes a ray splitting the shadow. It signals a clarity arriving, sometimes suddenly, on a point that had stayed blurred. Drawing this card invites you to welcome this clarity without trying to minimize it.",
  DÉVOILEMENT: "The Unveiling card, Revelations family, yin polarity, evokes a curtain parting to let the scene appear. It signals that information or a truth is about to, or has just, come to light. This card invites you to prepare to see a situation as it really is.",
  VÉRITÉ: "The Truth card, Revelations family, yang polarity, evokes a veil falling, letting the essence appear. It signals the moment to name things as they are, without detour. Drawing this card invites you to identify what needs to be said clearly.",
  ILLUSION: "The Illusion card, Revelations family, yin polarity, evokes an image that deceives and captivates. It signals the possible presence of a misunderstanding or a projection worth checking. This card invites you to distinguish what's actually observed from what's merely assumed.",
  ÉTINCELLE: "The Spark card, Revelations family, yang polarity, evokes fire born from a speck of stone. It signals the very beginning of an idea or a project, still fragile but real. Drawing this card invites you to protect this beginning rather than judge it too soon.",
  SILENCE: "The Silence card, Revelations family, yin polarity, evokes an absence of noise revealing what matters. It signals the value of a pause before responding or concluding. This card invites you to let a gap stay open, rather than filling it right away.",
  CHIFFRE: "The Number card, Revelations family, yang polarity, evokes a figure ordering a hidden universe. It signals the presence of a structure or a regularity behind what seemed scattered. Drawing this card invites you to look for the underlying logic of a situation.",
  SYMBOLE: "The Symbol card, Revelations family, yin polarity, evokes a silent image speaking to the heart. It signals that a representation, a dream, or an object carries a meaning to decode. This card invites you to linger on what keeps returning as an image rather than a word.",
  ORIGINE: "The Origin card, Revelations family, yin polarity, evokes a source flowing upstream of everything. It signals the value of tracing a situation back to its root rather than treating its effects. Drawing this card invites you to ask where what's happening today really comes from.",
  DESTIN: "The Destiny card, Revelations family, yang polarity, evokes an arrow flying toward its target. It signals a trajectory that already seems underway, with its own direction. This card invites you to recognize this movement rather than try to control it entirely.",

  AGIR: "The Act card, Actions family, yang polarity, evokes a seed growing as it breaks through the soil. It signals that the time has come to move from project to concrete gesture. Drawing this card invites you to identify the first possible action, even a minimal one.",
  ÉCOUTER: "The Listen card, Actions family, yin polarity, evokes an ear leaning in toward a murmur. It signals the usefulness of receiving before responding. This card invites you to let the other person, or the situation, speak a little longer.",
  DIRE: "The Speak card, Actions family, yang polarity, evokes a word cutting through like a clear breath. It signals the moment to express what had stayed unsaid. Drawing this card invites you to simply put into words what's becoming necessary to say.",
  RECEVOIR: "The Receive card, Actions family, yin polarity, evokes an open heart welcoming a gift. It signals a capacity, sometimes forgotten, to let in what's being offered. This card invites you to check whether you're truly allowing yourself to receive right now.",
  CRÉER: "The Create card, Actions family, yang polarity, evokes a gesture shaping what didn't exist before. It signals an energy available to give birth to something concrete. Drawing this card invites you to move into making rather than staying in the idea.",
  ACCUEILLIR: "The Welcome card, Actions family, yin polarity, evokes a door opening to the unexpected. It signals a willingness to let in what wasn't planned. This card invites you not to close too quickly a door that has just opened.",
  PARTAGER: "The Share card, Actions family, yang polarity, evokes a cup passing from hand to hand. It signals the value of circulating what you hold, a resource, an idea, an experience. Drawing this card invites you to identify what would benefit from being passed on rather than kept.",
  PROTÉGER: "The Protect card, Actions family, yin polarity, evokes shelter rising around what's fragile. It signals the need to set something apart, while it consolidates. This card invites you to identify what needs to be made safe right now.",
  'ALLER VERS': "The Move Toward card, Actions family, yang polarity, evokes a step seeking an encounter. It signals the usefulness of making the first move rather than waiting. Drawing this card invites you to identify toward whom, or toward what, this step might be directed.",
  'SE RETIRER': "The Withdraw card, Actions family, yin polarity, evokes the wise one leaving the crowd. It signals the value of gaining distance rather than staying in the agitation. This card invites you to allow yourself a withdrawal, even a temporary one.",
  CHOISIR: "The Choose card, Actions family, yang polarity, evokes a crossroads calling for a decision. It signals that a situation can no longer stay suspended indefinitely. Drawing this card invites you to name the real options before deciding.",
  PATIENTER: "The Wait card, Actions family, yin polarity, evokes a fruit ripening slowly. It signals that the right action here is to not act just yet. This card invites you to observe what still needs time.",
  EXPRIMER: "The Express card, Actions family, yang polarity, evokes what you carry taking shape in clear words. It signals the moment to translate an inner feeling into communicable words. Drawing this card invites you to look for the right words for what, until now, stayed inside.",
  OBSERVER: "The Observe card, Actions family, yin polarity, evokes an eye contemplating without acting. It signals the value of simply looking at a situation before intervening. This card invites you to suspend action for a moment of close attention.",
  ORDONNER: "The Order card, Actions family, yang polarity, evokes a hand tracing the alignment of stones. It signals a need to bring structure to what's scattered. Drawing this card invites you to concretely organize one or two disordered elements.",
  RÉCONCILIER: "The Reconcile card, Actions family, yin polarity, evokes hands coming together again after discord. It signals the possibility of mending a damaged bond. This card invites you to identify the gesture, even a modest one, that could start bringing you closer.",
  MANIFESTER: "The Manifest card, Actions family, yang polarity, evokes a word becoming flesh. It signals the passage from an intention to a concrete, visible reality. Drawing this card invites you to observe exactly what's currently taking material form.",
  ARRÊTER: "The Stop card, Actions family, yin polarity, evokes a step coming to a halt, the dust settling. It signals the need to end a movement that no longer serves you. This card invites you to recognize what it's time to stop.",

  'LE TORE': "The Torus card, Cosmic Memory family, connects shadow and light; from its center pulses the eternal dance of cycles. It places the draw within a wider perspective than the present situation alone, that of the cyclical movements running through a life. Drawing this card invites you to consider where you stand within a larger cycle.",
  'MÉMOIRE CELLULAIRE': "The Cellular Memory card, Cosmic Memory family, evokes a body holding the trace of the living, a library where nothing is lost. It signals that some physical or old piece of information could shed light on the current situation. This card invites you to listen to what the body indicates, beyond the mind.",
  'MÉMOIRE COLLECTIVE': "The Collective Memory card, Cosmic Memory family, evokes a group dreaming through the individual, a shared awareness weaving a common world. It signals that a dynamic larger than the personal sphere may be at play. Drawing this card invites you to place a situation within its family, social, or cultural context.",
  'ARCHIVE DU VIVANT': "The Archive of the Living card, Cosmic Memory family, evokes roots extending a story larger than the individual. It signals an inheritance, received and to be passed on, that goes beyond your own personal path. This card invites you to consider what you carry from a wider lineage.",
  "SOUVENIR D'ÂME": "The Soul Memory card, Cosmic Memory family, evokes ancient resonances surfacing without warning, seeking less to explain than to reveal. It signals that a deep echo, hard to place precisely, is running through the situation. Drawing this card invites you to welcome this resonance without demanding an immediate explanation for it.",
  'LE SOUFFLE DU VIVANT': "The Breath of Life card, Cosmic Memory family, evokes a secret breath moving through the world, within whose rhythm the impulse of life is born. It signals a force animating the situation, larger than personal will alone. This card invites you to connect with this movement rather than try to control everything.",
  'TEMPS INTÉRIEUR': "The Inner Time card, Cosmic Memory family, evokes a silent instant where everything converges, opening the door to deeper rhythms. It signals an inner temporality different from the outside calendar. Drawing this card invites you to honor your own rhythm rather than one imposed from outside.",
  'LIGNES DE VIE': "The Lifelines card, Cosmic Memory family, evokes a seed silently carrying multiple paths, each choice tracing a direction waiting to be lived. It signals the existence of several possible trajectories from the same starting point. This card invites you to consider the options still open, without fixing on just one.",
  'POINT ZÉRO': "The Zero Point card, Cosmic Memory family, evokes a center where everything hangs suspended in a dense silence, where the birth of a new world takes shape. It signals a turning point, a starting point rather than an ending. Drawing this card invites you to recognize this beginning, even if it hasn't yet taken visible form.",
  'TISSAGE COSMIQUE': "The Cosmic Weaving card, Cosmic Memory family, evokes invisible threads searching for each other in the shadows, revealing in their meeting a secret coherence. It signals that seemingly separate elements might form a more coherent whole than it appears. This card invites you to look for the hidden link between two things that seemed unrelated."
};

function toRelativeImagePath(absoluteUrl) {
  if (!absoluteUrl) return null;
  return absoluteUrl.replace(/^https:\/\/oradia\.fr/, '');
}

const CARTES_DIR = path.join(__dirname, '..', 'en', 'cartes');
if (!fs.existsSync(CARTES_DIR)) fs.mkdirSync(CARTES_DIR, { recursive: true });

function buildPage({ frName, enName, familyLabel, polarity, quote, meaning, mirrorFrName, slug, imageUrl }) {
  const polarityLabel = polarity === 'yang' ? 'Yang' : 'Yin';
  const displayName = enName;
  const mirrorSlug = mirrorFrName ? slugify(EN_NAMES[mirrorFrName]) : null;
  const mirrorDisplay = mirrorFrName ? EN_NAMES[mirrorFrName] : null;

  const mirrorBlock = mirrorFrName ? `
    <div class="mirror-link">
      <p>Mirror card</p>
      <a href="/en/cartes/${mirrorSlug}.html">${mirrorDisplay} &rarr;</a>
    </div>` : '';

  const mirrorSentence = mirrorFrName
    ? `In Oradia's mirror-card system, ${displayName} answers to <a href="/en/cartes/${mirrorSlug}.html" style="color:#d4af37;border-bottom:1px solid rgba(212,175,55,0.3);">${mirrorDisplay}</a>: the two don't oppose each other, they answer each other, like two sides of the same movement.`
    : `This card belongs to the ten Cosmic Memory cards, a family with no mirror card, which brings a wider perspective (time, memory, cycles) when the draw calls for it.`;

  const imgAlt = `${displayName} card, ${familyLabel} family, Oracle Oradia`;
  const cardVisualAttrs = imageUrl
    ? ` id="card-visual" data-image="${imageUrl}" data-alt="${imgAlt.replace(/"/g, '&quot;')}"`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${displayName} Card &middot; Meaning | Oracle Oradia</title>
  <meta name="description" content="What does the ${displayName} card mean in the Oradia Oracle? ${familyLabel} family, ${polarityLabel} polarity. Discover its meaning and draw it for free.">
  <link rel="canonical" href="https://oradia.fr/en/cartes/${slug}.html">
  <link rel="alternate" hreflang="fr" href="https://oradia.fr/cartes/${slugify(frName)}.html">
  <link rel="alternate" hreflang="en" href="https://oradia.fr/en/cartes/${slug}.html">
  <link rel="alternate" hreflang="x-default" href="https://oradia.fr/cartes/${slugify(frName)}.html">
  <meta property="og:type" content="article">
  <meta property="og:url" content="https://oradia.fr/en/cartes/${slug}.html">
  <meta property="og:title" content="${displayName} Card &middot; Meaning | Oracle Oradia">
  <meta property="og:description" content="${familyLabel} family, ${polarityLabel} polarity.">
  <meta property="og:image" content="https://oradia.fr/images/medias/apercu_stripe.jpg">
  <meta property="og:site_name" content="Oradia">
  <meta property="og:locale" content="en_US">
  <meta name="author" content="Rudy Boucheron">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "${displayName} Card \\u00b7 Meaning | Oracle Oradia",
    "description": "${familyLabel} family, ${polarityLabel} polarity.",
    "author": { "@type": "Person", "name": "Rudy Boucheron", "url": "https://oradia.fr/en/a-propos.html" },
    "publisher": { "@type": "Organization", "name": "Oradia", "url": "https://oradia.fr" },
    "datePublished": "2026-09-16",
    "dateModified": "2026-09-16",
    "url": "https://oradia.fr/en/cartes/${slug}.html",
    "inLanguage": "en"
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
    <a href="/en/cartes.html" class="back-link">&larr; All cards</a>

    <div class="card-visual"${cardVisualAttrs}>
      <div class="card-locked">
        <span class="lock-icon">&#128274;</span>
        <p>Visual reserved for subscribers</p>
        <a href="/member/login.html">Log in</a>
      </div>
    </div>
    <p class="card-meta">${familyLabel} family &middot; ${polarityLabel} polarity</p>
    <h1>${displayName} Card</h1>
    <p class="quote">&laquo;&nbsp;${quote}&nbsp;&raquo;</p>

    <div class="article-body">
      <p>${meaning}</p>
      <p>${mirrorSentence}</p>
      <p>This page gives the card's general meaning. In a real draw, the ${displayName} card is always read in relation to the other cards drawn and the intention set at the start &mdash; it's that combined reading, unique to each draw, that the online oracle develops.</p>
    </div>

    <div class="cta-block">
      <p>Curious what cards the oracle reveals for your own question?</p>
      <a href="/tore.html" class="cta-btn">Do a free draw</a>
      <a href="https://oradia.fr/precommande-oracle.html" class="cta-btn secondary">Discover the physical oracle</a>
    </div>
${mirrorBlock}
  </main>

  <div id="footer-placeholder"></div>
  <script src="/components/header-manager-en.js" defer><\/script>
  <script src="/components/footer-manager-en.js" defer><\/script>
  <script src="/js/page-tracker.js" defer><\/script>
  <script src="/js/card-image-gate.js" defer><\/script>
</body>
</html>
`;
}

let created = 0, missing = [];

Object.keys(deck).forEach(familyKey => {
  const familyLabel = FAMILY_LABELS[familyKey] || familyKey;
  deck[familyKey].forEach(card => {
    const frName = card.name;
    const enName = EN_NAMES[frName];
    const meaning = EN_MEANINGS[frName];
    const quote = EN_QUOTES[frName];
    if (!enName || !meaning || !quote) { missing.push(frName); return; }

    const slug = slugify(enName);
    const imageUrl = toRelativeImagePath(resolveCardImageUrl(frName));
    const mirrorFrName = MIRROR_PAIRS[frName] || null;

    const html = buildPage({
      frName, enName, familyLabel, polarity: card.polarity, quote, meaning,
      mirrorFrName, slug, imageUrl
    });

    fs.writeFileSync(path.join(CARTES_DIR, `${slug}.html`), html, 'utf8');
    created++;
  });
});

console.log(`Créées: ${created}`);
if (missing.length) console.log('Traductions manquantes pour:', missing.join(', '));
