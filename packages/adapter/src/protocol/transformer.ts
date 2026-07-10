import type { Channel } from '@aiwf/shared';
import type { Usage } from '@aiwf/shared';
import type { ChatRequest, ChatResponse } from '../types.js';

/** 从流式 SSE 事件解析出的增量。 */
export interface StreamChunk {
  /** 本次增量文本。 */
  delta?: string;
  /** 累积用量（部分厂商在流末尾给出）。 */
  usage?: Partial<Usage>;
}

/**
 * 协议转换器：把归一化请求转成某厂商的线格式，并把线响应解析回归一化结果。
 * 每个 provider 一个实现，避免巨型 switch，满足单一职责。
 */
export interface ProtocolTransformer {
  /** 构造上游请求的 URL、headers、body。 */
  buildRequest(
    channel: Channel,
    req: ChatRequest,
    resolvedModel: string,
  ): { url: string; headers: Record<string, string>; body: unknown };

  /** 构造流式请求（带 stream 标志）。 */
  buildStreamRequest(
    channel: Channel,
    req: ChatRequest,
    resolvedModel: string,
  ): { url: string; headers: Record<string, string>; body: unknown };

  /** 解析上游返回的 JSON 为归一化响应。 */
  parseResponse(raw: unknown, resolvedModel: string): ChatResponse;

  /** 解析单个 SSE data 负载为增量；无法解析或无意义则返回 null。 */
  parseStreamEvent(eventData: string): StreamChunk | null;
}
