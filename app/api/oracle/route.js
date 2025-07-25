export async function GET(request) {
  const familles = {
    "Émotions": ["Joie", "Tristesse", "Colère", "Peur", "Sérénité"],
    "Besoins": ["Sécurité", "Amour", "Reconnaissance", "Liberté", "Clarté"],
    "Transmutation": ["Lâcher-Prise", "Transformation", "Résilience", "Guérison", "Élévation"],
    "Archétypes": ["Sage", "Guerrier", "Amant", "Créateur", "Alchimiste"],
    "Révélations": ["Prendre Conscience", "Illumination", "Ouverture", "Vision", "Éveil"],
    "Actions": ["Agir", "Exprimer", "Oser", "Ancrer", "Partager"]
  };

  const tirage = [];

  for (const [famille, cartes] of Object.entries(familles)) {
    const carte = cartes[Math.floor(Math.random() * cartes.length)];

    const prompt = `
Tu es la voix vibratoire de l’oracle Oradia.

Carte tirée dans la famille "${famille}" : "${carte}".

Exprime une interprétation vibratoire, poétique, symbolique et lumineuse.
Utilise "tu", pas "le consultant".
Conclue par un mantra doux.
`;

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            { role: "system", content: "Tu es la voix poétique du jeu Oradia." },
            { role: "user", content: prompt }
          ],
          max_tokens: 400,
          temperature: 0.95
        }),
      });

      const data = await response.json();
      const interpretation = data.choices?.[0]?.message?.content?.trim() || "Message non reçu.";

      tirage.push({ famille, carte, interpretation });
    } catch (error) {
      console.error("Erreur OpenAI :", error);
      tirage.push({ famille, carte, interpretation: "Une brume empêche le message d’émerger." });
    }
  }

  return new Response(JSON.stringify({ tirage }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
