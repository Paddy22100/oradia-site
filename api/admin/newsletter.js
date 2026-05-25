// api/admin/newsletter.js
// Route unifiée newsletter — remplace les 5 fichiers séparés pour rester dans la limite Vercel Hobby (12 fonctions)
// Usage : /api/admin/newsletter?action=generate|ideas|save|send|drafts

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import { parse as parseCookie } from 'cookie';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Auth (cookie JWT — même mécanisme que _auth.js) ───────────────────────────
function checkAuth(req, res) {
  try {
    const cookies = parseCookie(req.headers.cookie || '');
    const token = cookies.oradia_admin_session;
    if (!token) { res.status(401).json({ error: 'Non autorisé' }); return false; }
    const decoded = jwt.verify(token, process.env.ADMIN_SESSION_SECRET);
    if (decoded.type !== 'admin') { res.status(401).json({ error: 'Non autorisé' }); return false; }
    return true;
  } catch (e) {
    res.status(401).json({ error: 'Non autorisé' });
    return false;
  }
}

// ── textToHtml (pour l'envoi Brevo) ──────────────────────────────────────────
function textToHtml(text) {
  // Séparer objet et corps sur le séparateur ---
  const parts = text.split(/\n---\n/);
  let bodyText = parts.length >= 2 ? parts.slice(1).join('\n---\n') : text;
  
  // Supprimer les tirés au début du corps
  bodyText = bodyText.replace(/^[\s\n]*-{3,}[\s\n]*/, '');

  // Citation tirée des livres — extraite si ligne entre guillemets (« » ou " ")
  let citation = '';
  const citationMatch = bodyText.match(/[«""]([^»""]{40,200})[»""]/);
  if (citationMatch) citation = citationMatch[1];

  const lines = bodyText.split('\n');
  let bodyHtml = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { bodyHtml += '<tr><td style="padding:5px 0;"></td></tr>'; continue; }
    // Séparateurs --- (ignorés dans le corps, déjà utilisés pour split)
    if (/^-{3,}$/.test(trimmed)) continue;
    // Lien → oradia.fr
    if (trimmed.startsWith('→')) {
      bodyHtml += `<tr><td style="padding:24px 0 8px 0;text-align:left;">
        <a href="https://oradia.fr" style="color:#d4af37;font-family:'Cormorant Garamond',Georgia,serif;font-size:15px;font-style:italic;text-decoration:none;border-bottom:1px solid rgba(212,175,55,0.35);padding-bottom:2px;">${trimmed}</a>
      </td></tr>`;
      continue;
    }
    // Ligne "Rudy" seule = signature — on l'ignore, gérée dans le footer
    if (/^Rudy\s*$/.test(trimmed)) continue;
    // Ligne contenant la citation entre guillemets — déjà affichée dans citationHtml, on l'ignore ici
    if (citation && trimmed.includes(citation.substring(0, 20))) continue;
    // Paragraphe normal
    bodyHtml += `<tr><td style="padding:7px 0;">
      <p style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-size:17px;line-height:1.85;color:#ddd5c0;font-weight:300;">${trimmed}</p>
    </td></tr>`;
  }

  // Bloc citation à insérer avant la signature
  const citationHtml = citation ? `
          <!-- Citation -->
          <tr>
            <td style="padding:8px 48px 36px 48px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding:24px 28px;border-left:2px solid rgba(212,175,55,0.5);background:rgba(212,175,55,0.04);">
                    <p style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-size:16px;line-height:1.9;color:#c9b87a;font-style:italic;">${citation}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>` : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;0,700;1,300;1,400;1,600&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:#040e1e;">

  <!--[if mso]><table role="presentation" width="100%"><tr><td><![endif]-->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
    style="background:#040e1e;margin:0;padding:0;min-height:100%;">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <!-- Wrapper max 600px -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
          style="max-width:600px;position:relative;">

          <!-- IMAGE DE FOND en cellule répétée sur tout le mail -->
          <tr>
            <td style="padding:0;">

              <!-- Carte principale avec fond image -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                style="background-color:#051428;background-image:url('https://oradia.fr/images/oradia-hero-ak.png');background-size:cover;background-position:center top;background-repeat:no-repeat;border:1px solid rgba(212,175,55,0.25);box-shadow:0 12px 48px rgba(0,0,0,0.6);">

                <!-- Overlay sombre pour lisibilité -->
                <tr>
                  <td style="padding:0;background:rgba(4,14,30,0.82);">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">

                      <!-- HEADER : Logo + titre -->
                      <tr>
                        <td align="center" style="padding:40px 40px 0 40px;">
                          <!-- Logo rond -->
                          <img src="https://oradia.fr/images/logo-hd-v2.jpeg" alt="ORADIA" width="64" height="64"
                            style="display:block;width:64px;height:64px;border-radius:50%;border:1.5px solid rgba(212,175,55,0.4);margin:0 auto 20px auto;object-fit:cover;">
                          <!-- Surtitre -->
                          <p style="margin:0 0 8px 0;font-family:'Cormorant Garamond',Georgia,serif;font-size:11px;letter-spacing:5px;color:#d4af37;text-transform:uppercase;font-weight:400;">La Boussole Intérieure</p>
                          <!-- Titre principal -->
                          <h1 style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;font-weight:300;color:#f5e7a1;letter-spacing:1px;line-height:1.3;">La newsletter Oradia</h1>
                          <!-- Filet doré -->
                          <div style="width:48px;height:1px;background:linear-gradient(90deg,transparent,#d4af37,transparent);margin:20px auto 0;"></div>
                        </td>
                      </tr>

                      <!-- Espace -->
                      <tr><td style="padding:8px 0;"></td></tr>

                      <!-- BANDEAU PRÉ-VENTE -->
                      <tr>
                        <td style="padding:0 32px 24px 32px;">
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                            style="background:linear-gradient(135deg,rgba(212,175,55,0.12) 0%,rgba(212,175,55,0.05) 100%);border:1px solid rgba(212,175,55,0.3);border-radius:4px;overflow:hidden;">
                            <tr>
                              <td style="padding:18px 20px;vertical-align:middle;width:60%;">
                                <p style="margin:0 0 4px 0;font-family:'Cormorant Garamond',Georgia,serif;font-size:10px;letter-spacing:4px;color:#d4af37;text-transform:uppercase;">Disponible en pré-vente</p>
                                <p style="margin:0 0 10px 0;font-family:'Cormorant Garamond',Georgia,serif;font-size:19px;font-weight:600;color:#f5e7a1;line-height:1.3;">L'Oracle Oradia</p>
                                <p style="margin:0 0 14px 0;font-family:'Cormorant Garamond',Georgia,serif;font-size:13px;color:rgba(212,175,55,0.7);line-height:1.6;">Un outil de révélation intérieure. Cartes, livrets, tirage guidé.</p>
                                <a href="https://oradia.fr/precommande-oracle.html"
                                  style="display:inline-block;background:rgba(212,175,55,0.15);border:1px solid rgba(212,175,55,0.5);color:#d4af37;font-family:'Cormorant Garamond',Georgia,serif;font-size:12px;letter-spacing:2px;text-transform:uppercase;text-decoration:none;padding:8px 16px;">
                                  Précommander →
                                </a>
                              </td>
                              <td style="padding:12px 16px 12px 0;vertical-align:middle;width:40%;text-align:right;">
                                <img src="https://oradia.fr/images/medias/apercu_stripe.png" alt="Oracle Oradia" width="130"
                                  style="display:block;width:130px;max-width:100%;margin-left:auto;border-radius:3px;opacity:0.92;">
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>

                      <!-- CORPS DU TEXTE -->
                      <tr>
                        <td style="padding:8px 48px 24px 48px;">
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                            ${bodyHtml}
                          </table>
                        </td>
                      </tr>

                      ${citationHtml}

                      <!-- SIGNATURE -->
                      <tr>
                        <td style="padding:0 48px 40px 48px;">
                          <div style="width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(212,175,55,0.2),transparent);margin-bottom:28px;"></div>
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="width:72px;vertical-align:top;padding-top:4px;">
                                <img src="https://oradia.fr/images/medias/photo_a_propos.png" alt="Rudy Boucheron" width="60" height="60"
                                  style="display:block;width:60px;height:60px;border-radius:50%;border:1.5px solid rgba(212,175,55,0.35);object-fit:cover;object-position:top;"
                                  onerror="this.src='https://oradia.fr/images/logo-hd-v2.jpeg'">
                              </td>
                              <td style="padding-left:16px;vertical-align:top;">
                                <p style="margin:0 0 2px 0;font-family:'Cormorant Garamond',Georgia,serif;font-size:24px;font-weight:600;color:#f0c75e;letter-spacing:0.5px;line-height:1.1;">Rudy Boucheron</p>
                                <p style="margin:0 0 6px 0;font-family:'Cormorant Garamond',Georgia,serif;font-size:12px;letter-spacing:2px;color:rgba(212,175,55,0.55);text-transform:uppercase;">Auteur · Thérapeute · Oradia</p>
                                <a href="https://oradia.fr" style="font-family:'Cormorant Garamond',Georgia,serif;font-size:12px;color:rgba(212,175,55,0.5);text-decoration:none;letter-spacing:1px;">oradia.fr</a>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>

                      <!-- FOOTER -->
                      <tr>
                        <td style="padding:0;border-top:1px solid rgba(212,175,55,0.1);">

                          <!-- Réseaux sociaux -->
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td align="center" style="padding:24px 40px 16px 40px;">
                                <!-- Instagram -->
                                <a href="https://www.instagram.com/oradia_officiel" style="display:inline-block;margin:0 8px;text-decoration:none;">
                                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-block;">
                                    <tr>
                                      <td style="width:36px;height:36px;background:rgba(212,175,55,0.08);border:1px solid rgba(212,175,55,0.2);border-radius:50%;text-align:center;vertical-align:middle;">
                                        <img src="https://cdn-icons-png.flaticon.com/32/2111/2111463.png" width="16" height="16" alt="Instagram"
                                          style="display:block;width:16px;height:16px;margin:10px auto;filter:sepia(1) saturate(2) hue-rotate(5deg) brightness(1.2);">
                                      </td>
                                    </tr>
                                  </table>
                                </a>
                                <!-- Site web -->
                                <a href="https://oradia.fr" style="display:inline-block;margin:0 8px;text-decoration:none;">
                                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-block;">
                                    <tr>
                                      <td style="width:36px;height:36px;background:rgba(212,175,55,0.08);border:1px solid rgba(212,175,55,0.2);border-radius:50%;text-align:center;vertical-align:middle;">
                                        <img src="https://cdn-icons-png.flaticon.com/32/1006/1006771.png" width="16" height="16" alt="Site web"
                                          style="display:block;width:16px;height:16px;margin:10px auto;filter:sepia(1) saturate(2) hue-rotate(5deg) brightness(1.2);">
                                      </td>
                                    </tr>
                                  </table>
                                </a>
                              </td>
                            </tr>
                          </table>

                          <!-- Texte légal -->
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="padding:0 40px 28px 40px;border-top:1px solid rgba(255,255,255,0.04);">
                                <p style="margin:16px 0 0 0;font-family:'Cormorant Garamond',Georgia,serif;font-size:11px;color:rgba(255,255,255,0.28);text-align:center;line-height:1.9;letter-spacing:0.3px;">
                                  Chaque mercredi, Rudy vous écrit une lettre.<br>
                                  Vous recevez ce mail parce que vous avez accepté de recevoir les communications Oradia.<br>
                                  Vous ne souhaitez plus recevoir cette newsletter ?<br>
                                  <a href="{{unsubscribe}}" style="color:rgba(212,175,55,0.4);text-decoration:underline;">Vous pouvez vous désinscrire ici.</a>
                                </p>
                              </td>
                            </tr>
                          </table>

                        </td>
                      </tr>

                    </table>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
  <!--[if mso]></td></tr></table><![endif]-->

</body></html>`;
}

// ── Prompt Claude ─────────────────────────────────────────────────────────────
const CONTE_LIVRET = `CONTE INITIATIQUE — Livret de l'Oracle Oradia
Ce conte est inclus dans le livret qui accompagne l'Oracle Oradia (en précommande).
Si tu l'utilises comme source d'inspiration, mentionne-le clairement dans la lettre : 
"extrait du conte initiatique présent dans le livret de l'Oracle Oradia".

---

Conte initiatique : ORADIA

Chapitre 1 : La note dissonante

Maëlle avait grandi dans une maison où l'on ne parlait pas très fort. On ne criait pas. On ne débordait pas. On ne dérangeait pas. Très tôt, elle avait compris qu'il valait mieux être raisonnable, être sage, une experte en camouflage émotionnel, ajustant chaque geste pour ne jamais rompre l'équilibre fragile du silence. Être celle qui comprend sans qu'on ait besoin d'expliquer. Elle avait appris à lire les silences avant les mots. À anticiper les attentes. À ajuster son comportement pour maintenir l'équilibre. On lui avait transmis des phrases simples, répétées comme des évidences : « Sois forte », « Ne te plains pas », « Ne pleure pas ! », « Fais ce qu'il faut », « Ne déçois pas ».

Au fond d'elle pourtant, elle ne se souvenait pas avoir choisi d'y croire. Mais elles s'étaient déposées en elle comme des couches invisibles. Comme des certitudes à ne jamais remettre en question. Alors en grandissant, elle était devenue celle qu'elle pensait devoir être : fiable, capable, inébranlable, fragile en silence, les épaules fortes. Elle savait quoi faire, quand le faire, comment le faire. Elle s'était installée dans un quotidien ordinaire, avait trouvé un emploi stable, et tout mis en place pour garantir une stabilité matérielle.

Et pourtant, parfois, dans des instants sans raison apparente lors d'un moment suspendu, devant une vitrine, au feu rouge, une sensation étrange l'envahissait. Comme si sa vie était bien construite, mais bâtie sur un plan qui n'était pas entièrement le sien. Elle ne manquait de rien, objectivement. Mais quelque chose manquait quand même. Une dissonance lui serrait le cœur, comme si un instrument jouait en elle une note stridente et profondément inconfortable. Une part d'elle s'était adaptée si longtemps qu'elle ne savait plus très bien où elle commençait vraiment. Il lui arrivait de se demander : « Si je cessais de répondre aux attentes des autres, qui serais-je ? ». Mais quand cette question la traversait, elle s'arrangeait pour la repousser, l'occulter, la cacher sous le tapis qui marque l'entrée de son jardin secret. Après tout, il y avait des choses plus urgentes à faire.

Alors même si tout cela sonne faux, Maëlle continuait d'avancer sur un chemin qu'elle pensait linéaire, prédéterminé et inévitable. Mais un soir, alors qu'elle marchait dans les rues de la ville, sans annonce, sans drame extérieur, une fissure apparut. Pas une catastrophe. Pas un effondrement. Juste une émotion trop grande pour être contenue. Comme une digue cède sous le poids de l'eau. Et cette fois, cette vague, Maëlle savait qu'elle ne parviendrait pas à la contenir. Ce soir-là, une pluie fine tombait sur les toits rouges, elle finissait sa course sur la terre d'une teinte particulière, presque ocre, presque sang. Les ancêtres disaient qu'elle gardait mémoire des anciens feux.

Maëlle s'arrêta au milieu d'une rue étroite. Les murs semblaient se rapprocher. Sa poitrine se serrait. Le temps semblait comme comprimé en un instant immobile. Elle tomba à genoux, déposa ses mains sur son visage, ferma les yeux, comme pour fuir cette réalité extérieure insupportable. Mais cela la plongea dans son intériorité bouleversée et ses larmes se mirent à couler. Elle, qui se pensait invincible, se sentit coupable et faible. Contrainte de réaliser qu'elle était finalement fragile et impuissante. Ses larmes tombèrent dans la poussière rouge. Lorsqu'elles touchèrent le sol, quelque chose changea. La terre sembla se cristalliser. La boue devint éclat, d'un rouge profond.

Quand Maëlle eut fini d'exprimer cette émotion intense, elle ouvrit les yeux et vit cette pierre qui semblait lui parler. Elle la prit dans la paume de sa main, elle ressentit une connexion subtile, comme si ce grenat rouge était connecté à son cœur. Il était chaud, presque vivant. Elle resta immobile quelque temps puis reprit le chemin de sa maison. Le monde autour d'elle reprit son mouvement, mais elle avait l'impression que le temps, lui, venait de s'ouvrir. Comme une faille, une connexion avec une dimension insaisissable. Portant en elle un message, une connaissance, un éclaircissement. Elle comprit que ce n'était pas la ville qui avait changé. C'était son regard. Elle avait compris que ses émotions n'étaient finalement pas synonymes de faiblesse à dissimuler, mais qu'elles étaient porteuses de messages, d'alertes, de clés pour ouvrir une porte laissant entrevoir un monde caché. Cet épisode si soudain provoqua chez elle un flot de questions interminable. Elle se mit à paniquer et ses jambes lui ordonnèrent de courir.

Chapitre 2 : Le Champ des Possibles

Maëlle ne comprit pas ce qui lui arrivait, elle se sentait riche de son expérience et en même temps épuisée. Plus rien dans son environnement ne ressemblait à ce qu'elle connaissait, ses repères habituels étaient comme effacés. Les rues de la ville avaient laissé place à un sentier de montagne. L'air était clair, pur, presque trop limpide. Chaque bruit semblait net, comme apaisant, comme si le monde avait été réaccordé. La lumière de l'aube était chaude et rassurante. Maëlle vit un homme qui marchait devant elle. Un randonneur, grand, marchant d'un pas sûr et arborant un chapeau taillé pour lui. Sa silhouette semblait appartenir à toutes les époques à la fois. À certains moments, il paraissait lointain. Puis soudain tout proche, comme si la distance se pliait.

— Tu crois avancer dans le temps, dit-il sans se retourner. Mais le temps est un champ. Ce que tu deviens t'appelle déjà. Il te faut apprendre à jouer et composer avec les synchronicités.

Elle ne comprit pas complètement. Mais elle sentit que quelque chose en elle savait. Elle continuait de marcher et le paysage changea progressivement. Les couleurs devinrent plus chaudes, plus vibrantes. Elle sentit quelque chose pulser dans sa poche. C'était le grenat rouge qui s'était présenté à elle. Les émotions qu'elle avait contenues tant d'années remontèrent, mais différemment cette fois. Elles n'étaient plus des ennemies. Elles étaient des forces. Colère comme feu. Tristesse comme pluie. Désir comme vent. Elle ne les repoussa pas. Elle les laissa traverser son corps comme un archer caresse les cordes d'un violon. Chaque vibration trouvait peu à peu sa juste fréquence et devenait harmonie. Le randonneur s'arrêta près d'un rocher.

— Ce que tu fuis devient dissonant. Ce que tu écoutes devient musique.

Il tourna la tête vers Maëlle, elle découvrit alors un visage lumineux, aux yeux bleus porteurs de messages subtils et infinis. Puis il disparut derrière un tournant.

Chapitre 3 : Le Creuset de l'Âme

Plus loin, le sentier descendit vers une plaine baignée d'une lumière orangée. Une chaleur douce flottait dans l'air. Au centre de cette plaine, une femme était assise sur une pierre plate. Elle façonnait l'argile avec ses mains d'un mouvement lent et circulaire. Ses gestes étaient d'une fluidité hypnotique.

— Que façonnes-tu ? demanda Maëlle.
— Ce qui demande à naître, répondit la femme.

La femme invita Maëlle à toucher la terre fraîchement façonnée. Cela provoqua chez elle autre chose que l'émotion brute. Elle sentit un besoin, besoin d'accueillir ce qui la traverse et de laisser ses mains structurer la matière. Ainsi, derrière l'émotion, d'autres besoins lui vinrent sans qu'elle ne sache l'expliquer. Le besoin de repos derrière la fatigue. Besoin de vérité derrière la colère. Besoin d'amour derrière la peur. Peu à peu l'argile prenait forme. La femme lui tendit une coupe d'argile encore humide qu'elle venait de réaliser et prononça ces mots : « Ce que tu refuses de reconnaître se déforme. Ce que tu accueilles prend forme ».

Maëlle prit la coupe dans ses mains et découvrit une pierre ocre étincelante à l'intérieur. C'était une cornaline, elle saisit la pierre et la posa tout contre son ventre. La chaleur était différente de celle du grenat. Moins explosive. Plus nourricière. Comme un espace qui demandait à s'ouvrir, un contenant prêt à se former pour recevoir un besoin indispensable. Maëlle comprit que son corps entier était un instrument. Et que certains cordages avaient été trop tendus. Elle salua la femme et reprit sa marche.

Chapitre 4 : Le Saut dans le Vide

Le chemin reprit de l'altitude. Un pont étroit qui traversait un ravin couvert de brume se présenta à elle. Impossible de voir à plus d'un pas devant, seule une lueur à l'extrémité du pont, comme une étoile dans la nuit, semblait indiquer le chemin à suivre. Maëlle s'engagea sur le pont, arrivée au milieu subitement, un bruit sourd retentit et le pont céda.

La chute ne fut pas violente. Elle fut lente. Comme si le temps s'étirait. Elle vit défiler ses anciennes versions d'elle-même. Celles qu'elle avait construites pour être aimée. Celles qu'elle avait endossées pour être forte. Comme une mue de serpent, les peaux tombèrent sans douleur. Les yeux de Maëlle étaient attirés vers les hauteurs, dans la brume, la lueur brillait toujours comme un phare mais son éclat semblait encore plus intense. « Rien ne disparaît, tout se transforme », entendit-elle.

Puis la chute s'arrêta net, Maëlle avait touché le sol. Au lieu de se sentir anéantie par la chute qu'elle venait de faire, elle respirait plus librement, se sentait plus légère. Dans le creux de sa main, une pierre aux éclats bleus et verts s'y lovait, une labradorite. Lorsqu'elle la toucha, elle comprit que la chute ne fut pas l'effondrement qu'elle redoutait, mais une dépose. Comme si le vide, loin de l'engloutir, la débarrassait de ses armures inutiles, une transmutation.

Chapitre 5 : Le Conseil des Ombres et des Lumières

La nuit tomba, Maëlle décida de s'arrêter. Elle monta un campement simple et alluma un feu. Les flammes dansaient dans la nuit. Elle leva les yeux au ciel, admira les étoiles et fut prise d'une envie profonde d'interroger l'Univers.

— Montre-moi qui je suis vraiment, murmura-t-elle.

Son regard redescendit vers le feu. Autour d'elle, des présences étaient apparues. Une femme droite au regard clair se tenait à sa gauche. Une autre femme qui semblait plus douce à sa droite, presque maternelle. En face d'elle se trouvait une enfant vive. Et une autre silhouette silencieuse aux cheveux blancs à ses côtés. Au centre du cercle, une pierre étincelante reflétait la lumière des flammes, un lapis-lazuli. Elle comprit que ces figures n'étaient pas des rôles à choisir, mais comme des forces à harmoniser. Comme des pupitres différents dans un orchestre. Aucune ne devait dominer. Aucune ne devait disparaître. Elle resta longtemps ainsi, à écouter les voix intérieures se répondre jusqu'à ce qu'un équilibre s'installe. Elle comprit que ces figures étaient des archétypes, des forces universelles à harmoniser, à apprivoiser, plutôt que des rôles à choisir.

À l'aube, elle descendit vers une prairie verte. Une petite fille fouillait l'herbe avec sérieux.

— Tu cherches quoi ? demanda Maëlle.
— Ma pierre, répondit l'enfant. Je l'ai cachée et je ne me souviens plus où.

Elles cherchèrent ensemble. Riant. Inventant des règles. Déplaçant des cailloux inutiles. Maëlle sentit une joie simple revenir. Une légèreté oubliée. Quand la petite fille trouva enfin l'aventurine verte, elle la contempla longuement. Puis, sans hésiter, elle la tendit à Maëlle.

— C'est pour toi. On ne perd jamais vraiment ce qui est à nous.

Maëlle sentit quelque chose se reconnecter en elle. L'enfant qu'elle avait été n'avait jamais disparu.

— Comment tu t'appelles ? demanda-t-elle.
— Lila.

Le nom résonna en elle, un souvenir lui revint : un livre ancien évoquant un mot venu d'Orient : Līlā, le jeu du vivant. Maëlle reçut cela comme une révélation. Quand elle releva la tête, l'enfant n'était plus là. Mais l'aventurine brillait dans sa main.

Chapitre 6 : L'Engagement de Soi

Maëlle avait repris sa route, mais un blocage intérieur la fit s'arrêter net. Avancer encore vers l'inconnu ou rebrousser chemin et retrouver la sécurité d'un paysage déjà arpenté ? La question semblait insurmontable et faisait remonter en elle des peurs qu'elle n'avait encore soupçonnées. Elle regarda le chemin parcouru, se retourna, et tressaillit : le randonneur était là, immobile, à quelques pas devant elle.

— Comprendre ne suffit pas, dit-il. La musique doit être jouée.

Soudain, devant elle s'ouvrait un passage étroit entre deux parois rocheuses baignées de lumière dorée. Au centre, incrustée dans la pierre, scintillait une citrine. La voix du randonneur résonnait encore dans son esprit, la détermination et l'intuition la guidaient, elle devait la détacher elle-même. Ce ne fut pas facile. La roche résistait. Elle comprit qu'elle ne pouvait pas lutter contre la pierre, que son action n'était pas la bonne. Elle s'arrêta un instant, ferma les yeux et cala son souffle sur le battement de son cœur. Elle posa ses mains à plat contre la paroi et laissa monter en elle une note longue et profonde. Ce son, d'abord simple frémissement au creux de sa gorge, finit par s'échapper de ses lèvres, résonnant contre la roche. Elle puisait dans la force du grenat et de la cornaline qu'elle portait déjà, faisant chanter sa propre voix forte de certitude et de conviction contre la pierre. Sous l'effet de cette fréquence, la roche sembla changer de densité et s'assouplit, libérant enfin la citrine dans sa paume. Elle sentit alors une clarté nouvelle circuler en elle. L'action n'était pas agitation. C'était alignement, justesse et présence.

Chapitre 7 : Oradia — Le Réveil

Au terme du voyage, elle se retrouva sur un plateau circulaire. Un motif de labyrinthe identique à ceux que l'on peut voir dans des cathédrales. Le vent était calme. Elle sortit l'améthyste qu'elle portait désormais autour du cou, suspendue à un fil simple. Son intuition lui souffla de s'asseoir au centre du labyrinthe. Elle plaça ensuite les autres pierres autour d'elle : le grenat, la cornaline, la labradorite, le lapis-lazuli, l'aventurine et la citrine. Un cercle. Elle ferma les yeux. Elle sentit la présence à ses côtés de toutes les personnes qu'elle avait rencontrées durant ce voyage. Chaque pierre vibrait comme un instrument de musique dans un orchestre. Elle respira profondément. Elle sentit son cœur lui adresser un message : émotion, besoin, transmutation, archétypes, révélation, action, les mémoires du cosmos, tout est là.

Maëlle ressentit l'énergie de chacun de ces mots, leur vibration, comme un motif à la géométrie parfaite dessiné sur une toile. Puis l'améthyste s'illumina contre sa poitrine, pas dans un éclat spectaculaire, mais dans une harmonie profonde, en douceur. Tout s'accordait. Mais au-delà de l'harmonie, Maëlle ressentit une présence immense, une force qui ne jugeait ni ses fuites passées, ni ses silences, ni ses peurs. C'était comme une lumière dorée qui ne brûle pas, un Amour Inconditionnel qui l'enveloppait totalement. Elle comprit alors qu'elle n'avait jamais eu besoin d'être « assez » ou d'être « forte » pour mériter d'exister. Elle était aimée simplement parce qu'elle était là, une note unique dans le grand orchestre du Tout. Cet amour était le ciment de toutes ses pierres, la fréquence pure qui rendait la musique possible.

Elle réalisa que la note juste n'était pas une perfection à atteindre. C'était un équilibre vivant, une danse subtile, une oscillation entre deux polarités opposées mais complémentaires se nourrissant mutuellement. Un nom monta en elle, comme un mantra oublié : Oradia. Elle ne savait pas d'où il venait. Mais elle sut qu'il serait désormais sa boussole intérieure.

Soudain, le silence sacré du labyrinthe fut pulvérisé. La lumière dorée d'Oradia se mua en un éclair blanc, aveuglant, violent. Le chant des sphères fit place à un souffle de vent si puissant qu'il la ramena instantanément au point de départ. Un choc. Le froid. Le bruit d'une ambulance au loin. Elle était là, étendue sur l'asphalte où elle avait tenté d'échapper à ses propres questions. Elle se souvint de la course folle, de l'impact, du noir. Mais le noir n'avait pas été vide, il avait laissé sa place à une lumière ineffable. Elle revenait de cet 'entre-deux' avec une boussole neuve. Ce voyage n'était pas une fuite, mais un passage nécessaire. Elle ne revenait pas seule, elle ramenait avec elle la vibration des sept pierres.

Alors que les secours s'approchaient, Maëlle porta la main droite à sa poitrine. Elle ne portait plus de collier, mais sous ses doigts, elle crut sentir la chaleur de l'améthyste, et dans son esprit, les sept leçons brillaient comme des balises. Dans sa paume gauche, restée close durant l'impact, une légère trace ocre marquait sa peau, comme si la poussière du chemin de montagne avait défié les lois du monde dense pour témoigner de son voyage. Un sourire flotta sur ses lèvres malgré la douleur. Elle ne cherchait plus la musique. Elle la jouait. Et désormais, chaque carte qu'elle tirerait dans le jeu de la vie serait un écho de cette note juste, un pont jeté entre Oradia et le battement de son cœur.`;

// ── Handler principal ─────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!checkAuth(req, res)) return;

  const action = req.query.action;

  // ── GENERATE ────────────────────────────────────────────────────────────────
  if (action === 'generate') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
    const { intention, source, ton, energie, idees_bonus } = req.body;
    if (!intention) return res.status(400).json({ error: 'Une intention est requise' });

    const sourceTexte = CONTE_LIVRET;

    const sourceLabel = source === 'conte'
      ? 'le conte initiatique présent dans le livret de l\'Oracle Oradia — si tu t\'en inspires, mentionne-le : "extrait du conte initiatique du livret Oradia"'
      : 'ta propre observation du vivant, sans référence à des livres non encore publiés';

    const prompt = `Tu es Rudy Boucheron — thérapeute et créateur de l'Oracle Oradia. Tu écris une lettre hebdomadaire à tes abonnés, des gens ordinaires qui cherchent à mieux se comprendre. Des gens qui ont une vie, des doutes, des fatigues, et qui parfois sentent qu'il y a quelque chose à comprendre dans ce qu'ils vivent. Qui sont en évolution et en quête de sens.

TA VOIX : directe, chaude, sans jargon. Tu parles comme tu penses — avec des phrases courtes quand c'est fort, des phrases plus longues quand tu déroules une idée. Jamais de tirets. Jamais de titres en majuscules dans le corps du texte. Tu n'expliques pas — tu montres, tu racontes, tu poses.

IMPORTANT : Ne mentionne aucun livre non publié. Tu peux t'inspirer du conte initiatique du livret de l'Oracle Oradia (ci-dessous) si pertinent, en le citant explicitement. Sinon, pars de ta propre observation du vivant.

${source === 'conte' ? `CONTE INITIATIQUE DU LIVRET :\n${sourceTexte}` : ''}

INTENTION DE CETTE LETTRE : ${intention}
SOURCE D'INSPIRATION : ${sourceLabel}
TON : ${ton === 'poetique' ? 'sensoriel, lent, beaucoup d\'images' : ton === 'scientifique' ? 'ancré dans le concret et le corps, avec des références claires mais vulgarisées' : ton === 'narratif' ? 'tu racontes une scène, une situation, quelqu\'un que tu as rencontré (anonymisé)' : 'contemplatif — tu poses des choses sans tout résoudre'}
${energie ? `ÉNERGIE DU MOMENT à tisser naturellement : ${energie}` : ''}
${idees_bonus ? `FRAGMENTS DE TON CARNET à intégrer si pertinent : ${idees_bonus}` : ''}

FORMAT DE TA RÉPONSE — deux blocs séparés par ---

OBJET EMAIL (une seule ligne, max 55 caractères, pas de question, pas de "découvrez", quelque chose qui donne envie d'ouvrir)

---

LE CORPS DE LA LETTRE (400 à 500 mots, un seul bloc de texte fluide avec des sauts de ligne entre les paragraphes, aucun titre, aucun tiret, aucune liste, aucune section visible. Termine par une citation entre guillemets français « » (30 à 150 caractères) tirée du conte ou de ton inspiration. Puis la signature : "Rudy" suivi d'une ligne blanche puis "→ oradia.fr")`;

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'Erreur génération Claude', details: 'ANTHROPIC_API_KEY manquante dans les variables Vercel' });
    }
    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const message = await client.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 1800,
        messages: [{ role: 'user', content: prompt }]
      });
      return res.status(200).json({ content: message.content[0].text, usage: message.usage });
    } catch (e) {
      return res.status(500).json({ error: 'Erreur génération Claude', details: e.message });
    }
  }

  // ── IDEAS ────────────────────────────────────────────────────────────────────
  if (action === 'ideas') {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('newsletter_ideas').select('*').order('created_at', { ascending: false });
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json(data);
    }
    if (req.method === 'POST') {
      const { content, source, tags } = req.body;
      if (!content) return res.status(400).json({ error: 'Contenu requis' });
      const { data, error } = await supabase
        .from('newsletter_ideas')
        .insert([{ content, source: source || null, tags: tags || [] }])
        .select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(201).json(data);
    }
    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'ID requis' });
      const { error } = await supabase.from('newsletter_ideas').delete().eq('id', id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ success: true });
    }
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  // ── SAVE ─────────────────────────────────────────────────────────────────────
  if (action === 'save') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
    const { id, subject, content, intention, statut } = req.body;
    if (!content) return res.status(400).json({ error: 'Contenu requis' });
    if (id) {
      const { data, error } = await supabase
        .from('newsletter_drafts')
        .update({ subject: subject || null, content, intention: intention || null,
          statut: statut || 'brouillon', updated_at: new Date().toISOString() })
        .eq('id', id).select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json(data);
    } else {
      const { data, error } = await supabase
        .from('newsletter_drafts')
        .insert([{ subject: subject || null, content, intention: intention || null, statut: 'brouillon' }])
        .select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(201).json(data);
    }
  }

  // ── SEND ─────────────────────────────────────────────────────────────────────
  if (action === 'send') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
    const { draft_id, subject, test_email } = req.body;
    if (!draft_id) return res.status(400).json({ error: 'draft_id requis' });
    if (!process.env.BREVO_API_KEY || !process.env.BREVO_SENDER_EMAIL) {
      return res.status(500).json({ error: 'Erreur envoi test', details: 'BREVO_API_KEY ou BREVO_SENDER_EMAIL manquant dans les variables Vercel' });
    }

    const { data: draft, error: fetchError } = await supabase
      .from('newsletter_drafts').select('*').eq('id', draft_id).single();
    if (fetchError || !draft) return res.status(404).json({ error: 'Brouillon introuvable' });
    if (draft.statut === 'envoyé' && !test_email)
      return res.status(400).json({ error: 'Cette newsletter a déjà été envoyée' });

    const emailSubject = subject || draft.subject || 'La lettre du vivant';
    const htmlContent = textToHtml(draft.content);

    const senderName = process.env.BREVO_SENDER_NAME || 'Rudy — La Boussole Intérieure';
    const senderEmail = process.env.BREVO_SENDER_EMAIL;

    try {
      // ── TEST : envoi transactionnel direct (smtp/email), pas besoin que le contact existe
      if (test_email) {
        const testRes = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender: { name: senderName, email: senderEmail },
            to: [{ email: test_email }],
            subject: `[TEST] ${emailSubject}`,
            htmlContent
          })
        });
        if (!testRes.ok) return res.status(500).json({ error: 'Erreur envoi test', details: await testRes.json() });
        return res.status(200).json({ success: true, mode: 'test' });
      }

      // ── ENVOI RÉEL : créer la campagne puis envoyer à la liste
      const createRes = await fetch('https://api.brevo.com/v3/emailCampaigns', {
        method: 'POST',
        headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: emailSubject, subject: emailSubject,
          sender: { name: senderName, email: senderEmail },
          type: 'classic', htmlContent,
          recipients: { listIds: [parseInt(process.env.BREVO_LIST_ID)] }
        })
      });
      const campaign = await createRes.json();
      if (!createRes.ok) return res.status(500).json({ error: 'Erreur création campagne Brevo', details: campaign });

      const sendRes = await fetch(`https://api.brevo.com/v3/emailCampaigns/${campaign.id}/sendNow`, {
        method: 'POST', headers: { 'api-key': process.env.BREVO_API_KEY }
      });
      if (!sendRes.ok) return res.status(500).json({ error: 'Erreur envoi', details: await sendRes.json() });

      await supabase.from('newsletter_drafts')
        .update({ statut: 'envoyé', sent_at: new Date().toISOString(), brevo_campaign_id: campaign.id })
        .eq('id', draft_id);

      return res.status(200).json({ success: true, mode: 'envoi', campaign_id: campaign.id });
    } catch (e) {
      return res.status(500).json({ error: 'Erreur serveur', details: e.message });
    }
  }

  // ── DRAFTS ───────────────────────────────────────────────────────────────────
  if (action === 'drafts') {
    if (req.method === 'GET') {
      const { id } = req.query;
      if (id) {
        const { data, error } = await supabase
          .from('newsletter_drafts')
          .select('*')
          .eq('id', id)
          .single();
        if (error) return res.status(404).json({ error: error.message });
        return res.status(200).json(data);
      }
      const { data, error } = await supabase
        .from('newsletter_drafts')
        .select('id, subject, intention, statut, content, created_at, sent_at')
        .order('created_at', { ascending: false });
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json(data);
    }
    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'ID requis' });
      const { error } = await supabase.from('newsletter_drafts').delete().eq('id', id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ success: true });
    }
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  return res.status(400).json({ error: 'action manquante ou inconnue. Valeurs : generate, ideas, save, send, drafts' });
}
