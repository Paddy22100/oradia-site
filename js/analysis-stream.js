// js/analysis-stream.js
// Appel de /api/analyse-tirage en mode streaming (text/event-stream) : le texte de
// l'Oracle s'affiche au fil de l'eau via onText(texteCumulé), puis la promesse se
// résout avec { success, analysis } — le texte complet nettoyé côté serveur, qui
// remplace l'affichage provisoire (découpage en sections par la page).
// Les refus (429, 503…) restent des réponses JSON : ils sont renvoyés tels quels.
(function (global) {
  async function fetchAnalysisStream(payload, onText) {
    const resp = await fetch('/api/analyse-tirage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, stream: true })
    });
    const type = resp.headers.get('Content-Type') || '';
    if (!type.includes('text/event-stream') || !resp.body) {
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.success || !data.analysis) throw new Error(data.error || 'Analyse indisponible');
      return data;
    }
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '', text = '', result = null, failure = null;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const lines = raw.split('\n');
        const event = (lines.find(l => l.startsWith('event:')) || '').slice(6).trim();
        const dataLine = lines.find(l => l.startsWith('data:'));
        if (!dataLine) continue;
        let data;
        try { data = JSON.parse(dataLine.slice(5).trim()); } catch (_) { continue; }
        if (event === 'done') result = data;
        else if (event === 'error') failure = data;
        else if (typeof data.t === 'string') {
          text += data.t;
          try { onText && onText(text); } catch (_) {}
        }
      }
    }
    if (result && result.analysis) return result;
    throw new Error((failure && (failure.message || failure.error)) || 'Analyse interrompue');
  }

  // Aperçu lisible du texte en cours (titres ## en gras, paragraphes), sans les tirets
  // longs que le nettoyage final retire aussi.
  function renderStreamingPreview(text) {
    const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    return esc(text.replace(/\s*\u2014\s*/g, ' ').replace(/\u2022/g, ''))
      .split(/\n{2,}/)
      .map(p => p.replace(/^##\s+(.+)$/gm, '<strong style="display:block;color:#d4af37;margin-top:0.75rem;">$1</strong>').replace(/\n/g, '<br>'))
      .map(p => `<p style="margin:0 0 0.75rem;">${p}</p>`)
      .join('');
  }

  global.OradiaAnalysisStream = { fetchAnalysisStream, renderStreamingPreview };
})(window);
