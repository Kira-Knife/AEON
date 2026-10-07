// Loads ./.env (KEY=VALUE lines) into process.env if the file exists.
// Values already set in the environment win. No dependency needed.
import fs from 'node:fs';
try {
  const text = fs.readFileSync(new URL('./.env', import.meta.url), 'utf8');
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}
