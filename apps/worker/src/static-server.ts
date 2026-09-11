import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const CONTENT_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

function contentTypeFor(file: string): string {
  return CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
}

export interface StaticServer {
  /** Base URL (sem barra final) para montar os src dos clipes. */
  baseUrl: string;
  close: () => Promise<void>;
}

/**
 * O Remotion resolve staticFile() contra o public/ fixado em tempo de bundle,
 * e o bundle é reaproveitado entre jobs. Servimos os clipes normalizados por
 * HTTP para que cada render aponte para os seus próprios arquivos.
 */
export async function serveDirectory(dir: string): Promise<StaticServer> {
  const root = path.resolve(dir);

  const server = http.createServer((req, res) => {
    void (async () => {
      try {
        const name = path.basename(decodeURIComponent((req.url ?? '/').split('?')[0] ?? ''));
        const file = path.join(root, name);

        if (!file.startsWith(root + path.sep)) {
          res.writeHead(403).end();
          return;
        }

        const stat = await fsp.stat(file);
        const contentType = contentTypeFor(file);
        const range = req.headers.range;
        const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;

        if (match) {
          const start = match[1] ? Number(match[1]) : 0;
          const end = match[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
          res.writeHead(206, {
            'Content-Type': contentType,
            'Content-Range': `bytes ${start}-${end}/${stat.size}`,
            'Content-Length': end - start + 1,
            'Accept-Ranges': 'bytes',
          });
          fs.createReadStream(file, { start, end }).pipe(res);
          return;
        }

        res.writeHead(200, {
          'Content-Type': contentType,
          'Content-Length': stat.size,
          'Accept-Ranges': 'bytes',
        });
        fs.createReadStream(file).pipe(res);
      } catch {
        res.writeHead(404).end();
      }
    })();
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    // Porta 0: o SO escolhe uma livre, evitando colisão entre renders paralelos.
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Não foi possível determinar a porta do servidor de assets.');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
