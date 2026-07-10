import type { Channel } from '@aiwf/shared';
import type { ChatResponse } from '../types.js';
import type { ChatRequest } from '../types.js';
import type { ProtocolTransformer } from './transformer.js';

interface OpenAIChoice {
  message?: { content?: string };
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
}
