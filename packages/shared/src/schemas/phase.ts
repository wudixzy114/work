import { z } from 'zod';

/**
 * 业务连接层的五个阶段。
 * 首里程碑 dev 跑通，其余四阶段留同构骨架。
 */
export const PhaseSchema = z.enum([
  'develop',
  'fix',
  'refactor',
  'maintain',
  'release',
]);
export type Phase = z.infer<typeof PhaseSchema>;

export const PHASE_LABELS: Record<Phase, string> = {
  develop: '开发',
  fix: '修复',
  refactor: '重构',
  maintain: '维护',
  release: '上线',
};

/**
 * 三模型协作角色：调研（强模型）→ 执行（执行模型）→ 审查（最强模型）。
 */
export const RoleSchema = z.enum(['research', 'execute', 'review']);
export type Role = z.infer<typeof RoleSchema>;

export const ROLE_LABELS: Record<Role, string> = {
  research: '调研',
  execute: '执行',
  review: '审查',
};
