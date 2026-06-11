// api/index.js - Routeur unifié pour optimiser le nombre de fonctions Vercel
// Regroupe plusieurs endpoints sous une seule fonction

const { createClient } = require('@supabase/supabase-js');

// Importer les handlers
const healthHandler = require('./health.js');
const supportHandler = require('./support.js');
const waitlistHandler = require('./waitlist.js');
const qrngHandler = require('./qrng.js');

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': process.env.FRONTEND_URL || 'https://oradia.fr',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'Pragma': 'no-cache'
};

function setCORS(res, req) {
  const origin = req?.headers?.origin;
  if (origin && [process.env.FRONTEND_URL, 'https://oradia.fr', 'https://oradia-site.vercel.app'].includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

// Routeur principal
export default async function handler(req, res) {
  setCORS(res, req);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  try {
    // Health check
    if (path === '/api/health') {
      return await healthHandler(req, res);
    }

    // Support messages
    if (path === '/api/support') {
      return await supportHandler(req, res);
    }

    // Waitlist
    if (path === '/api/waitlist') {
      return await waitlistHandler(req, res);
    }

    // QRNG
    if (path === '/api/qrng') {
      return await qrngHandler(req, res);
    }

    // Endpoint non trouvé
    return res.status(404).json({ error: 'Endpoint not found' });

  } catch (error) {
    console.error('[API Router] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
