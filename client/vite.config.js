import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'html-placeholders',
      apply: 'serve',
      transformIndexHtml(html) {
        const appUrl = process.env.VITE_APP_URL || process.env.APP_URL || ''
        const spki = process.env.VITE_DASHBOARD_SPKI || ''
        return html
          .replace(/__APP_URL__/g, appUrl)
          .replace(/__DASH_K__/g, spki)
      },
    },
    {
      name: 'local-key-sync-server',
      configureServer(server) {
        const ALL_BOT_DB_PATHS = [
          'C:\\Users\\RAKHA\\Desktop\\RAKHAS TWEAKS PROJECT\\RAKHA DILV BOT\\database.json',
          'C:\\Users\\RAKHA\\Desktop\\RAKHAS TWEAKS PROJECT\\RAKHA AUTH\\bot\\database.json',
          'C:\\Users\\RAKHA\\Desktop\\RAKHAS TWEAKS PROJECT\\RAKHA AUTH & TWEAKS APP ON RENDER HOST\\bot\\database.json',
          path.resolve(__dirname, '../bot/database.json'),
          'C:\\Users\\RAKHA\\Desktop\\حمايه رخا\\حمايه رخا\\Rakha Auth\\bot\\database.json'
        ];

        server.middlewares.use(async (req, res, next) => {
          if (req.url === '/api/local-sync-key' && req.method === 'POST') {
            try {
              let body = '';
              req.on('data', chunk => { body += chunk; });
              req.on('end', () => {
                try {
                  const data = JSON.parse(body || '{}');
                  const botDbPaths = ALL_BOT_DB_PATHS;
                  for (const p of botDbPaths) {
                    try {
                      let db = { keys: {} };
                      if (fs.existsSync(p)) {
                        db = JSON.parse(fs.readFileSync(p, 'utf8')) || { keys: {} };
                      }
                      if (!db.keys) db.keys = {};
                      db.keys[data.key] = {
                        key: data.key,
                        name: data.clientName || data.name || 'Rakha Client',
                        days: data.duration === 0 ? 'lifetime' : String(data.duration || 30),
                        customAvatar: data.customAvatar || null,
                        userId: data.discordUserId || data.userId || '',
                        status: 'unused',
                        createdAt: data.createdAt || new Date().toISOString(),
                        activatedAt: null,
                        hwid: null,
                        generatedBy: 'dashboard'
                      };
                      fs.writeFileSync(p, JSON.stringify(db, null, 2), 'utf8');
                    } catch (err) {}
                  }
                  res.statusCode = 200;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ success: true, message: 'Key synced to database.json successfully' }));
                } catch (err) {
                  res.statusCode = 400;
                  res.end(JSON.stringify({ error: err.message }));
                }
              });
            } catch (err) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
            return;
          }

          if (req.url === '/api/local-keys' && req.method === 'GET') {
            try {
              let keys = {};
              for (const p of ALL_BOT_DB_PATHS) {
                if (fs.existsSync(p)) {
                  try {
                    const db = JSON.parse(fs.readFileSync(p, 'utf8')) || {};
                    if (db.keys && Object.keys(db.keys).length > 0) {
                      keys = db.keys;
                      break;
                    }
                  } catch (e) {}
                }
              }
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, keys }));
            } catch (err) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
            return;
          }

          if (req.url === '/api/local-delete-key' && req.method === 'POST') {
            try {
              let body = '';
              req.on('data', chunk => { body += chunk; });
              req.on('end', () => {
                try {
                  const { key, keys } = JSON.parse(body || '{}');
                  const keysToDelete = keys || (key ? [key] : []);
                  const botDbPaths = ALL_BOT_DB_PATHS;
                  for (const p of botDbPaths) {
                    if (fs.existsSync(p)) {
                      try {
                        const db = JSON.parse(fs.readFileSync(p, 'utf8')) || {};
                        if (db.keys) {
                          keysToDelete.forEach(k => delete db.keys[k]);
                          fs.writeFileSync(p, JSON.stringify(db, null, 2), 'utf8');
                        }
                      } catch (e) {}
                    }
                  }
                  res.statusCode = 200;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ success: true, deleted: keysToDelete.length }));
                } catch (err) {
                  res.statusCode = 400;
                  res.end(JSON.stringify({ error: err.message }));
                }
              });
            } catch (err) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
            return;
          }

          if (req.url === '/api/local-ban-key' && req.method === 'POST') {
            try {
              let body = '';
              req.on('data', chunk => { body += chunk; });
              req.on('end', () => {
                try {
                  const { key, reason, status } = JSON.parse(body || '{}');
                  const targetStatus = status || 'banned';
                  const botDbPaths = ALL_BOT_DB_PATHS;
                  for (const p of botDbPaths) {
                    if (fs.existsSync(p)) {
                      try {
                        const db = JSON.parse(fs.readFileSync(p, 'utf8')) || {};
                        if (db.keys && db.keys[key]) {
                          db.keys[key].status = targetStatus;
                          if (reason) db.keys[key].banReason = reason;
                          db.keys[key].bannedAt = new Date().toISOString();
                          fs.writeFileSync(p, JSON.stringify(db, null, 2), 'utf8');
                        }
                      } catch (e) {}
                    }
                  }
                  res.statusCode = 200;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ success: true, message: 'Key banned successfully' }));
                } catch (err) {
                  res.statusCode = 400;
                  res.end(JSON.stringify({ error: err.message }));
                }
              });
            } catch (err) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
            return;
          }

          if (req.url === '/api/local-update-key' && req.method === 'POST') {
            try {
              let body = '';
              req.on('data', chunk => { body += chunk; });
              req.on('end', () => {
                try {
                  const { key, updates } = JSON.parse(body || '{}');
                  const botDbPaths = ALL_BOT_DB_PATHS;
                  for (const p of botDbPaths) {
                    if (fs.existsSync(p)) {
                      try {
                        const db = JSON.parse(fs.readFileSync(p, 'utf8')) || {};
                        if (db.keys && db.keys[key]) {
                          Object.assign(db.keys[key], updates || {});
                          fs.writeFileSync(p, JSON.stringify(db, null, 2), 'utf8');
                        }
                      } catch (e) {}
                    }
                  }
                  res.statusCode = 200;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ success: true, message: 'Key updated successfully' }));
                } catch (err) {
                  res.statusCode = 400;
                  res.end(JSON.stringify({ error: err.message }));
                }
              });
            } catch (err) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
            return;
          }

          if (req.url === '/api/app-status' && req.method === 'GET') {
            try {
              let status = 'active';
              let message = '';
              for (const p of ALL_BOT_DB_PATHS) {
                if (fs.existsSync(p)) {
                  try {
                    const db = JSON.parse(fs.readFileSync(p, 'utf8')) || {};
                    if (db.appStatus) {
                      status = db.appStatus;
                      message = db.appUpdateMessage || '';
                      break;
                    }
                  } catch (e) {}
                }
              }
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, status, message }));
            } catch (err) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
            return;
          }

          if (req.url === '/api/app-status' && req.method === 'POST') {
            try {
              let body = '';
              req.on('data', chunk => { body += chunk; });
              req.on('end', () => {
                try {
                  const { status, message } = JSON.parse(body || '{}');
                  const botDbPaths = ALL_BOT_DB_PATHS;
                  for (const p of botDbPaths) {
                    if (fs.existsSync(p)) {
                      try {
                        const db = JSON.parse(fs.readFileSync(p, 'utf8')) || {};
                        db.appStatus = status || 'active';
                        if (message !== undefined) db.appUpdateMessage = message;
                        fs.writeFileSync(p, JSON.stringify(db, null, 2), 'utf8');
                      } catch (e) {}
                    }
                  }
                  res.statusCode = 200;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ success: true, status, message }));
                } catch (err) {
                  res.statusCode = 400;
                  res.end(JSON.stringify({ error: err.message }));
                }
              });
            } catch (err) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
            return;
          }

          next();
        });
      }
    }
  ],
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY || 'http://127.0.0.1:5050',
        changeOrigin: true,
        secure: false,
        xfwd: true,
      }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    cssCodeSplit: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')
            || id.includes('node_modules/react-router-dom')) {
            return 'react';
          }
          return undefined;
        },
      },
    },
  }
})
