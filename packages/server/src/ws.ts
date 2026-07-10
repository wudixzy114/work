import type { WebSocket } from 'ws';
import {
  ClientMessageSchema,
  type BudgetStatus,
  type ChannelHealth,
  type MonitorEvent,
  type MonitorSummary,
  type Role,
  type RunState,
  type ServerMessage,
} from '@aiwf/shared';
import type { AppContext } from './context.js';

/**
 * WebSocket 广播中枢。把 monitor / orchestrator / health 的真实事件推给所有连接，
 * 并处理前端下发的控制指令。新连接先收一份全量快照以支持状态重放。
 * 状态一律来自后端真实事件，不做乐观更新。
 */
export class WsHub {
  private readonly clients = new Set<WebSocket>();

  constructor(private readonly ctx: AppContext) {
    ctx.collector.on('event', (event: MonitorEvent) =>
      this.broadcast({ type: 'monitor_event', event }),
    );
    ctx.collector.on('summary', (summary: MonitorSummary) =>
      this.broadcast({ type: 'monitor_summary', summary }),
    );
  }

  /** orchestrator 推进时由 context 调用，广播真实运行态。 */
  pushRunState(run: RunState): void {
    this.broadcast({ type: 'run_state', run });
  }

  /** 逐 token 输出，广播给前端实时渲染。 */
  pushToken(runId: string, role: Role, delta: string): void {
    this.broadcast({ type: 'token_delta', runId, role, delta });
  }

  /** 渠道健康变化广播。 */
  pushHealth(health: ChannelHealth): void {
    this.broadcast({ type: 'channel_health', health });
  }

  /** 预算状态变化广播。 */
  pushBudget(budget: BudgetStatus): void {
    this.broadcast({ type: 'budget_status', budget });
  }

  add(socket: WebSocket): void {
    this.clients.add(socket);
    this.sendSnapshot(socket);
    socket.on('message', (raw: Buffer) => this.onMessage(raw));
    socket.on('close', () => this.clients.delete(socket));
    socket.on('error', () => this.clients.delete(socket));
  }

  private sendSnapshot(socket: WebSocket): void {
    const snapshot: ServerMessage = {
      type: 'snapshot',
      run: this.ctx.latestRun(),
      summary: this.ctx.collector.getSummary(),
      recentEvents: this.ctx.collector.recent(200),
      health: this.ctx.health.snapshot(),
      budget: this.ctx.collector.getBudgetStatus(),
    };
    this.send(socket, snapshot);
  }

  private onMessage(raw: Buffer): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.toString());
    } catch {
      return;
    }
    const result = ClientMessageSchema.safeParse(parsed);
    if (!result.success) return;
    const msg = result.data;
    switch (msg.type) {
      case 'start':
        this.ctx.controller.start(msg.input);
        break;
      case 'stop':
        this.ctx.controller.stop(msg.runId);
        break;
      case 'pause':
        this.ctx.controller.pause(msg.runId);
        break;
      case 'resume':
        this.ctx.controller.resume(msg.runId);
        break;
      case 'rollback':
        void this.ctx.controller.rollback(msg.runId, msg.checkpointId);
        break;
    }
  }

  private broadcast(message: ServerMessage): void {
    for (const socket of this.clients) this.send(socket, message);
  }

  private send(socket: WebSocket, message: ServerMessage): void {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }
}
