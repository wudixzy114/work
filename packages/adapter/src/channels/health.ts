import type { Channel, ChannelHealth } from '@aiwf/shared';
import { OpenAITransformer } from '../protocol/openai.js';
import { AnthropicTransformer } from '../protocol/anthropic.js';
import type { ProtocolTransformer } from '../protocol/transformer.js';

const TRANSFORMERS: Record<string, ProtocolTransformer> = {
  openai: new OpenAITransformer(),
  anthropic: new AnthropicTransformer(),
};

/** 连续失败达到此值判定为 down。 */
const DOWN_THRESHOLD = 3;

function initial(channelId: string, now: number): ChannelHealth {
  return {
    channelId,
    status: 'unknown',
    latencyMs: null,
    circuitOpen: false,
    consecutiveFailures: 0,
    lastError: null,
    checkedAt: now,
  };
}

/**
 * 渠道健康监控。由真实调用结果与主动探活共同维护每个渠道的健康状态，
 * 供前端显示与负载均衡决策。状态变化时回调 onChange，便于服务端广播。
 */
export class HealthMonitor {
  private readonly map = new Map<string, ChannelHealth>();

  constructor(
    private readonly onChange?: (health: ChannelHealth) => void,
    private readonly now: () => number = () => Date.now(),
  ) {}

  snapshot(): ChannelHealth[] {
    return [...this.map.values()];
  }

  get(channelId: string): ChannelHealth {
    return this.map.get(channelId) ?? initial(channelId, this.now());
  }

  /** 记录一次真实调用结果，更新健康状态。 */
  recordResult(
    channelId: string,
    ok: boolean,
    latencyMs: number,
    error?: string,
  ): void {
    const prev = this.get(channelId);
    const consecutiveFailures = ok ? 0 : prev.consecutiveFailures + 1;
    const status: ChannelHealth['status'] = ok
      ? 'healthy'
      : consecutiveFailures >= DOWN_THRESHOLD
        ? 'down'
        : 'degraded';
    const next: ChannelHealth = {
      channelId,
      status,
      latencyMs,
      circuitOpen: consecutiveFailures >= DOWN_THRESHOLD,
      consecutiveFailures,
      lastError: ok ? null : (error ?? '未知错误'),
      checkedAt: this.now(),
    };
    this.set(next);
  }

  /** 主动探活：发一次最小请求，测量延迟并更新状态。 */
  async probe(channel: Channel): Promise<ChannelHealth> {
    const transformer = TRANSFORMERS[channel.kind];
    if (!transformer) {
      const h: ChannelHealth = {
        ...initial(channel.id, this.now()),
        status: 'unknown',
        lastError: `未知协议 ${channel.kind}`,
      };
      this.set(h);
      return h;
    }
    const startedAt = this.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), channel.timeoutMs);
    try {
      const { url, headers, body } = transformer.buildRequest(
        channel,
        { model: 'health-check', messages: [{ role: 'user', content: 'ping' }], maxTokens: 1 },
        channel.modelMap['health-check'] ?? 'gpt-4o-mini',
      );
      const resp = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const latencyMs = this.now() - startedAt;
      // 2xx / 4xx 都说明端点可达（4xx 多为模型名无效），仅 5xx/网络错误视为不健康。
      const ok = resp.status < 500;
      this.recordResult(channel.id, ok, latencyMs, ok ? undefined : `HTTP ${resp.status}`);
      return this.get(channel.id);
    } catch (err) {
      const latencyMs = this.now() - startedAt;
      this.recordResult(
        channel.id,
        false,
        latencyMs,
        err instanceof Error ? err.message : String(err),
      );
      return this.get(channel.id);
    } finally {
      clearTimeout(timer);
    }
  }

  private set(health: ChannelHealth): void {
    const prev = this.map.get(health.channelId);
    this.map.set(health.channelId, health);
    if (!prev || prev.status !== health.status || prev.circuitOpen !== health.circuitOpen) {
      this.onChange?.(health);
    }
  }
}
