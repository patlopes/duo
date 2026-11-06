// Serves the published release on loopback, for the Cloudflare tunnel to expose.
// It holds no data: everything financial stays in each phone's IndexedDB.
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(process.env.DUO_RELEASE_DIR ?? join(scriptDir, '../../duo-release/current'));
const PORT = Number(process.env.PORT ?? 4180);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

/** Resolves a URL path to a file inside the release, or null. `current` is a symlink that moves. */
async function locate(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0') || decoded.split('/').some((part) => part.startsWith('.')))
    return null;

  const root = await realpath(ROOT);
  const file = resolve(root, `.${decoded}`);
  if (file !== root && !file.startsWith(root + sep)) return null;

  try {
    const info = await stat(file);
    if (info.isFile()) return { file, size: info.size };
  } catch {
    // Falls through to the app shell below.
  }
  // App routes have no extension. A missing asset must stay a 404, never HTML served as a script.
  if (extname(decoded) !== '') return null;
  const shell = join(root, 'index.html');
  return { file: shell, size: (await stat(shell)).size };
}

const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }

  try {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost');
    const found = await locate(pathname);
    if (!found) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Não encontrado');
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[extname(found.file)] ?? 'application/octet-stream',
      'Content-Length': found.size,
      // Hashed files never change. Everything else, sw.js above all, has to be revalidated
      // or phones would never hear about a new version.
      'Cache-Control': pathname.startsWith('/assets/')
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
    });
    if (req.method === 'HEAD') res.end();
    else createReadStream(found.file).pipe(res);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
});

server.listen(PORT, '127.0.0.1', () => console.log(`serving ${ROOT} on 127.0.0.1:${PORT}`));
