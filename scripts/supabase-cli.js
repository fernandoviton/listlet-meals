// Shared Supabase client for the Node CLI tools under scripts/.
// Authenticates as a real user via a stored Google refresh token (same RLS
// path as the browser app), NOT a service_role key — so the CLI can only do
// what an authenticated user can do. Never imported by the browser bundle.

const fs = require('fs');
const path = require('path');
const ENV_PATH = path.join(__dirname, '..', '.env');
require('dotenv').config({ path: ENV_PATH, quiet: true });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
const DB_TABLE = process.env.DB_TABLE || 'listlet_meals';

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY in .env — copy .env.example to .env and fill them in.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
});

// Upsert a single KEY=value line in .env, preserving the rest of the file.
function writeEnvVar(key, value) {
    const line = `${key}=${value}`;
    let contents = '';
    try {
        contents = fs.readFileSync(ENV_PATH, 'utf8');
    } catch (err) {
        if (err.code !== 'ENOENT') throw err;
    }
    const re = new RegExp(`^${key}=.*$`, 'm');
    if (re.test(contents)) {
        contents = contents.replace(re, line);
    } else {
        if (contents.length && !contents.endsWith('\n')) contents += '\n';
        contents += line + '\n';
    }
    fs.writeFileSync(ENV_PATH, contents);
}

// Exchange the stored refresh token for a live session. Supabase rotates the
// refresh token on each use, so we write the new one back — otherwise repeated
// CLI invocations would invalidate the stored token.
async function login() {
    const refreshToken = process.env.SUPABASE_REFRESH_TOKEN;
    if (!refreshToken) {
        throw new Error('Missing SUPABASE_REFRESH_TOKEN in .env — run `node scripts/google-login.js` once to obtain it.');
    }
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
    if (error) {
        throw new Error(`Auth failed (${error.message}). Re-run \`node scripts/google-login.js\` to get a fresh token.`);
    }
    if (data.session && data.session.refresh_token && data.session.refresh_token !== refreshToken) {
        writeEnvVar('SUPABASE_REFRESH_TOKEN', data.session.refresh_token);
    }
    return data.user;
}

module.exports = { supabase, login, writeEnvVar, DB_TABLE, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY };
