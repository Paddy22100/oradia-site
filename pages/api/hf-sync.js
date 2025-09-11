export default async function handler(req, res) {
  if (req.method === "GET") {
    // Health check rapide depuis le navigateur
    return res.status(200).json({ ok: true, msg: "hf-sync up" });
  }
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const token = process.env.GH_PAT;
    const ghRepo = process.env.GH_REPO || "Paddy22100/oradia-site"; // sécurité
    if (!token)  return res.status(500).json({ ok:false, error:"Missing GH_PAT" });

    // Décompose owner/repo
    const [owner, repo] = ghRepo.split("/");
    if (!owner || !repo) {
      return res.status(500).json({ ok:false, error:"GH_REPO malformed" });
    }

    // Déclenche le repository_dispatch ciblé
    const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/dispatches`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github+json",
      },
      body: JSON.stringify({
        event_type: "hf-space-updated",
        client_payload: { source: "huggingface", ts: Date.now() }
      })
    });

    const txt = await r.text();
    if (!r.ok) {
      return res.status(500).json({ ok:false, error: txt || r.statusText });
    }
    return res.status(200).json({ ok:true, forwarded: true });
  } catch (e) {
    return res.status(500).json({ ok:false, error: String(e) });
  }
}

