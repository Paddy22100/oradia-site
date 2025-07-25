export const runtime = "edge";

export async function GET() {
  const encoder = new TextEncoder();
  const familles = {
    "Ã‰motions": ["Joie", "Tristesse", "ColÃ¨re", "Peur", "SÃ©rÃ©nitÃ©"],
    "Besoins": ["SÃ©curitÃ©", "Amour", "Reconnaissance", "LibertÃ©", "ClartÃ©"],
    "Transmutation": ["LÃ¢cher-Prise", "Transformation", "RÃ©silience", "GuÃ©rison", "Ã‰lÃ©vation"],
    "ArchÃ©types": ["Sage", "Guerrier", "Amant", "CrÃ©ateur", "Alchimiste"],
    "RÃ©vÃ©lations": ["Prendre Conscience", "Illumination", "Ouverture", "Vision", "Ã‰veil"],
    "Actions": ["Agir", "Exprimer", "Oser", "Ancrer", "Partager"]
  };

  const stream = new ReadableStream({
    async start(controller) {
      for (const [famille, cartes] of Object.entries(familles)) {
        const carte = cartes[Math.floor(Math.random() * cartes.length)];
        const prompt = `Oracle Oradia â€“ Famille : ${famille}. Carte : "${carte}". Ã‰cris une interprÃ©tation vibratoire et poÃ©tique.`;

        try {
          const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
              model: "gpt-4",
              messages: [{ role: "user", content: prompt }],
              max_tokens: 300,
            }),
          });

          const data = await response.json();
          const interpretation = data.choices?.[0]?.message?.content?.trim() || "Pas de rÃ©ponse GPT";

          const card = JSON.stringify({ famille, carte, interpretation });
          controller.enqueue(encoder.encode(`${card}\n`));
        } catch (error) {
          console.error("âŒ Erreur OpenAI :", error);
          const card = JSON.stringify({
            famille,
            carte,
            interpretation: "Erreur lors de la gÃ©nÃ©ration.",
          });
          controller.enqueue(encoder.encode(`${card}\n`));
        }
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain",
      "Cache-Control": "no-cache",
    },
  });
}
