import type { Channel } from '@aiwf/shared';
import type { ChatResponse } from '../types.js';
import type { ChatRequest } from '../types.js';
import type { ProtocolTransformer, StreamChunk } from './transformer.js';

interface OpenAIChoice {
  message?: { content?: string };
  delta?: { content?: string };
}
interface OpenAIUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
}
interface OpenAIResponse {
  model?: string;
  choices?: OpenAIChoice[];
  usage?: OpenAIUsage;
}

/** OpenAI /chat/completions 协议转换器。兼容大多数中转与内网端点。 */
export class OpenAITransformer implements ProtocolTransformer {
  buildRequest(channel: Channel, req: ChatRequest, resolvedModel: string) {
    return {
      url: `${channel.baseUrl.replace(/\/$/, '')}/chat/completions`,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${channel.apiKey}`,
      },
      body: {
        model: resolvedModel,
        messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
        ...(req.maxTokens != null ? { max_tokens: req.maxTokens } : {}),
        ...(req.temperature != null ? { temperature: req.temperature } : {}),
      },
    };
  }

  buildStreamRequest(channel: Channel, req: ChatRequest, resolvedModel: string) {
    const base = this.buildRequest(channel, req, resolvedModel);
    return {
      ...base,
      body: {
        ...(base.body as Record<string, unknown>),
        stream: true,
        // 要求上游在流末尾附带真实用量，保证监控数值来自实际返回。
        stream_options: { include_usage: true },
      },
    };
  }

  parseResponse(raw: unknown, resolvedModel: string): ChatResponse {
    const res = raw as OpenAIResponse;
    const text = res.choices?.[0]?.message?.content ?? '';
    const u = res.usage ?? {};
    const promptTokens = u.prompt_tokens ?? 0;
    const completionTokens = u.completion_tokens ?? 0;
    return {
      text,
      model: res.model ?? resolvedModel,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: u.total_tokens ?? promptTokens + completionTokens,
        cachedTokens: u.prompt_tokens_details?.cached_tokens ?? 0,
      },
    };
  }

  parseStreamEvent(eventData: string): StreamChunk | null {
    if (eventData === '[DONE]') return null;
    let parsed: OpenAIResponse;
    try {
      parsed = JSON.parse(eventData) as OpenAIResponse;
    } catch {
      return null;
    }
    const chunk: StreamChunk = {};
    const delta = parsed.choices?.[0]?.delta?.content;
    if (delta) chunk.delta = delta;
    if (parsed.usage) {
      const u = parsed.usage;
      const promptTokens = u.prompt_tokens ?? 0;
      const completionTokens = u.completion_tokens ?? 0;
      chunk.usage = {
        promptTokens,
        completionTokens,
        totalTokens: u.total_tokens ?? promptTokens + completionTokens,
        cachedTokens: u.prompt_tokens_details?.cached_tokens ?? 0,
      };
    }
    return chunk.delta || chunk.usage ? chunk : null;
  }
}

