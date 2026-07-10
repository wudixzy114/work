import type { Channel } from '@aiwf/shared';
import type { ChatRequest, ChatResponse } from '../types.js';
import type { ProtocolTransformer, StreamChunk } from './transformer.js';

interface AnthropicContentBlock {
  type?: string;
  text?: string;
}
interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
}
interface AnthropicResponse {
  model?: string;
  content?: AnthropicContentBlock[];
  usage?: AnthropicUsage;
}

/** 流式事件的部分结构（content_block_delta / message_start / message_delta）。 */
interface AnthropicStreamEvent {
  type?: string;
  delta?: { text?: string };
  message?: { usage?: AnthropicUsage };
  usage?: AnthropicUsage;
}

const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MAX_TOKENS = 4096;

/**
 * Anthropic /v1/messages 协议转换器。
 * 关键差异：system 单独成字段、鉴权用 x-api-key + anthropic-version、max_tokens 必填。
 * 把这些差异消解在此层，对上层暴露统一归一化接口。
 */
export class AnthropicTransformer implements ProtocolTransformer {
  buildRequest(channel: Channel, req: ChatRequest, resolvedModel: string) {
    const system = req.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    const messages = req.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }));

    return {
      url: `${channel.baseUrl.replace(/\/$/, '')}/messages`,
      headers: {
        'content-type': 'application/json',
        'x-api-key': channel.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: {
        model: resolvedModel,
        max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
        ...(system ? { system } : {}),
        ...(req.temperature != null ? { temperature: req.temperature } : {}),
        messages,
      },
    };
  }

  buildStreamRequest(channel: Channel, req: ChatRequest, resolvedModel: string) {
    const base = this.buildRequest(channel, req, resolvedModel);
    return {
      ...base,
      body: { ...(base.body as Record<string, unknown>), stream: true },
    };
  }

  parseResponse(raw: unknown, resolvedModel: string): ChatResponse {
    const res = raw as AnthropicResponse;
    const text = (res.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('');
    const u = res.usage ?? {};
    const promptTokens = u.input_tokens ?? 0;
    const completionTokens = u.output_tokens ?? 0;
    return {
      text,
      model: res.model ?? resolvedModel,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        cachedTokens: u.cache_read_input_tokens ?? 0,
      },
    };
  }

  parseStreamEvent(eventData: string): StreamChunk | null {
    let ev: AnthropicStreamEvent;
    try {
      ev = JSON.parse(eventData) as AnthropicStreamEvent;
    } catch {
      return null;
    }
    // 文本增量
    if (ev.type === 'content_block_delta' && ev.delta?.text) {
      return { delta: ev.delta.text };
    }
    // 起始用量（含输入 token）
    if (ev.type === 'message_start' && ev.message?.usage) {
      const u = ev.message.usage;
      return {
        usage: {
          promptTokens: u.input_tokens ?? 0,
          cachedTokens: u.cache_read_input_tokens ?? 0,
        },
      };
    }
    // 结束用量（含输出 token）
    if (ev.type === 'message_delta' && ev.usage) {
      return { usage: { completionTokens: ev.usage.output_tokens ?? 0 } };
    }
    return null;
  }
}

