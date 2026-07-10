import { nanoid } from 'nanoid';
import type { Schedule, ScheduleInput } from '@aiwf/shared';
import { Scheduler } from './scheduler.js';
import type { ScheduleStore } from './schedule-store.js';

export interface ScheduleManagerOptions {
  store: ScheduleStore;
  /** 定时触发时用于启动一次运行，返回 runId。 */
  onTrigger: (schedule: Schedule) => void;
  now?: () => number;
}

/**
 * 定时任务管理器：持久化 + 注册到 cron 调度器 + 触发运行。
 * 启动时从 SQLite 装载已有任务并注册，保证重启后定时编排不丢失。
 */
export class ScheduleManager {
  private readonly store: ScheduleStore;
  private readonly scheduler = new Scheduler();
  private readonly onTrigger: (schedule: Schedule) => void;
  private readonly now: () => number;

  constructor(opts: ScheduleManagerOptions) {
    this.store = opts.store;
    this.onTrigger = opts.onTrigger;
    this.now = opts.now ?? (() => Date.now());
    this.loadAndRegister();
  }

  list(): Schedule[] {
    return this.store.all();
  }

  create(input: ScheduleInput): Schedule {
    const schedule: Schedule = {
      ...input,
      id: nanoid(),
      lastRunAt: null,
      createdAt: this.now(),
    };
    this.store.upsert(schedule);
    if (schedule.enabled) this.register(schedule);
    return schedule;
  }

  remove(id: string): boolean {
    this.scheduler.remove(id);
    return this.store.remove(id);
  }

  /** 启用/停用，同步注册状态。 */
  setEnabled(id: string, enabled: boolean): Schedule | null {
    const existing = this.store.all().find((s) => s.id === id);
    if (!existing) return null;
    const updated: Schedule = { ...existing, enabled };
    this.store.upsert(updated);
    if (enabled) this.register(updated);
    else this.scheduler.remove(id);
    return updated;
  }

  stopAll(): void {
    this.scheduler.stopAll();
  }

  private loadAndRegister(): void {
    for (const schedule of this.store.all()) {
      if (schedule.enabled) this.register(schedule);
    }
  }

  private register(schedule: Schedule): void {
    this.scheduler.add(schedule.id, schedule.cronExpr, () => {
      const updated: Schedule = { ...schedule, lastRunAt: this.now() };
      this.store.upsert(updated);
      this.onTrigger(updated);
    });
  }
}
