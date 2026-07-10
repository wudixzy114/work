import { defineStore } from 'pinia';
import { ref, shallowRef, computed } from 'vue';
import type {
  BudgetStatus,
  ChannelHealth,
  ClientMessage,
  MonitorEvent,
  MonitorSummary,
  Role,
  RunState,
  ServerMessage,
  StartRunInput,
} from '@aiwf/shared';
import { WsClient, type ConnState } from '../lib/ws.js';

const EMPTY_SUMMARY: MonitorSummary = {
  totalCalls: 0,
  totalTokens: 0,
  cachedTokens: 0,
  totalCostUsd: 0,
  fallbacks: 0,
  errors: 0,
};

/**
 * 会话核心 store。所有状态严格由服务端真实消息驱动：
 * snapshot 建立全量，run_state / monitor_* / token_delta / budget / health 增量更新。
 * 前端不做任何乐观预测。
 */
export const useSessionStore = defineStore('session', () => {
  const conn = ref<ConnState>('connecting');
  const run = shallowRef<RunState | null>(null);
  const summary = ref<MonitorSummary>({ ...EMPTY_SUMMARY });
  const events = ref<MonitorEvent[]>([]);
  const budget = ref<BudgetStatus | null>(null);
  const health = ref<Map<string, ChannelHealth>>(new Map());
  /** 每个角色当前正在流式输出的文本缓冲（真实 token 增量拼接）。 */
  const liveOutput = ref<Record<Role, string>>({
    research: '',
    execute: '',
    review: '',
  });

  let client: WsClient | null = null;
  let streamingRunId: string | null = null;

  const isRunning = computed(() => run.value?.status === 'running');
  const isPaused = computed(() => run.value?.status === 'paused');
  const activeRole = computed(() => run.value?.activeRole ?? null);
  const healthList = computed(() => [...health.value.values()]);

  function resetLive(): void {
    liveOutput.value = { research: '', execute: '', review: '' };
  }

  function apply(msg: ServerMessage): void {
    switch (msg.type) {
      case 'snapshot':
        run.value = msg.run;
        summary.value = msg.summary;
        events.value = msg.recentEvents;
        budget.value = msg.budget;
        health.value = new Map(msg.health.map((h) => [h.channelId, h]));
        break;
      case 'run_state':
        // 新一轮运行开始时清空流式缓冲
        if (msg.run.runId !== streamingRunId) {
          streamingRunId = msg.run.runId;
          resetLive();
        }
        run.value = msg.run;
        break;
      case 'token_delta':
        liveOutput.value = {
          ...liveOutput.value,
          [msg.role]: liveOutput.value[msg.role] + msg.delta,
        };
        break;
      case 'monitor_event':
        events.value = [...events.value, msg.event].slice(-500);
        break;
      case 'monitor_summary':
        summary.value = msg.summary;
        break;
      case 'channel_health': {
        const next = new Map(health.value);
        next.set(msg.health.channelId, msg.health);
        health.value = next;
        break;
      }
      case 'budget_status':
        budget.value = msg.budget;
        break;
    }
  }

  function connect(): void {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    client = new WsClient(`${proto}://${location.host}/ws`, {
      onMessage: apply,
      onState: (s) => (conn.value = s),
    });
    client.connect();
  }

  function send(msg: ClientMessage): void {
    client?.send(msg);
  }

  function startRun(input: StartRunInput): void {
    resetLive();
    send({ type: 'start', input });
  }

  function stopRun(runId: string): void {
    send({ type: 'stop', runId });
  }

  function pauseRun(runId: string): void {
    send({ type: 'pause', runId });
  }

  function resumeRun(runId: string): void {
    send({ type: 'resume', runId });
  }

  function rollback(runId: string, checkpointId: string): void {
    send({ type: 'rollback', runId, checkpointId });
  }

  return {
    conn,
    run,
    summary,
    events,
    budget,
    health,
    healthList,
    liveOutput,
    isRunning,
    isPaused,
    activeRole,
    connect,
    startRun,
    stopRun,
    pauseRun,
    resumeRun,
    rollback,
  };
});
