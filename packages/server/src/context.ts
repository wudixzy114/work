import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  AdapterClient,
  ChannelRegistry,
  ChannelStore,
  HealthMonitor,
  LoadBalancer,
} from '@aiwf/adapter';
import { MonitorCollector, MonitorStore } from '@aiwf/monitor';
import { Orchestrator } from '@aiwf/orchestrator';
import {
  Controller,
  ScheduleManager,
  ScheduleStore,
} from '@aiwf/control';
import type {
  BudgetStatus,
  ChannelHealth,
  Role,
  RunState,
} from '@aiwf/shared';

export interface AppContext {
  registry: ChannelRegistry;
  channelStore: ChannelStore;
  health: HealthMonitor;
  collector: MonitorCollector;
  orchestrator: Orchestrator;
  controller: Controller;
  schedules: ScheduleManager;
  /** 最近一次运行态，用于新连接的快照。 */
  latestRun: () => RunState | null;
}

export interface BuildContextOptions {
  monitorDbPath: string;
  checkpointDbPath: string;
  channelDbPath: string;
  scheduleDbPath: string;
  onRunState: (state: RunState) => void;
  onToken: (runId: string, role: Role, delta: string) => void;
  onHealth: (health: ChannelHealth) => void;
  onBudget: (status: BudgetStatus) => void;
}

/**
 * 组装五层为一个应用上下文。依赖顺序：
 * registry(+持久化) → health → collector(hooks) → adapter client
 * → orchestrator → controller → scheduler。
 * 启动时从 SQLite 装载渠道与定时任务，保证重启后配置不丢失。
 */
export function buildContext(opts: BuildContextOptions): AppContext {
  for (const p of [
    opts.monitorDbPath,
    opts.checkpointDbPath,
    opts.channelDbPath,
    opts.scheduleDbPath,
  ]) {
    mkdirSync(dirname(p), { recursive: true });
  }

  // 渠道注册表 + 持久化，启动时装载。
  const registry = new ChannelRegistry();
  const channelStore = new ChannelStore(opts.channelDbPath);
  for (const channel of channelStore.all()) registry.upsert(channel);

  const health = new HealthMonitor(opts.onHealth);
  const monitorStore = new MonitorStore(opts.monitorDbPath);
  const collector = new MonitorCollector(monitorStore);
  collector.on('budget', (status: BudgetStatus) => opts.onBudget(status));

  const client = new AdapterClient({
    registry,
    balancer: new LoadBalancer(),
    hooks: collector,
    health,
  });

  let latestRun: RunState | null = null;
  const orchestrator = new Orchestrator({
    client,
    checkpointDbPath: opts.checkpointDbPath,
    onRunState: (state) => {
      latestRun = state;
      opts.onRunState(state);
    },
    onToken: opts.onToken,
  });

  const controller = new Controller({
    orchestrator,
    getSummary: () => collector.getSummary(),
  });

  // 定时任务：触发时经 controller 启动一次运行。
  const schedules = new ScheduleManager({
    store: new ScheduleStore(opts.scheduleDbPath),
    onTrigger: (schedule) => controller.start(schedule.runInput),
  });

  return {
    registry,
    channelStore,
    health,
    collector,
    orchestrator,
    controller,
    schedules,
    latestRun: () => latestRun,
  };
}
