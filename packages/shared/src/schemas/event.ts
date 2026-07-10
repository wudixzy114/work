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

/** 按模型/渠道维度的用量细分，用于成本归因。 */
export const UsageBreakdownSchema = z.object({
  /** 分组键（模型名或渠道 id）。 */
  key: z.string(),
  calls: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  cachedTokens: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(),
  errors: z.number().int().nonnegative(),
  /** 平均延迟（ms），无数据为 null。 */
  avgLatencyMs: z.number().nonnegative().nullable().default(null),
});
export type UsageBreakdown = z.infer<typeof UsageBreakdownSchema>;

/** 事件查询过滤条件。 */
export const EventQuerySchema = z.object({
  runId: z.string().optional(),
  channelId: z.string().optional(),
  model: z.string().optional(),
  kind: MonitorEventKindSchema.optional(),
  /** epoch ms 起止。 */
  since: z.number().int().nonnegative().optional(),
  until: z.number().int().nonnegative().optional(),
  limit: z.number().int().positive().max(1000).default(200),
});
export type EventQuery = z.infer<typeof EventQuerySchema>;

/** 预算与告警配置。 */
export const BudgetSchema = z.object({
  /** 累计成本上限（美元），null 表示不限。 */
  maxCostUsd: z.number().positive().nullable().default(null),
  /** 累计 token 上限，null 表示不限。 */
  maxTokens: z.number().int().positive().nullable().default(null),
  /** 达到上限百分比时告警（0-1）。 */
  alertThreshold: z.number().min(0).max(1).default(0.8),
});
export type Budget = z.infer<typeof BudgetSchema>;

/** 预算实时状态。 */
export const BudgetStatusSchema = z.object({
  spentUsd: z.number().nonnegative(),
  spentTokens: z.number().int().nonnegative(),
  costRatio: z.number().nonnegative().nullable().default(null),
  tokenRatio: z.number().nonnegative().nullable().default(null),
  /** 是否已触发告警阈值。 */
  alerting: z.boolean().default(false),
  /** 是否已超限。 */
  exceeded: z.boolean().default(false),
});
export type BudgetStatus = z.infer<typeof BudgetStatusSchema>;
