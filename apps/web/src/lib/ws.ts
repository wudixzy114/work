import type { ClientMessage, ServerMessage } from '@aiwf/shared';

export type ConnState = 'connecting' | 'open' | 'closed';

export interface WsClientHandlers {
  onMessage: (msg: ServerMessage) => void;
  onState: (state: ConnState) => void;
}

/**
 * WebSocket 客户端：自动重连 + 快照重放。
 * 连接建立后服务端会主动下发 snapshot，前端据此重建全量状态，
 * 因此重连即恢复，无需本地乐观缓存。
 */
export class WsClient {
  private socket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private closedByUser = false;

  constructor(
    private readonly url: string,
    private readonly handlers: WsClientHandlers,
  ) {}

  connect(): void {
    this.closedByUser = false;
    this.handlers.onState('connecting');
    const socket = new WebSocket(this.url);
    this.socket = socket;

    socket.onopen = () => this.handlers.onState('open');
    socket.onclose = () => {
      this.handlers.onState('closed');
      if (!this.closedByUser) this.scheduleReconnect();
    };
    socket.onerror = () => socket.close();
    socket.onmessage = (ev: MessageEvent<string>) => {
      try {
        this.handlers.onMessage(JSON.parse(ev.data) as ServerMessage);
      } catch {
        // 忽略无法解析的帧
      }
    };
  }

  send(msg: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(msg));
    }
  }

  close(): void {
    this.closedByUser = true;
    if (this.reconnectTimer != null) window.clearTimeout(this.reconnectTimer);
    this.socket?.close();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer != null) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = window.setTimeout(() => this.connect(), 1500);
  }
}
