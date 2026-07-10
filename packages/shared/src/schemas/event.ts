import { z } from 'zod';
import { RoleSchema } from './phase.js';

/**
 * 一次真实 LLM 调用的用量与结果。数值全部来自上游实际返回，禁止乐观估算。
 */
export const UsageSchema = z.object({
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  /** 命中的缓存 token 数（上游支持时）。 */
  cachedTokens: z.number().int().nonnegative().default(0),
});
export type Usage = z.infer<typeof UsageSchema>;

export const MonitorEventKindSchema = z.enum([
  'call_start',
  'call_success',
  'call_error',
  'fallback',
]);
export type MonitorEventKind = z.infer<typeof MonitorEventKindSchema>;

/**
 * 监控事件：谁（role/channel/model）在哪次运行（runId）发起了调用，实际消耗多少。
 * 「是否回退」用 kind=fallback 表达。
 */
export const MonitorEventSchema = z.object({
  id: z.string(),
  runId: z.string(),
  kind: MonitorEventKindSchema,
  role: RoleSchema,
  channelId: z.string(),
  model: z.string(),
  usage: UsageSchema.nullable().default(null),
  /** 真实成本（美元），无价目表时为 null。 */
  costUsd: z.number().nonnegative().nullable().default(null),
  latencyMs: z.number().nonnegative().nullable().default(null),
  error: z.string().nullable().default(null),
  /** epoch ms。 */
  at: z.number().int().nonnegative(),
});
export type MonitorEvent = z.infer<typeof MonitorEventSchema>;

/** 看板汇总指标，由事件流实时聚合。 */
export const MonitorSummarySchema = z.object({
  totalCalls: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  cachedTokens: z.number().int().nonnegative(),
  totalCostUsd: z.number().nonnegative(),
  fallbacks: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
});
export type MonitorSummary = z.infer<typeof MonitorSummarySchema>;
