import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import type { WebSocket } from 'ws';
import { buildContext } from './context.js';
import { WsHub } from './ws.js';
import { registerRoutes } from './routes/index.js';

export interface ServerConfig {
  monitorDbPath: string;
  checkpointDbPath: string;
}

/** 构建并装配 Fastify 应用：CORS、WebSocket、HTTP 路由、实时广播。 */
export async function buildServer(config: ServerConfig): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });
  await app.register(websocket);

  const hubRef: { current: WsHub | undefined } = { current: undefined };
  const ctx = buildContext({
    monitorDbPath: config.monitorDbPath,
    checkpointDbPath: config.checkpointDbPath,
    onRunState: (state) => hubRef.current?.pushRunState(state),
  });
  hubRef.current = new WsHub(ctx);

  await registerRoutes(app, ctx);

  app.get('/ws', { websocket: true }, (socket: WebSocket) => {
    hubRef.current?.add(socket);
  });

  return app;
}
