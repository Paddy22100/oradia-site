// api/health.js
// Endpoint de health check léger pour le monitoring et les audits.
// Répond 200 avec un statut minimal, sans dépendances externes.

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    status: 'ok',
    service: 'oradia',
    timestamp: new Date().toISOString(),
  });
}
