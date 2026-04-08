const fs = require('fs');
const path = require('path');

let hasLoaded = false;

function parseEnvContent(content) {
  const out = {};
  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const idx = line.indexOf('=');
    if (idx <= 0) continue;

    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    value = value.replace(/\\n/g, '\n').trim();
    out[key] = value;
  }

  return out;
}

function loadLocalEnvIfNeeded() {
  if (hasLoaded) return;
  hasLoaded = true;

  const hasRequiredNow =
    !!process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !!(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);

  if (hasRequiredNow) return;

  const root = process.cwd();
  const candidates = ['.env.local', '.env'];

  for (const fileName of candidates) {
    const filePath = path.join(root, fileName);
    if (!fs.existsSync(filePath)) continue;

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const parsed = parseEnvContent(content);

      for (const [k, v] of Object.entries(parsed)) {
        if (!process.env[k] && typeof v === 'string' && v.length > 0) {
          process.env[k] = v;
        }
      }
    } catch (error) {
      console.error('Local env load failed:', error.message);
    }
  }
}

module.exports = { loadLocalEnvIfNeeded };
