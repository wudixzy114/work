import { nanoid } from 'nanoid';
import type { FastifyInstance } from 'fastify';
import { ChannelInputSchema, ChannelSchema, StartRunInputSchema } from '@aiwf/shared';
import type { AppContext } from '../context.js';

/** 注册渠道 CRUD 与运行相关的 HTTP 路由。 */
export async function registerRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): Promise<void> {
  app.get('/api/health', () => ({ ok: true }));

  // ---- 渠道管理 ----
  app.get('/api/channels', () => ctx.registry.list());

  app.post('/api/channels', (req, reply) => {
    const parsed = ChannelInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues });
    }
    const channel = ChannelSchema.parse({ ...parsed.data, id: nanoid() });
    ctx.registry.upsert(channel);
    return reply.status(201).send(channel);
  });

  app.put('/api/channels/:id', (req, reply) => {
    const { id } = req.params as { id: string };
    if (!ctx.registry.get(id)) return reply.status(404).send({ error: '渠道不存在' });
    const parsed = ChannelInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues });
    }
    const channel = ChannelSchema.parse({ ...parsed.data, id });
    ctx.registry.upsert(channel);
    return channel;
  });

  app.delete('/api/channels/:id', (req, reply) => {
    const { id } = req.params as { id: string };
    const removed = ctx.registry.remove(id);
    return reply.status(removed ? 204 : 404).send();
  });

  // ---- 运行 ----
  app.post('/api/runs', (req, reply) => {
    const parsed = StartRunInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues });
    }
    const runId = ctx.controller.start(parsed.data);
    return reply.status(202).send({ runId });
  });

  app.get('/api/runs/:id/history', async (req) => {
    const { id } = req.params as { id: string };
    return ctx.orchestrator.history(id);
  });

  app.post('/api/runs/:id/rollback', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { checkpointId?: string };
    if (!body?.checkpointId) {
      return reply.status(400).send({ error: '缺少 checkpointId' });
    }
    const state = await ctx.controller.rollback(id, body.checkpointId);
    return state;
  });

  app.post('/api/runs/:id/stop', (req) => {
    const { id } = req.params as { id: string };
    ctx.controller.stop(id);
    return { ok: true };
  });
}
