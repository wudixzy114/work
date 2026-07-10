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
  /** 最大并发运行数，超出则排队。默认 3。 */
  maxConcurrent?: number;
}

/**
 * 核心控制层：决定何时开始/停止/暂停/继续一次运行，跟踪活跃运行，
 * 限制并发，并在推进中评估停止条件。
 * 起停基于 orchestrator 的能力；停止条件综合业务与资源约束。
 */
export class Controller {
  private readonly orchestrator: Orchestrator;
  private readonly getSummary: () => MonitorSummary;
  private readonly now: () => number;
  private readonly maxConcurrent: number;
  private readonly runs = new Map<string, ActiveRun>();
  private readonly cancelled = new Set<string>();
  private readonly paused = new Set<string>();
  /** 等待并发槽位的运行队列。 */
  private readonly queue: string[] = [];
  private runningCount = 0;

  constructor(opts: ControllerOptions) {
    this.orchestrator = opts.orchestrator;
    this.getSummary = opts.getSummary;
    this.now = opts.now ?? (() => Date.now());
    this.maxConcurrent = opts.maxConcurrent ?? 3;
  }

  /** 启动一次运行，返回其 runId（受并发限制，可能先入队）。 */
  start(input: StartRunInput): string {
    const runId = nanoid();
    this.runs.set(runId, {
      runId,
      phase: input.phase,
      input,
      startedAt: this.now(),
      status: 'running',
    });
    this.enqueue(runId);
    return runId;
  }

  /** 时间旅行回退后继续运行（不占用并发队列，属人工干预）。 */
  async rollback(runId: string, checkpointId: string): Promise<RunState> {
    const run = this.runs.get(runId);
    const phase = run?.phase ?? 'develop';
    return this.orchestrator.rollback(runId, phase, checkpointId);
  }

  /** 暂停：中断当前推进，checkpoint 已落地，可稍后 resume。 */
  pause(runId: string): void {
    this.paused.add(runId);
    this.orchestrator.interrupt(runId);
    const run = this.runs.get(runId);
    if (run) run.status = 'paused';
  }

  /** 继续：从最近 checkpoint 恢复推进。 */
  resume(runId: string): void {
    if (!this.paused.has(runId)) return;
    this.paused.delete(runId);
    const run = this.runs.get(runId);
    if (!run) return;
    run.status = 'running';
    this.enqueue(runId);
  }

  stop(runId: string): void {
    this.cancelled.add(runId);
    this.orchestrator.interrupt(runId);
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

  /** 当前排队等待的运行数。 */
  queueDepth(): number {
    return this.queue.length;
  }

  private enqueue(runId: string): void {
    this.queue.push(runId);
    this.pump();
  }

  /** 在并发上限内取出队列任务执行。 */
  private pump(): void {
    while (this.runningCount < this.maxConcurrent && this.queue.length > 0) {
      const runId = this.queue.shift();
      if (!runId) break;
      if (this.cancelled.has(runId)) continue;
      const run = this.runs.get(runId);
      if (!run) continue;
      this.runningCount += 1;
      const isResume = this.wasStarted(runId);
      const exec = isResume
        ? this.orchestrator.resume(runId, run.phase)
        : this.orchestrator.run(runId, run.input);
      this.started.add(runId);
      void exec
        .then((final) => this.finish(runId, final.status))
        .catch(() => this.finish(runId, 'failed'))
        .finally(() => {
          this.runningCount -= 1;
          this.pump();
        });
    }
  }

  private readonly started = new Set<string>();
  private wasStarted(runId: string): boolean {
    return this.started.has(runId);
  }

  private finish(runId: string, status: RunState['status']): void {
    const run = this.runs.get(runId);
    if (run && run.status !== 'paused') run.status = status;
  }
}
