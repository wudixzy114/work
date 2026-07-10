import { nanoid } from 'nanoid';
import type { FastifyInstance } from 'fastify';
import {
  ChannelInputSchema,
  ChannelSchema,
  ScheduleInputSchema,
  StartRunInputSchema,
} from '@aiwf/shared';
import type { AppContext } from '../context.js';

/** 注册渠道 / 运行 / 监控 / 定时任务的 HTTP 路由。 */
export async function registerRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): Promise<void> {
  app.get('/api/health', () => ({ ok: true }));

  // ---- 渠道管理（写操作同步落库） ----
  app.get('/api/channels', () => ctx.registry.list());

  app.post('/api/channels', (req, reply) => {
    const parsed = ChannelInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues });
    }
    const channel = ChannelSchema.parse({ ...parsed.data, id: nanoid() });
    ctx.registry.upsert(channel);
    ctx.channelStore.upsert(channel);
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
    ctx.channelStore.upsert(channel);
    return channel;
  });

  app.delete('/api/channels/:id', (req, reply) => {
    const { id } = req.params as { id: string };
    const removed = ctx.registry.remove(id);
    ctx.channelStore.remove(id);
    return reply.status(removed ? 204 : 404).send();
  });

  /** 主动探活一个渠道；结果同时经 WS 广播。 */
  app.post('/api/channels/:id/probe', async (req, reply) => {
    const { id } = req.params as { id: string };
    const channel = ctx.registry.get(id);
    if (!channel) return reply.status(404).send({ error: '渠道不存在' });
    return ctx.health.probe(channel);
  });

  app.get('/api/health/channels', () => ctx.health.snapshot());

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

  app.get('/api/runs/:id/events', (req) => {
    const { id } = req.params as { id: string };
    return ctx.collector.recent(1000).filter((e) => e.runId === id);
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

  app.post('/api/runs/:id/pause', (req) => {
    const { id } = req.params as { id: string };
    ctx.controller.pause(id);
    return { ok: true };
  });

  app.post('/api/runs/:id/resume', (req) => {
    const { id } = req.params as { id: string };
    ctx.controller.resume(id);
    return { ok: true };
  });

  // ---- 监控查询与成本归因 ----
  app.get('/api/monitor/summary', () => ctx.collector.getSummary());

  app.get('/api/monitor/breakdown', (req) => {
    const { dimension } = req.query as { dimension?: string };
    const dim = dimension === 'channel' ? 'channel' : 'model';
    return ctx.collector.breakdown(dim);
  });

  // ---- 定时任务 CRUD ----
  app.get('/api/schedules', () => ctx.schedules.list());

  app.post('/api/schedules', (req, reply) => {
    const parsed = ScheduleInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues });
    }
    try {
      const schedule = ctx.schedules.create(parsed.data);
      return reply.status(201).send(schedule);
    } catch (e) {
      return reply.status(400).send({ error: e instanceof Error ? e.message : '创建失败' });
    }
  });

  app.patch('/api/schedules/:id/enabled', (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { enabled?: boolean };
    const updated = ctx.schedules.setEnabled(id, body?.enabled ?? false);
    if (!updated) return reply.status(404).send({ error: '定时任务不存在' });
    return updated;
  });

  app.delete('/api/schedules/:id', (req, reply) => {
    const { id } = req.params as { id: string };
    const removed = ctx.schedules.remove(id);
    return reply.status(removed ? 204 : 404).send();
  });
}
