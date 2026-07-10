import type { Channel, ProviderKind } from '@aiwf/shared';

interface BreakerState {
  failures: number;
  openUntil: number;
}

/**
 * 加权负载均衡 + 失败熔断。
 * - 按 weight 加权随机挑选可用渠道；
 * - 连续失败达阈值则熔断一段时间，期间跳过该渠道（触发回退到其他渠道）。
 */
export class LoadBalancer {
  private readonly breakers = new Map<string, BreakerState>();

  constructor(
    private readonly failureThreshold = 3,
    private readonly cooldownMs = 30_000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** 从候选渠道中挑一个：过滤熔断中的，再加权随机。返回 null 表示无可用渠道。 */
  pick(candidates: Channel[], kind: ProviderKind): Channel | null {
    const available = candidates.filter(
      (c) => c.enabled && c.kind === kind && !this.isOpen(c.id),
    );
    if (available.length === 0) return null;

    const totalWeight = available.reduce((sum, c) => sum + c.weight, 0);
    let roll = this.pseudoRandom() * totalWeight;
    for (const channel of available) {
      roll -= channel.weight;
      if (roll <= 0) return channel;
    }
    return available[available.length - 1] ?? null;
  }

  /** 排在 primary 之后的备选渠道，用于回退。 */
  fallbacks(candidates: Channel[], kind: ProviderKind, excludeId: string): Channel[] {
    return candidates.filter(
      (c) => c.enabled && c.kind === kind && c.id !== excludeId && !this.isOpen(c.id),
    );
  }

  recordSuccess(channelId: string): void {
    this.breakers.delete(channelId);
  }

  recordFailure(channelId: string): void {
    const state = this.breakers.get(channelId) ?? { failures: 0, openUntil: 0 };
    state.failures += 1;
    if (state.failures >= this.failureThreshold) {
      state.openUntil = this.now() + this.cooldownMs;
    }
    this.breakers.set(channelId, state);
  }

  private isOpen(channelId: string): boolean {
    const state = this.breakers.get(channelId);
    if (!state) return false;
    if (state.openUntil > this.now()) return true;
    if (state.openUntil !== 0) this.breakers.delete(channelId);
    return false;
  }

  // Date.now 允许，Math.random 在本环境不可用；用时间做弱随机源即可满足加权分布。
  private pseudoRandom(): number {
    const t = this.now();
    const x = Math.sin(t) * 10_000;
    return x - Math.floor(x);
  }
}
