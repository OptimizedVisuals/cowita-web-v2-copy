/**
 * CoWiTa local development server.
 *
 * Serves the static site and mounts the real Vercel API handlers so the whole
 * form journey can be exercised in a browser without deploying:
 *
 *     node tools/dev-server.mjs            # http://localhost:4321
 *
 * Uses an in-memory Supabase stand-in, so submissions are not persisted and
 * no email is sent. Turnstile and Resend are skipped because their keys are
 * not set. Not used in production.
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { __setServiceClientForTests } from '../api/_lib/supabase.mjs';
import { createFakeSupabase } from '../tests/helpers/fake-supabase.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function resolvePort() {
  const fromArg = process.argv.find((arg) => arg.startsWith('--port='));
  if (fromArg) return Number.parseInt(fromArg.split('=')[1], 10);

  const fromEnv = Number.parseInt(process.env.PORT || '', 10);
  if (Number.isInteger(fromEnv) && fromEnv > 0) return fromEnv;

  return 4321;
}

const PORT = resolvePort();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

/* --- fake backend ------------------------------------------------------- */

const fakeSupabase = createFakeSupabase();
__setServiceClientForTests(fakeSupabase);

process.env.SUPABASE_URL = 'https://local.supabase.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'local-dev-key';
process.env.IP_HASH_PEPPER = 'local-dev-pepper';
process.env.ALLOWED_ORIGINS = `http://localhost:${PORT},http://127.0.0.1:${PORT}`;
process.env.SITE_URL = `http://localhost:${PORT}`;
process.env.RETENTION_DAYS = '730';

const routeCache = new Map();

async function loadRoute(relative) {
  if (!routeCache.has(relative)) {
    routeCache.set(
      relative,
      import(pathToFileURL(join(root, relative)).href).then((module) => module.default)
    );
  }
  return routeCache.get(relative);
}

async function resolveApi(pathname, query) {
  if (pathname === '/api/forms/__submissions') return null;

  const formMatch = pathname.match(/^\/api\/forms\/([a-z-]+)$/);
  if (formMatch) {
    const handler = await loadRoute('api/forms/[type].mjs');
    return { handler, query: { ...query, type: formMatch[1] } };
  }

  if (pathname === '/api/admin/submissions') {
    return { handler: await loadRoute('api/admin/submissions.mjs'), query };
  }

  const detailMatch = pathname.match(/^\/api\/admin\/submissions\/([0-9a-f-]+)$/i);
  if (detailMatch) {
    return {
      handler: await loadRoute('api/admin/submissions/[id].mjs'),
      query: { ...query, id: detailMatch[1] },
    };
  }

  if (pathname === '/api/admin/export') {
    return { handler: await loadRoute('api/admin/export.mjs'), query };
  }

  if (pathname === '/api/admin/me') {
    return { handler: await loadRoute('api/admin/me.mjs'), query };
  }

  if (pathname === '/api/admin/retention') {
    return { handler: await loadRoute('api/admin/retention.mjs'), query };
  }

  return null;
}

/* --- static files ------------------------------------------------------- */

async function serveStatic(req, res, pathname) {
  let target = join(root, normalize(pathname).replace(/^(\.\.[/\\])+/, ''));

  try {
    const info = await stat(target);

    if (info.isDirectory()) target = join(target, 'index.html');
  } catch {
    if (!extname(target)) {
      const withHtml = `${target}.html`;
      try {
        await stat(withHtml);
        target = withHtml;
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Not found');
      }
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
  }

  try {
    const body = await readFile(target);

    res.writeHead(200, {
      'Content-Type': MIME[extname(target).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

/* --- security headers (mirrors vercel.json) ----------------------------- */

const vercelConfig = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
const GLOBAL_HEADERS = (vercelConfig.headers || []).find(
  (entry) => entry.source === '/(.*)'
);

const PATH_HEADER_RULES = (vercelConfig.headers || []).filter((entry) => {
  if (entry.source === '/(.*)') return false;
  const prefix = entry.source.replace(/\(.*\)$/, '').replace(/\*$/, '');
  return prefix.length > 1;
});

function applySecurityHeaders(pathname, res) {
  for (const header of GLOBAL_HEADERS?.headers || []) {
    res.setHeader(header.key, header.value);
  }

  for (const rule of PATH_HEADER_RULES) {
    const prefix = rule.source.replace(/\(.*\)$/, '').replace(/\*$/, '');
    if (pathname.startsWith(prefix)) {
      for (const header of rule.headers || []) res.setHeader(header.key, header.value);
    }
  }
}

/* --- server ------------------------------------------------------------- */

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const query = Object.fromEntries(url.searchParams.entries());
  const started = Date.now();

  applySecurityHeaders(url.pathname, res);

  res.on('finish', () => {
    console.log(`${req.method} ${url.pathname} → ${res.statusCode} (${Date.now() - started}ms)`);
  });

  if (url.pathname === '/api/__submissions') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(
      JSON.stringify(
        {
          count: fakeSupabase.__state.submissions.length,
          submissions: fakeSupabase.__state.submissions,
          events: fakeSupabase.__state.submission_events,
        },
        null,
        2
      )
    );
  }

  try {
    const route = await resolveApi(url.pathname, query);

    if (route) {
      req.query = route.query;
      return route.handler(req, res);
    }

    return serveStatic(req, res, url.pathname);
  } catch (error) {
    console.error('dev server error:', error);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Internal error');
  }
});

server.listen(PORT, () => {
  console.log(`CoWiTa dev server: http://localhost:${PORT}`);
  console.log('API mounted with an in-memory database (no email, no CAPTCHA).');
});
