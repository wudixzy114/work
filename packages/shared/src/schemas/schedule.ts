import { z } from 'zod';
import { StartRunInputSchema } from './run.js';

/**
 * 定时任务：按 cron 表达式在未来触发一次编排运行。
 * 让工作流可无人值守地周期性执行（如每晚跑一轮维护阶段）。
 */
export const ScheduleSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  /** 标准 5 段 cron 表达式。 */
  cronExpr: z.string().min(1),
  enabled: z.boolean().default(true),
  /** 触发时用于启动运行的输入。 */
  runInput: StartRunInputSchema,
  /** 上次触发的 epoch ms，从未触发为 null。 */
  lastRunAt: z.number().int().nonnegative().nullable().default(null),
  createdAt: z.number().int().nonnegative(),
});
export type Schedule = z.infer<typeof ScheduleSchema>;

/** 新建定时任务的输入（id/createdAt 由服务端生成）。 */
export const ScheduleInputSchema = ScheduleSchema.omit({
  id: true,
  createdAt: true,
  lastRunAt: true,
});
export type ScheduleInput = z.infer<typeof ScheduleInputSchema>;
