import { EventEmitter } from 'node:events';
import { nanoid } from 'nanoid';
import {
  type Budget,
  type BudgetStatus,
  type EventQuery,
  type MonitorEvent,
  type MonitorEventKind,
  type MonitorSummary,
  type Role,
  type Usage,
  type UsageBreakdown,
} from '@aiwf/shared';
import type { AdapterHooks, CallMeta } from '@aiwf/adapter';
import type { MonitorStore } from './store.js';
import { breakdownByChannel, breakdownByModel } from './aggregate.js';
import { BudgetTracker } from './budget.js';

/** 已知模型每百万 token 的美元价格，用于估算真实成本。未知模型返回 null。 */
const PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  'gpt-5': { input: 1.25, output: 10 },
  'claude-opus-4-8': { input: 15, output: 75 },
  'claude-sonnet-5': { input: 3, output: 15 },
  'gemini-3.1-pro': { input: 1.25, output: 10 },
};

function estimateCost(model: string, usage: Usage): number | null {
  const price = PRICE_PER_MTOK[model];
  if (!price) return null;
  return (
    (usage.promptTokens * price.input + usage.completionTokens * price.output) / 1_000_000
  );
}

/**
 * 监控采集器。实现 AdapterHooks，把每一次真实调用落库并广播。
 * 汇总指标全部由已落地事件聚合而来——绝不乐观预估状态。
 */
export class MonitorCollector extends EventEmitter implements AdapterHooks {
  private readonly store: MonitorStore;
  private summary: MonitorSummary = {
    totalCalls: 0,
    totalTokens: 0,
    cachedTokens: 0,
    totalCostUsd: 0,
    fallbacks: 0,
    errors: 0,
  };
  /** 预算追踪器，未配置预算时为 null。 */
  private budgetTracker: BudgetTracker | null = null;

  constructor(
    store: MonitorStore,
    private readonly now: () => number = () => Date.now(),
    budget?: Budget,
  ) {
    super();
    this.store = store;
    this.rebuildSummary();
    if (budget) this.setBudget(budget);
  }

  getSummary(): MonitorSummary {
    return { ...this.summary };
  }

  recent(limit?: number): MonitorEvent[] {
    return this.store.recent(limit);
  }

  /**
   * 按模型或渠道维度做成本细分。给定 query 时从落库事件查询，
   * 否则退回到最近事件。
   */
  breakdown(dimension: 'model' | 'channel', q?: EventQuery): UsageBreakdown[] {
    const events = q ? this.store.query(q) : this.store.recent();
    return dimension === 'model'
      ? breakdownByModel(events)
      : breakdownByChannel(events);
  }

  /**
   * 配置/更新预算。已落库事件会被重放以恢复累计开销，
   * 保证服务重启后预算状态一致。
   */
  setBudget(budget: Budget): void {
    if (this.budgetTracker) {
      this.budgetTracker.setBudget(budget);
    } else {
      this.budgetTracker = new BudgetTracker(budget);
      for (const event of this.store.recent(10_000)) {
        this.budgetTracker.apply(event);
      }
    }
    this.emit('budget', this.budgetTracker.status());
  }

  /** 当前预算状态；未配置预算时返回 null。 */
  getBudgetStatus(): BudgetStatus | null {
    return this.budgetTracker ? this.budgetTracker.status() : null;
  }

  onStart(meta: CallMeta, channelId: string, model: string): void {
    this.record('call_start', meta.runId, meta.role, channelId, model, {});
  }

  onSuccess(
    meta: CallMeta,
    channelId: string,
    model: string,
    usage: Usage,
    latencyMs: number,
  ): void {
    this.record('call_success', meta.runId, meta.role, channelId, model, {
      usage,
      costUsd: estimateCost(model, usage),
      latencyMs,
    });
  }

  onError(
    meta: CallMeta,
    channelId: string,
    model: string,
    error: string,
    latencyMs: number,
  ): void {
    this.record('call_error', meta.runId, meta.role, channelId, model, {
      error,
      latencyMs,
    });
  }

  onFallback(meta: CallMeta, fromChannelId: string, toChannelId: string): void {
    this.record('fallback', meta.runId, meta.role, fromChannelId, '', {
      error: `回退到渠道 ${toChannelId}`,
    });
  }

  private record(
    kind: MonitorEventKind,
    runId: string,
    role: Role,
    channelId: string,
    model: string,
    extra: {
      usage?: Usage;
      costUsd?: number | null;
      latencyMs?: number;
      error?: string;
    },
  ): void {
    const event: MonitorEvent = {
      id: nanoid(),
      runId,
      kind,
      role,
      channelId,
      model,
      usage: extra.usage ?? null,
      costUsd: extra.costUsd ?? null,
      latencyMs: extra.latencyMs ?? null,
      error: extra.error ?? null,
      at: this.now(),
    };
    this.store.insert(event);
    this.applyToSummary(event);
    this.emit('event', event);
    this.emit('summary', this.getSummary());
    if (this.budgetTracker) {
      this.budgetTracker.apply(event);
      this.emit('budget', this.budgetTracker.status());
    }
  }

  private applyToSummary(event: MonitorEvent): void {
    if (event.kind === 'call_success') {
      this.summary.totalCalls += 1;
      if (event.usage) {
        this.summary.totalTokens += event.usage.totalTokens;
        this.summary.cachedTokens += event.usage.cachedTokens;
      }
      if (event.costUsd) this.summary.totalCostUsd += event.costUsd;
    } else if (event.kind === 'call_error') {
      this.summary.errors += 1;
    } else if (event.kind === 'fallback') {
      this.summary.fallbacks += 1;
    }
  }

  /** 从落库事件重建汇总（服务重启后调用，保证可恢复）。 */
  private rebuildSummary(): void {
    for (const event of this.store.recent(10_000)) {
      this.applyToSummary(event);
    }
  }
}
