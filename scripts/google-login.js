// One-time Google OAuth bootstrap for the CLI tools.
//
//   1. Run `node scripts/google-login.js`
//   2. Open http://localhost:3000 in your browser and sign in with Google
//   3. The SUPABASE_REFRESH_TOKEN is written back to .env automatically
//
// Prereqs (set once in the Supabase dashboard):
//   - Enable the Google provider under Authentication > Providers
//   - Add http://localhost:3000/auth/callback under Authentication > URL Configuration

const http = require('http');
const { supabase, writeEnvVar, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = require('./supabase-cli');

const PORT = 3000;
const CALLBACK_URL = `http://localhost:${PORT}/auth/callback`;

// Supabase returns the session in the URL fragment, which never reaches the
// server. This page runs the client SDK to read it, then POSTs the token back.
const callbackHTML = `<!DOCTYPE html>
<html>
<head><title>Listlet Meals OAuth</title></head>
<body>
  <h2>Processing login...</h2>
  <pre id="result"></pre>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script>
    const client = window.supabase.createClient('${SUPABASE_URL}', '${SUPABASE_PUBLISHABLE_KEY}');
    client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        document.getElementById('result').textContent =
          'Logged in as ' + session.user.email + '. Check your terminal — you can close this tab.';
        fetch('/done', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: session.user.email, refresh_token: session.refresh_token }),
        });
      }
    });
  </script>
</body>
</html>`;

const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/') {
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: CALLBACK_URL },
        });
        if (error) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('OAuth error: ' + JSON.stringify(error));
            return;
        }
        res.writeHead(302, { Location: data.url });
        res.end();
    } else if (req.method === 'GET' && req.url.startsWith('/auth/callback')) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(callbackHTML);
    } else if (req.method === 'POST' && req.url === '/done') {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
            const info = JSON.parse(body);
            console.log(`\nLogged in as ${info.email}`);
            writeEnvVar('SUPABASE_REFRESH_TOKEN', info.refresh_token);
            console.log('Wrote SUPABASE_REFRESH_TOKEN to .env — you can now use scripts/library.js');
            res.writeHead(200);
            res.end('ok');
            setTimeout(() => server.close(), 500);
        });
    } else {
        res.writeHead(404);
        res.end('Not found');
    }
});

server.listen(PORT, () => {
    console.log(`Open http://localhost:${PORT} in your browser to sign in with Google.`);
    console.log(`Prereq: ${CALLBACK_URL} must be an allowed redirect URL in Supabase.`);
});
