import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  AdapterClient,
  ChannelRegistry,
  LoadBalancer,
} from '@aiwf/adapter';
import { MonitorCollector, MonitorStore } from '@aiwf/monitor';
import { Orchestrator } from '@aiwf/orchestrator';
import { Controller } from '@aiwf/control';
import type { RunState } from '@aiwf/shared';

export interface AppContext {
  registry: ChannelRegistry;
  collector: MonitorCollector;
  orchestrator: Orchestrator;
  controller: Controller;
  /** 最近一次运行态，用于新连接的快照。 */
  latestRun: () => RunState | null;
}

export interface BuildContextOptions {
  monitorDbPath: string;
  checkpointDbPath: string;
  onRunState: (state: RunState) => void;
}

/**
 * 组装五层为一个应用上下文。依赖顺序：registry → collector(hooks) → adapter client
 * → orchestrator → controller。持久化文件所在目录自动创建。
 */
export function buildContext(opts: BuildContextOptions): AppContext {
  for (const p of [opts.monitorDbPath, opts.checkpointDbPath]) {
    mkdirSync(dirname(p), { recursive: true });
  }

  const registry = new ChannelRegistry();
  const store = new MonitorStore(opts.monitorDbPath);
  const collector = new MonitorCollector(store);

  const client = new AdapterClient({
    registry,
    balancer: new LoadBalancer(),
    hooks: collector,
  });

  let latestRun: RunState | null = null;
  const orchestrator = new Orchestrator({
    client,
    checkpointDbPath: opts.checkpointDbPath,
    onRunState: (state) => {
      latestRun = state;
      opts.onRunState(state);
    },
  });

  const controller = new Controller({
    orchestrator,
    getSummary: () => collector.getSummary(),
  });

  return {
    registry,
    collector,
    orchestrator,
    controller,
    latestRun: () => latestRun,
  };
}
