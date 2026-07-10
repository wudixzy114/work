import type { MonitorSummary, RunState, StopConditions } from '@aiwf/shared';

export interface StopDecision {
  stop: boolean;
  reason: string | null;
}

/**
 * 停止条件判定：综合运行态、监控汇总与墙钟时间，决定是否收手。
 * 兼顾业务逻辑（审查通过、最大轮次）与资源约束（token/成本/超时）。
 */
export function evaluateStop(
  conditions: StopConditions,
  run: RunState,
  summary: MonitorSummary,
  startedAt: number,
  now: number,
): StopDecision {
  if (conditions.stopOnApproval && run.approved) {
    return { stop: true, reason: '审查通过' };
  }
  if (run.iteration >= conditions.maxIterations) {
    return { stop: true, reason: `达到最大轮次 ${conditions.maxIterations}` };
  }
  if (conditions.maxTokens != null && summary.totalTokens >= conditions.maxTokens) {
    return { stop: true, reason: `达到 token 上限 ${conditions.maxTokens}` };
  }
  if (conditions.maxCostUsd != null && summary.totalCostUsd >= conditions.maxCostUsd) {
    return { stop: true, reason: `达到成本上限 $${conditions.maxCostUsd}` };
  }
  if (conditions.timeoutMs != null && now - startedAt >= conditions.timeoutMs) {
    return { stop: true, reason: `运行超时 ${conditions.timeoutMs}ms` };
  }
  return { stop: false, reason: null };
}
