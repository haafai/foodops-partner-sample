import { createServer } from 'node:http';
import type { IncomingHttpHeaders } from 'node:http';

export interface Captured { method: string; path: string; headers: IncomingHttpHeaders; body: Buffer }
export interface CaptureServer {
  url: string;
  requests: Captured[];
  /** The next answers, first in first out; when empty the answer is 200. */
  answers: Array<{ status: number; headers?: Record<string, string> }>;
  close(): Promise<void>;
}

/** A real HTTP endpoint on a free loopback port that records what the mock posts to it. */
export async function startCapture(): Promise<CaptureServer> {
  const requests: Captured[] = [];
  const answers: CaptureServer['answers'] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      requests.push({ method: req.method ?? '', path: req.url ?? '', headers: req.headers, body: Buffer.concat(chunks) });
      const answer = answers.shift() ?? { status: 200 };
      res.writeHead(answer.status, answer.headers ?? {});
      res.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}`, requests, answers,
    close: () => new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    }),
  };
}
