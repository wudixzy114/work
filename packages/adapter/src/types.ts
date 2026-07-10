import type { Role, Usage } from '@aiwf/shared';

/** 归一化的对话消息，与厂商无关。 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** 归一化的调用请求。Adapter 内部统一用它，再由各 transformer 转成厂商线格式。 */
export interface ChatRequest {
  /** 逻辑模型名，经渠道 modelMap 解析成上游真实模型名。 */
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
}

/** 归一化的调用结果。usage 来自上游真实返回。 */
export interface ChatResponse {
  text: string;
  usage: Usage;
  /** 上游实际使用的模型名。 */
  model: string;
}

/** 一次调用的观测元数据，供 client 透传给监控钩子。 */
export interface CallMeta {
  runId: string;
  role: Role;
}

/**
 * 监控钩子：client 在调用生命周期各阶段回调，由 monitor 层实现。
 * 保持 adapter 对 monitor 零依赖（依赖倒置）。
 */
export interface AdapterHooks {
  onStart?(meta: CallMeta, channelId: string, model: string): void;
  onSuccess?(
    meta: CallMeta,
    channelId: string,
    model: string,
    usage: Usage,
    latencyMs: number,
  ): void;
  onError?(
    meta: CallMeta,
    channelId: string,
    model: string,
    error: string,
    latencyMs: number,
  ): void;
  onFallback?(meta: CallMeta, fromChannelId: string, toChannelId: string): void;
}
