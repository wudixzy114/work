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
});
export type Channel = z.infer<typeof ChannelSchema>;

/** 新建渠道时的输入（id 由服务端生成）。 */
export const ChannelInputSchema = ChannelSchema.omit({ id: true });
export type ChannelInput = z.infer<typeof ChannelInputSchema>;

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
