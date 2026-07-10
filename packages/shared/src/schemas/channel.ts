import { z } from 'zod';
import { RoleSchema } from './phase.js';

/**
 * 上游厂商协议族。Adapter 层负责把它们统一成一套调用入口。
 */
export const ProviderKindSchema = z.enum(['openai', 'anthropic']);
export type ProviderKind = z.infer<typeof ProviderKindSchema>;

/**
 * 一个渠道 = 一个上游端点 + 密钥 + 模型映射 + 负载权重。
 * 借鉴 New API 的 channel 概念，把「用官方订阅还是中转还是公司内网」的差异消解在此。
 */
export const ChannelSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  kind: ProviderKindSchema,
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  /** 逻辑模型名 -> 上游真实模型名。空则透传。 */
  modelMap: z.record(z.string(), z.string()).default({}),
  /** 加权负载均衡权重，越大越优先。 */
  weight: z.number().int().positive().default(1),
  enabled: z.boolean().default(true),
  /** 单次请求超时（毫秒）。 */
  timeoutMs: z.number().int().positive().default(60_000),
  /** 失败重试次数（不含首次）。 */
  maxRetries: z.number().int().nonnegative().default(2),
});
export type Channel = z.infer<typeof ChannelSchema>;

/** 新建渠道时的输入（id 由服务端生成）。 */
export const ChannelInputSchema = ChannelSchema.omit({ id: true });
export type ChannelInput = z.infer<typeof ChannelInputSchema>;

/**
 * 渠道健康状态。由主动探活或调用结果实时更新，供前端显示与负载均衡决策。
 */
export const ChannelHealthSchema = z.object({
  channelId: z.string(),
  status: z.enum(['unknown', 'healthy', 'degraded', 'down']),
  /** 最近一次探活/调用延迟（ms）。 */
  latencyMs: z.number().nonnegative().nullable().default(null),
  /** 熔断是否打开。 */
  circuitOpen: z.boolean().default(false),
  /** 连续失败次数。 */
  consecutiveFailures: z.number().int().nonnegative().default(0),
  lastError: z.string().nullable().default(null),
  checkedAt: z.number().int().nonnegative(),
});
export type ChannelHealth = z.infer<typeof ChannelHealthSchema>;

/**
 * 角色 -> 渠道 + 模型 的绑定。
 * 例：research 绑到 Gemini Pro 渠道，execute 绑到 Claude，review 绑到 GPT-5。
 */
export const RoleBindingSchema = z.object({
  role: RoleSchema,
  channelId: z.string(),
  model: z.string().min(1),
});
export type RoleBinding = z.infer<typeof RoleBindingSchema>;
