import { END } from '@langchain/langgraph';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { AdapterClient } from '@aiwf/adapter';
import {
  type Phase,
  type RunState,
  type RunStatus,
  type StartRunInput,
  type Role,
} from '@aiwf/shared';
import { OrchestratorState, type OrchestratorStateType } from './state.js';
import { buildGraphForPhase } from './graph/phases.js';
import { createCheckpointer, type Checkpointer } from './checkpoint.js';

export interface CheckpointRef {
  checkpointId: string;
  at: number;
}

/** 把 LangGraph 内部状态映射为对外的 RunState 快照。 */
function toRunState(
  s: OrchestratorStateType,
  status: RunStatus,
  activeRole: Role | null,
  checkpointId: string | null,
  now: number,
): RunState {
  return {
    runId: s.runId,
    phase: s.phase,
    status,
    task: s.task,
    activeRole,
    nodes: s.nodes,
    iteration: s.iteration,
    approved: s.approved,
    checkpointId,
    updatedAt: now,
  };
}

export interface OrchestratorOptions {
  client: AdapterClient;
  checkpointDbPath: string;
  now?: () => number;
  /** 每当运行态推进时回调（用于向前端广播真实状态）。 */
  onRunState?: (state: RunState) => void;
}

/**
 * 编排运行器：按阶段编译带 checkpointer 的图，负责启动、流式推进、
 * 状态映射、以及基于 checkpoint 历史的时间旅行回退。
 */
export class Orchestrator {
  private readonly client: AdapterClient;
  private readonly checkpointer: Checkpointer;
  private readonly now: () => number;
  private readonly onRunState?: (state: RunState) => void;

  constructor(opts: OrchestratorOptions) {
    this.client = opts.client;
    this.checkpointer = createCheckpointer(opts.checkpointDbPath);
    this.now = opts.now ?? (() => Date.now());
    this.onRunState = opts.onRunState;
  }

  private compile(phase: Phase) {
    return buildGraphForPhase(this.client, phase).compile({
      checkpointer: this.checkpointer,
    });
  }

  private config(runId: string): RunnableConfig {
    return { configurable: { thread_id: runId } };
  }

  /**
   * 启动一次运行并流式推进。每个节点完成后通过 onRunState 广播真实状态。
   * 返回最终 RunState。
   */
  async run(runId: string, input: StartRunInput): Promise<RunState> {
    const app = this.compile(input.phase);
    const config = this.config(runId);
    const initial = {
      runId,
      phase: input.phase,
      task: input.task,
      bindings: input.bindings,
      stopConditions: input.stopConditions,
    };

    const final = await this.streamRun(app, initial, config, runId);
    const status: RunStatus = final.approved ? 'completed' : 'stopped';
    const result = toRunState(
      final,
      status,
      null,
      await this.latestCheckpoint(runId),
      this.now(),
    );
    this.onRunState?.(result);
    return result;
  }

  /**
   * 消费双模式流（values + custom）并广播真实状态。
   * custom 的 active 信号表示某节点“正在进入”，据此把该节点点亮为 active —
   * 这是真实事件而非乐观预测。返回最终 values 状态。
   */
  private async streamRun(
    app: ReturnType<Orchestrator['compile']>,
    initial: Parameters<ReturnType<Orchestrator['compile']>['stream']>[0],
    config: RunnableConfig,
    runId: string,
  ): Promise<OrchestratorStateType> {
    let last: OrchestratorStateType | null = null;
    let activeRole: Role | null = null;
    const stream = await app.stream(initial, {
      ...config,
      streamMode: ['values', 'custom'],
    });
    for await (const [mode, data] of stream as AsyncIterable<[string, unknown]>) {
      if (mode === 'custom') {
        const signal = data as { active?: Role };
        if (signal.active) {
          activeRole = signal.active;
          if (last) {
            const nodes = last.nodes.map((n) =>
              n.role === activeRole ? { ...n, status: 'active' as const } : n,
            );
            this.onRunState?.(
              toRunState(
                { ...last, nodes },
                'running',
                activeRole,
                await this.latestCheckpoint(runId),
                this.now(),
              ),
            );
          }
        }
        continue;
      }
      // values 模式：节点完成后的完整状态
      last = data as OrchestratorStateType;
      this.onRunState?.(
        toRunState(last, 'running', null, await this.latestCheckpoint(runId), this.now()),
      );
    }
    return last ?? (await this.currentState(runId));
  }

  /** 读取某次运行的当前 checkpoint 状态（用于恢复）。 */
  async currentState(runId: string): Promise<OrchestratorStateType> {
    const app = this.compile('develop');
    const snapshot = await app.getState(this.config(runId));
    return snapshot.values as OrchestratorStateType;
  }

  /** 该次运行的全部历史 checkpoint（时间旅行候选）。 */
  async history(runId: string): Promise<CheckpointRef[]> {
    const app = this.compile('develop');
    const refs: CheckpointRef[] = [];
    for await (const snap of app.getStateHistory(this.config(runId))) {
      const id = snap.config.configurable?.['checkpoint_id'] as string | undefined;
      if (id) refs.push({ checkpointId: id, at: this.now() });
    }
    return refs;
  }

  /**
   * 时间旅行回退：从指定历史 checkpoint 恢复并继续运行。
   * 用于「审查不过 → 回退到某个更早状态重跑」。
   */
  async rollback(runId: string, phase: Phase, checkpointId: string): Promise<RunState> {
    const app = this.compile(phase);
    const forkConfig: RunnableConfig = {
      configurable: { thread_id: runId, checkpoint_id: checkpointId },
    };
    const final = await this.streamRun(app, null, forkConfig, runId);
    const result = toRunState(
      final,
      final.approved ? 'completed' : 'stopped',
      null,
      await this.latestCheckpoint(runId),
      this.now(),
    );
    this.onRunState?.(result);
    return result;
  }

  private async latestCheckpoint(runId: string): Promise<string | null> {
    const app = this.compile('develop');
    const snap = await app.getState(this.config(runId));
    return (snap.config.configurable?.['checkpoint_id'] as string | undefined) ?? null;
  }
}

export { OrchestratorState, END };
export type { OrchestratorStateType };
