import type { Budget, BudgetStatus, MonitorEvent } from '@aiwf/shared';

/**
 * 预算追踪器：累计成功调用的真实成本与 token，实时给出告警/超限状态。
 * 只统计 call_success 事件——绝不乐观预估未落地的开销。
 */
export class BudgetTracker {
  private budget: Budget;
  private spentUsd: number;
  private spentTokens: number;

  constructor(budget: Budget, initial?: { spentUsd: number; spentTokens: number }) {
    this.budget = budget;
    this.spentUsd = initial?.spentUsd ?? 0;
    this.spentTokens = initial?.spentTokens ?? 0;
  }

  /** 累加一次调用的开销，仅成功调用计入。 */
  apply(event: MonitorEvent): void {
    if (event.kind !== 'call_success') return;
    if (event.costUsd) this.spentUsd += event.costUsd;
    if (event.usage) this.spentTokens += event.usage.totalTokens;
  }

  /** 计算当前预算状态：比率、是否告警、是否超限。 */
  status(): BudgetStatus {
    const costRatio =
      this.budget.maxCostUsd !== null ? this.spentUsd / this.budget.maxCostUsd : null;
    const tokenRatio =
      this.budget.maxTokens !== null ? this.spentTokens / this.budget.maxTokens : null;
    const ratios = [costRatio, tokenRatio].filter((r): r is number => r !== null);
    const maxRatio = ratios.length > 0 ? Math.max(...ratios) : null;
    return {
      spentUsd: this.spentUsd,
      spentTokens: this.spentTokens,
      costRatio,
      tokenRatio,
      alerting: maxRatio !== null && maxRatio >= this.budget.alertThreshold,
      exceeded: maxRatio !== null && maxRatio >= 1,
    };
  }

  /** 更换预算配置，已累计的开销保留。 */
  setBudget(budget: Budget): void {
    this.budget = budget;
  }

  /** 清零累计开销。 */
  reset(): void {
    this.spentUsd = 0;
    this.spentTokens = 0;
  }
}
