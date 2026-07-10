import type { Channel } from '@aiwf/shared';
import type { ChatRequest, ChatResponse } from '../types.js';
import type { ProtocolTransformer } from './transformer.js';

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
}
