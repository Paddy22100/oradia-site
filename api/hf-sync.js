// api/hf-sync.js  (racine du repo)
module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    // Secret HF (doit être identique à celui renseigné côté HF)
    const expected = process.env.HF_WEBHOOK_SECRET || "";
    const got = req.headers["x-webhook-secret"] || "";
    if (expected && String(got) !== String(expected)) {
      return res.status(401).json({ error: "Invalid webhook secret" });
    }

    const repo = process.env.GH_REPO;       // "Paddy22100/oradia-site"
    const token = process.env.GH_TOKEN;     // PAT classic: scopes repo + workflow
    const eventType = process.env.DISPATCH_EVENT || "hf-space-updated";
    if (!repo || !token) {
      return res.status(500).json({ error: "Missing GH_REPO or GH_TOKEN env" });
    }

    const ghResp = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `token ${token}`,                // PAT classic → token
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        event_type: eventType,
        client_payload: { from: "huggingface", ts: Date.now() },
      }),
    });

    if (!ghResp.ok) {
      const text = await ghResp.text();
      return res
        .status(502)
        .json({ error: "GitHub dispatch failed", status: ghResp.status, details: text });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: "Server error" });
  }
};
