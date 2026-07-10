import { z } from 'zod';
import { MonitorEventSchema, MonitorSummarySchema } from '../schemas/event.js';
import { RunStateSchema, StartRunInputSchema } from '../schemas/run.js';

/**
 * 服务端 -> 前端 的实时消息。状态全部由后端真实事件驱动，前端不做乐观更新。
 */
export const ServerMessageSchema = z.discriminatedUnion('type', [
  /** 连接建立或重连后的一次性全量快照，用于状态重放。 */
  z.object({
    type: z.literal('snapshot'),
    run: RunStateSchema.nullable(),
    summary: MonitorSummarySchema,
    recentEvents: z.array(MonitorEventSchema),
  }),
  /** 运行态变更（节点高亮、状态流转、回退等）。 */
  z.object({ type: z.literal('run_state'), run: RunStateSchema }),
  /** 新的监控事件。 */
  z.object({ type: z.literal('monitor_event'), event: MonitorEventSchema }),
  /** 汇总指标刷新。 */
  z.object({ type: z.literal('monitor_summary'), summary: MonitorSummarySchema }),
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

/**
 * 前端 -> 服务端 的控制指令。
 */
export const ClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start'), input: StartRunInputSchema }),
  z.object({ type: z.literal('pause'), runId: z.string() }),
  z.object({ type: z.literal('resume'), runId: z.string() }),
  z.object({ type: z.literal('stop'), runId: z.string() }),
  /** 时间旅行：回退到指定 checkpoint 重跑。 */
  z.object({
    type: z.literal('rollback'),
    runId: z.string(),
    checkpointId: z.string(),
  }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;
