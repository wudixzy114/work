import type { Channel } from '@aiwf/shared';
import type { ChatRequest, ChatResponse } from '../types.js';

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

  /** 解析上游返回的 JSON 为归一化响应。 */
  parseResponse(raw: unknown, resolvedModel: string): ChatResponse;
}
