import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { buildServer } from './app.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(__dirname, '../../../data');

const PORT = Number(process.env['PORT'] ?? 8787);
const HOST = process.env['HOST'] ?? '127.0.0.1';

async function main(): Promise<void> {
  const app = await buildServer({
    monitorDbPath: resolve(dataDir, 'monitor.sqlite'),
    checkpointDbPath: resolve(dataDir, 'checkpoints.sqlite'),
  });
  await app.listen({ port: PORT, host: HOST });
}

void main();
