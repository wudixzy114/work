import { z } from 'zod';
import { PhaseSchema, RoleSchema } from './phase.js';

export const RunStatusSchema = z.enum([
  'idle',
  'running',
  'paused',
  'completed',
  'failed',
  'stopped',
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

/** 单个角色节点的执行状态，驱动可视化图的实时高亮。 */
export const NodeStateSchema = z.object({
  role: RoleSchema,
  status: z.enum(['pending', 'active', 'done', 'error']),
  /** 该节点最近一次输出的上下文，供人判断是否陷入死循环。 */
  output: z.string().default(''),
});
export type NodeState = z.infer<typeof NodeStateSchema>;

/**
 * 一次编排运行的完整可观测状态。与 LangGraph checkpoint 一一对应，可持久化/恢复/回退。
 */
export const RunStateSchema = z.object({
  runId: z.string(),
  phase: PhaseSchema,
  status: RunStatusSchema,
  task: z.string(),
  /** 当前活跃角色，null 表示未开始或已结束。 */
  activeRole: RoleSchema.nullable().default(null),
  nodes: z.array(NodeStateSchema),
  /** 已完成的 研→执→审 轮次。 */
  iteration: z.number().int().nonnegative().default(0),
  /** 审查是否通过。 */
  approved: z.boolean().default(false),
  /** 当前 checkpoint id，用于时间旅行回退。 */
  checkpointId: z.string().nullable().default(null),
  updatedAt: z.number().int().nonnegative(),
});
export type RunState = z.infer<typeof RunStateSchema>;

/** 停止条件配置，控制层据此决定何时收手。 */
export const StopConditionsSchema = z.object({
  maxIterations: z.number().int().positive().default(3),
  maxTokens: z.number().int().positive().nullable().default(null),
  maxCostUsd: z.number().positive().nullable().default(null),
  /** 单次运行墙钟超时（ms）。 */
  timeoutMs: z.number().int().positive().nullable().default(null),
  /** 审查通过即停止。 */
  stopOnApproval: z.boolean().default(true),
});
export type StopConditions = z.infer<typeof StopConditionsSchema>;

/** 启动一次运行的请求。 */
export const StartRunInputSchema = z.object({
  phase: PhaseSchema,
  task: z.string().min(1),
  bindings: z.array(
    z.object({
      role: RoleSchema,
      channelId: z.string(),
      model: z.string(),
    }),
  ),
  stopConditions: StopConditionsSchema.prefault({}),
});
export type StartRunInput = z.infer<typeof StartRunInputSchema>;
