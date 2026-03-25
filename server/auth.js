const crypto = require('crypto');
const cookieParser = require('cookie-parser');

const AUTH_PASSWORD = process.env.AUTH_PASSWORD;
const SESSION_SECRET = crypto.randomBytes(32).toString('hex');
// Token = HMAC of password with server secret. Valid for the lifetime of the server process.
const VALID_TOKEN = AUTH_PASSWORD
  ? crypto.createHmac('sha256', SESSION_SECRET).update(AUTH_PASSWORD).digest('hex')
  : null;

const LOGIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Web TTYd Hub - Login</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0f172a;
      color: #f8fafc;
      height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .login-box {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 32px;
      width: 100%;
      max-width: 360px;
      margin: 16px;
    }
    h1 { font-size: 20px; font-weight: 600; margin-bottom: 24px; text-align: center; }
    label { display: block; font-size: 13px; color: #94a3b8; margin-bottom: 8px; }
    input[type="password"] {
      width: 100%;
      background: #0f172a;
      border: 1px solid #334155;
      color: #f8fafc;
      padding: 10px;
      border-radius: 6px;
      font-size: 14px;
      outline: none;
    }
    input[type="password"]:focus { border-color: #3b82f6; }
    button {
      width: 100%;
      margin-top: 16px;
      padding: 10px;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
    }
    button:hover { background: #2563eb; }
    .error { color: #ef4444; font-size: 13px; margin-top: 12px; text-align: center; display: none; }
  </style>
</head>
<body>
  <form class="login-box" method="POST" action="/login" autocomplete="on">
    <h1>Web TTYd Hub</h1>
    <label for="password">Password</label>
    <input type="password" id="password" name="password" autocomplete="current-password" autofocus required>
    <button type="submit">Sign In</button>
    <p class="error" id="error">Incorrect password</p>
  </form>
  <script>
    if (location.search.includes('error=1')) {
      document.getElementById('error').style.display = 'block';
    }
  </script>
</body>
</html>`;

function setupAuth(app) {
  if (!AUTH_PASSWORD) {
    console.warn('WARNING: AUTH_PASSWORD not set — running without authentication');
    return;
  }

  app.use(cookieParser());

  // Login page
  app.get('/login', (req, res) => {
    res.type('html').send(LOGIN_HTML);
  });

  // Login handler
  app.post('/login', require('express').urlencoded({ extended: false }), (req, res) => {
    if (req.body.password === AUTH_PASSWORD) {
      res.cookie('auth_token', VALID_TOKEN, {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
      });
      return res.redirect('/');
    }
    res.redirect('/login?error=1');
  });

  // Auth check middleware for everything else
  app.use((req, res, next) => {
    if (req.path === '/login') return next();
    if (req.cookies && req.cookies.auth_token === VALID_TOKEN) return next();
    // For API/WebSocket requests, return 401
    if (req.path.startsWith('/api/') || req.path === '/ws') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    res.redirect('/login');
  });

  console.log('Authentication enabled');
}

// Also export a function to check auth on WebSocket upgrade
function checkWsAuth(req) {
  if (!AUTH_PASSWORD) return true;
  const cookies = parseCookieHeader(req.headers.cookie || '');
  return cookies.auth_token === VALID_TOKEN;
}

function parseCookieHeader(header) {
  const cookies = {};
  header.split(';').forEach(part => {
    const [key, ...val] = part.trim().split('=');
    if (key) cookies[key] = decodeURIComponent(val.join('='));
  });
  return cookies;
}

module.exports = { setupAuth, checkWsAuth };
