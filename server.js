import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import express from 'express';
import * as wisp from '@mercuryworkshop/wisp-js/server';
import { searchMusic } from './musicScraper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;
const HTTPS_PORT = process.env.HTTPS_PORT || 8443;

// Resolve directories
const frontendPath = path.resolve(__dirname, '..', 'SuzeFrontend');
const scramjetPath = path.resolve(__dirname, 'node_modules', '@mercuryworkshop', 'scramjet', 'dist');
const bareMuxPath = path.resolve(__dirname, 'node_modules', '@mercuryworkshop', 'bare-mux', 'dist');
const epoxyPath = path.resolve(__dirname, 'node_modules', '@mercuryworkshop', 'epoxy-transport', 'dist');
const certPath = path.resolve(__dirname, 'cert.pfx');

// Middleware: CORS & Headers without COEP/COOP blocks
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Service-Worker-Allowed', '/');
  next();
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    proxy: 'scramjet',
    wisp: '/wisp/',
    timestamp: new Date().toISOString()
  });
});

// Musi App API: Music Search
app.get('/api/music/search', async (req, res) => {
  try {
    const query = req.query.q;
    if (!query) {
      return res.status(400).json({ error: 'Query parameter q is required' });
    }

    const tracks = await searchMusic(query);
    res.json({ tracks });
  } catch (err) {
    console.error('[Musi API] Search error:', err);
    res.status(500).json({ error: 'Failed to search music', details: err.message });
  }
});

// Musi App API: Trending / Popular Tracks
app.get('/api/music/trending', async (req, res) => {
  try {
    const genre = req.query.genre || 'top hits songs';
    const tracks = await searchMusic(genre);
    res.json({ tracks });
  } catch (err) {
    console.error('[Musi API] Trending error:', err);
    res.status(500).json({ error: 'Failed to fetch trending music', details: err.message });
  }
});

// Static routes for proxy engines and transports
app.use('/scramjet', express.static(scramjetPath, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.wasm')) {
      res.setHeader('Content-Type', 'application/wasm');
    }
  }
}));
app.use('/baremux', express.static(bareMuxPath));
app.use('/epoxy', express.static(epoxyPath));

// Serve SuzeFrontend UI if present, or status page if running standalone backend
if (fs.existsSync(path.join(frontendPath, 'index.html'))) {
  app.use(express.static(frontendPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html><html><head><title>Suze Backend</title><style>body{background:#070708;color:#fff;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;}.box{border:1px solid rgba(255,255,255,0.1);padding:2.5rem;border-radius:16px;background:#121214;max-width:420px;}h1{margin:0 0 0.5rem;font-size:1.4rem;letter-spacing:-0.02em;}p{color:#888;font-size:0.9rem;margin:0.5rem 0 1rem;}code{background:#000;padding:0.2rem 0.5rem;border-radius:4px;border:1px solid rgba(255,255,255,0.1);color:#fff;}.pill{display:inline-block;padding:0.35rem 0.85rem;border-radius:20px;background:rgba(16,185,129,0.15);color:#10b981;font-size:0.8rem;font-weight:600;}</style></head><body><div class="box"><h1>Suze Backend Online</h1><p>Wisp Endpoint: <code>/wisp/</code></p><span class="pill">● Active &amp; Ready</span></div></body></html>`);
  });
}

// Get Local Network IP for external connections
function getNetworkIp() {
  try {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const net of interfaces[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          return net.address;
        }
      }
    }
  } catch (e) {}
  return 'localhost';
}

// Ensure SSL Certificate exists for local HTTPS
function ensureCertificate() {
  if (!fs.existsSync(certPath)) {
    try {
      console.log('[SSL] Generating local self-signed certificate for LAN HTTPS...');
      const genScript = path.resolve(__dirname, 'generateCert.ps1');
      if (fs.existsSync(genScript)) {
        execSync(`powershell -ExecutionPolicy Bypass -File "${genScript}"`, { stdio: 'inherit' });
      }
    } catch (e) {
      console.warn('[SSL] Could not auto-generate certificate:', e.message);
    }
  }
  if (fs.existsSync(certPath)) {
    return { pfx: fs.readFileSync(certPath), passphrase: 'suze' };
  }
  return null;
}

// Create HTTP Server
const httpServer = http.createServer(app);

// WebSocket Upgrade Handler for Wisp Protocol
function handleWispUpgrade(req, socket, head) {
  if (req.url.startsWith('/wisp/')) {
    wisp.server.routeRequest(req, socket, head);
  } else {
    socket.destroy();
  }
}

httpServer.on('upgrade', handleWispUpgrade);

// Start HTTP Server
httpServer.listen(PORT, '0.0.0.0', () => {
  const networkIp = getNetworkIp();
  console.log(`===================================================`);
  console.log(`  SuzeNetwork Proxy Server is running!`);
  console.log(`  Local (HTTP)   : http://localhost:${PORT}/`);
  console.log(`  LAN (HTTP)     : http://${networkIp}:${PORT}/`);
});

// Start HTTPS Server for LAN devices (required for Service Workers)
const sslOptions = ensureCertificate();
if (sslOptions) {
  try {
    const httpsServer = https.createServer(sslOptions, app);
    httpsServer.on('upgrade', handleWispUpgrade);
    httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
      const networkIp = getNetworkIp();
      console.log(`  LAN (HTTPS)    : https://${networkIp}:${HTTPS_PORT}/  <-- (Use for other computers/phones on Wi-Fi)`);
      console.log(`  Wisp Secure WS : wss://${networkIp}:${HTTPS_PORT}/wisp/`);
      console.log(`===================================================`);
      console.log(`  NOTE for LAN: On other devices, open https://${networkIp}:${HTTPS_PORT}/`);
      console.log(`  and accept the self-signed certificate ("Advanced" -> "Proceed").`);
      console.log(`  This enables Service Workers and the proxy will work perfectly!`);
      console.log(`===================================================`);
    });
  } catch (err) {
    console.warn('[SSL] Could not start HTTPS server:', err.message);
  }
} else {
  console.log(`===================================================`);
}
