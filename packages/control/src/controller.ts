import { nanoid } from 'nanoid';
import {
  type Phase,
  type RunState,
  type StartRunInput,
  type MonitorSummary,
} from '@aiwf/shared';
import type { Orchestrator } from '@aiwf/orchestrator';
import { evaluateStop } from './conditions.js';

interface ActiveRun {
  runId: string;
  phase: Phase;
  input: StartRunInput;
  startedAt: number;
  status: RunState['status'];
}

export interface ControllerOptions {
  orchestrator: Orchestrator;
  getSummary: () => MonitorSummary;
  now?: () => number;
}

/**
 * 核心控制层：决定何时开始/停止一次运行，跟踪活跃运行，并在推进中评估停止条件。
 * 起停基于 orchestrator 的能力；停止条件综合业务与资源约束。
 */
export class Controller {
  private readonly orchestrator: Orchestrator;
  private readonly getSummary: () => MonitorSummary;
  private readonly now: () => number;
  private readonly runs = new Map<string, ActiveRun>();
  private readonly cancelled = new Set<string>();

  constructor(opts: ControllerOptions) {
    this.orchestrator = opts.orchestrator;
    this.getSummary = opts.getSummary;
    this.now = opts.now ?? (() => Date.now());
  }

  /** 启动一次运行，返回其 runId（运行在后台推进）。 */
  start(input: StartRunInput): string {
    const runId = nanoid();
    this.runs.set(runId, {
      runId,
      phase: input.phase,
      input,
      startedAt: this.now(),
      status: 'running',
    });
    void this.orchestrator
      .run(runId, input)
      .then((final) => this.finish(runId, final.status))
      .catch(() => this.finish(runId, 'failed'));
    return runId;
  }

  /** 时间旅行回退后继续运行。 */
  async rollback(runId: string, checkpointId: string): Promise<RunState> {
    const run = this.runs.get(runId);
    const phase = run?.phase ?? 'develop';
    return this.orchestrator.rollback(runId, phase, checkpointId);
  }

  stop(runId: string): void {
    this.cancelled.add(runId);
    this.finish(runId, 'stopped');
  }

  isCancelled(runId: string): boolean {
    return this.cancelled.has(runId);
  }

  /** 供推进循环查询：当前是否应停止。 */
  shouldStop(run: RunState): { stop: boolean; reason: string | null } {
    if (this.cancelled.has(run.runId)) return { stop: true, reason: '手动停止' };
    const active = this.runs.get(run.runId);
    if (!active) return { stop: true, reason: '运行不存在' };
    return evaluateStop(
      active.input.stopConditions,
      run,
      this.getSummary(),
      active.startedAt,
      this.now(),
    );
  }

  list(): ActiveRun[] {
    return [...this.runs.values()];
  }

  private finish(runId: string, status: RunState['status']): void {
    const run = this.runs.get(runId);
    if (run) run.status = status;
  }
}
