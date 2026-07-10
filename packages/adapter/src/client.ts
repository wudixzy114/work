import type { Channel, ProviderKind } from '@aiwf/shared';
import type { ProtocolTransformer } from './protocol/transformer.js';
import { OpenAITransformer } from './protocol/openai.js';
import { AnthropicTransformer } from './protocol/anthropic.js';
import type { ChannelRegistry } from './channels/registry.js';
import { LoadBalancer } from './channels/balancer.js';
import type { AdapterHooks, CallMeta, ChatRequest, ChatResponse } from './types.js';

const TRANSFORMERS: Record<ProviderKind, ProtocolTransformer> = {
  openai: new OpenAITransformer(),
  anthropic: new AnthropicTransformer(),
};

export interface AdapterClientOptions {
  registry: ChannelRegistry;
  balancer?: LoadBalancer;
  hooks?: AdapterHooks;
  now?: () => number;
}

/**
 * 统一调用入口。上层只提供「逻辑模型 + 消息 + 目标渠道」，
 * 由本层完成模型名解析、协议转换、真实 HTTP 调用、失败回退与监控埋点。
 */
export class AdapterClient {
  private readonly registry: ChannelRegistry;
  private readonly balancer: LoadBalancer;
  private readonly hooks: AdapterHooks;
  private readonly now: () => number;

  constructor(opts: AdapterClientOptions) {
    this.registry = opts.registry;
    this.balancer = opts.balancer ?? new LoadBalancer();
    this.hooks = opts.hooks ?? {};
    this.now = opts.now ?? (() => Date.now());
  }

  /**
   * 用指定渠道发起一次调用；失败则在同协议族内回退到其他可用渠道。
   */
  async chat(
    channelId: string,
    req: ChatRequest,
    meta: CallMeta,
  ): Promise<ChatResponse> {
    const primary = this.registry.get(channelId);
    if (!primary) throw new Error(`未知渠道: ${channelId}`);

    const chain = [primary, ...this.balancer.fallbacks(
      this.registry.listEnabled(),
      primary.kind,
      primary.id,
    )];

    let lastError: unknown;
    for (let i = 0; i < chain.length; i++) {
      const channel = chain[i];
      if (!channel) continue;
      if (i > 0) {
        const prev = chain[i - 1];
        if (prev) this.hooks.onFallback?.(meta, prev.id, channel.id);
      }
      try {
        return await this.callOne(channel, req, meta);
      } catch (err) {
        lastError = err;
        this.balancer.recordFailure(channel.id);
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error('所有候选渠道均调用失败');
  }

  private async callOne(
    channel: Channel,
    req: ChatRequest,
    meta: CallMeta,
  ): Promise<ChatResponse> {
    const transformer = TRANSFORMERS[channel.kind];
    const resolvedModel = this.registry.resolveModel(channel.id, req.model);
    const { url, headers, body } = transformer.buildRequest(channel, req, resolvedModel);

    this.hooks.onStart?.(meta, channel.id, resolvedModel);
    const startedAt = this.now();
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const detail = await resp.text().catch(() => '');
        throw new Error(`上游 ${resp.status}: ${detail.slice(0, 500)}`);
      }
      const json: unknown = await resp.json();
      const parsed = transformer.parseResponse(json, resolvedModel);
      const latencyMs = this.now() - startedAt;
      this.balancer.recordSuccess(channel.id);
      this.hooks.onSuccess?.(meta, channel.id, resolvedModel, parsed.usage, latencyMs);
      return parsed;
    } catch (err) {
      const latencyMs = this.now() - startedAt;
      const message = err instanceof Error ? err.message : String(err);
      this.hooks.onError?.(meta, channel.id, resolvedModel, message, latencyMs);
      throw err;
    }
  }
}
