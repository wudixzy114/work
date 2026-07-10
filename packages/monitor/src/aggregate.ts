import type { MonitorEvent, UsageBreakdown } from '@aiwf/shared';

/**
 * 纯聚合函数：把事件流按某一维度分组，产出成本归因细分。
 * 无任何 I/O，便于测试与复用。
 */

interface Accumulator {
  key: string;
  calls: number;
  totalTokens: number;
  cachedTokens: number;
  costUsd: number;
  errors: number;
  latencySum: number;
  latencyCount: number;
}

/** 按给定取键函数分组聚合，收敛为 UsageBreakdown 列表。 */
function breakdownBy(
  events: MonitorEvent[],
  keyOf: (event: MonitorEvent) => string,
): UsageBreakdown[] {
  const groups = new Map<string, Accumulator>();
  for (const event of events) {
    const key = keyOf(event);
    let acc = groups.get(key);
    if (!acc) {
      acc = {
        key,
        calls: 0,
        totalTokens: 0,
        cachedTokens: 0,
        costUsd: 0,
        errors: 0,
        latencySum: 0,
        latencyCount: 0,
      };
      groups.set(key, acc);
    }
    if (event.kind === 'call_success') {
      acc.calls += 1;
      if (event.usage) {
        acc.totalTokens += event.usage.totalTokens;
        acc.cachedTokens += event.usage.cachedTokens;
      }
      if (event.costUsd) acc.costUsd += event.costUsd;
    } else if (event.kind === 'call_error') {
      acc.errors += 1;
    }
    // 延迟均值取所有带 latencyMs 的事件（成功与失败均计）。
    if (event.latencyMs !== null) {
      acc.latencySum += event.latencyMs;
      acc.latencyCount += 1;
    }
  }

  return [...groups.values()]
    .map((acc) => ({
      key: acc.key,
      calls: acc.calls,
      totalTokens: acc.totalTokens,
      cachedTokens: acc.cachedTokens,
      costUsd: acc.costUsd,
      errors: acc.errors,
      avgLatencyMs: acc.latencyCount > 0 ? acc.latencySum / acc.latencyCount : null,
    }))
    .sort((a, b) => b.costUsd - a.costUsd || b.totalTokens - a.totalTokens);
}

/** 按模型维度细分成本与用量。 */
export function breakdownByModel(events: MonitorEvent[]): UsageBreakdown[] {
  return breakdownBy(events, (event) => event.model);
}

/** 按渠道维度细分成本与用量。 */
export function breakdownByChannel(events: MonitorEvent[]): UsageBreakdown[] {
  return breakdownBy(events, (event) => event.channelId);
}
