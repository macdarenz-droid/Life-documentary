/* global URL, process */
// Serves the web export (apps/mobile/dist-web) for the Design Lab spec. Unknown paths fall back to
// index.html so expo-router can resolve client-side routes such as /design-lab.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist-web/', import.meta.url));
const port = Number(process.env.LAB_PORT ?? 4173);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.css': 'text/css',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.ico': 'image/x-icon',
};

createServer((req, res) => {
  const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/'));
  let file = join(root, path);
  if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
    file = join(root, 'index.html');
  }
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(port, () => {
  process.stdout.write(`Design Lab served on http://localhost:${port}\n`);
});
