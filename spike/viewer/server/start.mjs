import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ogMiddleware } from './og.mjs';
import { oracleMiddleware } from './oracle.mjs';
import { trendingMiddleware } from './trending.mjs';
const root = fileURLToPath(new URL('../dist', import.meta.url));
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.woff2':'font/woff2' };
const server = createServer((req,res) => void ogMiddleware(req,res,() => oracleMiddleware(req,res,() => trendingMiddleware(req,res,async () => {
  if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405);res.end();return;}
  try {
    const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const path = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!path.startsWith(root + sep)) {res.writeHead(403);res.end();return;}
    let content;
    let extension = extname(path);
    try { content = await readFile(path); }
    catch { if(extension) throw new Error('Not found'); content=await readFile(resolve(root,'index.html'));extension='.html'; }
    res.writeHead(200, {'Content-Type':types[extension] ?? 'application/octet-stream','X-Content-Type-Options':'nosniff'});
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch {res.writeHead(404);res.end('Not found');}
}))));
server.listen(Number(process.env.PORT ?? 4173), process.env.HOST ?? '127.0.0.1', () => console.log(`Codeverse ready at http://${process.env.HOST ?? '127.0.0.1'}:${process.env.PORT ?? 4173}`));
