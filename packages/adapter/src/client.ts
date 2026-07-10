import type { Channel, ProviderKind, Usage } from '@aiwf/shared';
import type { ProtocolTransformer, StreamChunk } from './protocol/transformer.js';
import { OpenAITransformer } from './protocol/openai.js';
import { AnthropicTransformer } from './protocol/anthropic.js';
import type { ChannelRegistry } from './channels/registry.js';
import { LoadBalancer } from './channels/balancer.js';
import type { HealthMonitor } from './channels/health.js';
import type { AdapterHooks, CallMeta, ChatRequest, ChatResponse } from './types.js';

const TRANSFORMERS: Record<ProviderKind, ProtocolTransformer> = {
  openai: new OpenAITransformer(),
  anthropic: new AnthropicTransformer(),
};

/** 退避基数与上限（毫秒）。 */
const BACKOFF_BASE_MS = 300;
const BACKOFF_CAP_MS = 4_000;

export interface AdapterClientOptions {
  registry: ChannelRegistry;
  balancer?: LoadBalancer;
  hooks?: AdapterHooks;
  health?: HealthMonitor;
  now?: () => number;
}

/** 一次上游调用可重试性判定所需的错误信息。 */
class UpstreamError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 统一调用入口。上层只提供「逻辑模型 + 消息 + 目标渠道」，
 * 由本层完成模型名解析、协议转换、真实 HTTP 调用、超时、重试退避、
 * 失败回退、健康记录与监控埋点。
 */
export class AdapterClient {
  private readonly registry: ChannelRegistry;
  private readonly balancer: LoadBalancer;
  private readonly hooks: AdapterHooks;
  private readonly health?: HealthMonitor;
  private readonly now: () => number;

  constructor(opts: AdapterClientOptions) {
    this.registry = opts.registry;
    this.balancer = opts.balancer ?? new LoadBalancer();
    this.hooks = opts.hooks ?? {};
    this.health = opts.health;
    this.now = opts.now ?? (() => Date.now());
  }

  /** 非流式调用；失败在同协议族内重试并回退。 */
  async chat(channelId: string, req: ChatRequest, meta: CallMeta): Promise<ChatResponse> {
    return this.withFallback(channelId, meta, (channel) =>
      this.callWithRetry(channel, req, meta, undefined),
    );
  }

  /** 流式调用；逐 token 回调 onDelta。失败在同协议族内重试并回退。 */
  async chatStream(
    channelId: string,
    req: ChatRequest,
    meta: CallMeta,
    onDelta: (delta: string) => void,
  ): Promise<ChatResponse> {
    return this.withFallback(channelId, meta, (channel) =>
      this.callWithRetry(channel, req, meta, onDelta),
    );
  }

  /** 构造 主→备 渠道链，逐个尝试；失败时发 fallback 埋点。 */
  private async withFallback(
    channelId: string,
    meta: CallMeta,
    attempt: (channel: Channel) => Promise<ChatResponse>,
  ): Promise<ChatResponse> {
    const primary = this.registry.get(channelId);
    if (!primary) throw new Error(`未知渠道: ${channelId}`);

    const chain = [
      primary,
      ...this.balancer.fallbacks(this.registry.listEnabled(), primary.kind, primary.id),
    ];

    let lastError: unknown;
    for (let i = 0; i < chain.length; i++) {
      const channel = chain[i];
      if (!channel) continue;
      if (i > 0) {
        const prev = chain[i - 1];
        if (prev) this.hooks.onFallback?.(meta, prev.id, channel.id);
      }
      try {
        const res = await attempt(channel);
        this.balancer.recordSuccess(channel.id);
        return res;
      } catch (err) {
        lastError = err;
        this.balancer.recordFailure(channel.id);
      }
    }
    throw lastError instanceof Error ? lastError : new Error('所有候选渠道均调用失败');
  }

  /** 对单个渠道按 maxRetries 做指数退避重试。 */
  private async callWithRetry(
    channel: Channel,
    req: ChatRequest,
    meta: CallMeta,
    onDelta: ((delta: string) => void) | undefined,
  ): Promise<ChatResponse> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= channel.maxRetries; attempt++) {
      try {
        return await this.callOnce(channel, req, meta, onDelta);
      } catch (err) {
        lastError = err;
        const retryable = err instanceof UpstreamError ? err.retryable : true;
        if (!retryable || attempt === channel.maxRetries) break;
        const backoff = Math.min(BACKOFF_BASE_MS * 2 ** attempt, BACKOFF_CAP_MS);
        await sleep(backoff);
      }
    }
    throw lastError instanceof Error ? lastError : new Error('调用失败');
  }

  /** 单次真实调用（流式或非流式），含超时、埋点、健康记录。 */
  private async callOnce(
    channel: Channel,
    req: ChatRequest,
    meta: CallMeta,
    onDelta: ((delta: string) => void) | undefined,
  ): Promise<ChatResponse> {
    const transformer = TRANSFORMERS[channel.kind];
    const resolvedModel = this.registry.resolveModel(channel.id, req.model);
    const streaming = onDelta != null;
    const { url, headers, body } = streaming
      ? transformer.buildStreamRequest(channel, req, resolvedModel)
      : transformer.buildRequest(channel, req, resolvedModel);

    this.hooks.onStart?.(meta, channel.id, resolvedModel);
    const startedAt = this.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), channel.timeoutMs);
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!resp.ok) {
        const detail = await resp.text().catch(() => '');
        // 4xx（除 429）不可重试；429 与 5xx 可重试。
        const retryable = resp.status === 429 || resp.status >= 500;
        throw new UpstreamError(`上游 ${resp.status}: ${detail.slice(0, 300)}`, retryable);
      }

      const parsed = streaming
        ? await this.consumeStream(resp, transformer, resolvedModel, onDelta)
        : transformer.parseResponse(await resp.json(), resolvedModel);

      const latencyMs = this.now() - startedAt;
      this.hooks.onSuccess?.(meta, channel.id, resolvedModel, parsed.usage, latencyMs);
      this.health?.recordResult(channel.id, true, latencyMs);
      return parsed;
    } catch (err) {
      const latencyMs = this.now() - startedAt;
      const aborted = controller.signal.aborted;
      const message = aborted
        ? `请求超时（${channel.timeoutMs}ms）`
        : err instanceof Error
          ? err.message
          : String(err);
      this.hooks.onError?.(meta, channel.id, resolvedModel, message, latencyMs);
      this.health?.recordResult(channel.id, false, latencyMs, message);
      if (aborted) throw new UpstreamError(message, true);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /** 读取 SSE 流，累积文本与用量，逐 token 回调。 */
  private async consumeStream(
    resp: Response,
    transformer: ProtocolTransformer,
    resolvedModel: string,
    onDelta: (delta: string) => void,
  ): Promise<ChatResponse> {
    const body = resp.body;
    if (!body) throw new UpstreamError('流式响应无 body', true);
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let text = '';
    const usage: Usage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cachedTokens: 0,
    };

    const applyChunk = (chunk: StreamChunk): void => {
      if (chunk.delta) {
        text += chunk.delta;
        onDelta(chunk.delta);
      }
      if (chunk.usage) mergeUsage(usage, chunk.usage);
    };

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE 事件以空行分隔。
      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        for (const line of rawEvent.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const data = trimmed.slice(5).trim();
          const chunk = transformer.parseStreamEvent(data);
          if (chunk) applyChunk(chunk);
        }
      }
    }

    usage.totalTokens = usage.promptTokens + usage.completionTokens;
    return { text, model: resolvedModel, usage };
  }
}

/** 就地合并部分用量到累计用量。 */
function mergeUsage(target: Usage, partial: Partial<Usage>): void {
  if (partial.promptTokens != null) target.promptTokens = partial.promptTokens;
  if (partial.completionTokens != null) target.completionTokens = partial.completionTokens;
  if (partial.cachedTokens != null) target.cachedTokens = partial.cachedTokens;
  if (partial.totalTokens != null) target.totalTokens = partial.totalTokens;
}
