import cron, { type ScheduledTask } from 'node-cron';

export interface ScheduledJob {
  id: string;
  cronExpr: string;
  task: ScheduledTask;
}

/**
 * 定时任务调度器。用于「定时触发某阶段运行」等场景。
 * 仅管理任务生命周期，具体动作由回调注入（依赖倒置）。
 */
export class Scheduler {
  private readonly jobs = new Map<string, ScheduledJob>();

  /** 注册一个 cron 任务。cronExpr 非法则抛错。 */
  add(id: string, cronExpr: string, action: () => void | Promise<void>): void {
    if (!cron.validate(cronExpr)) {
      throw new Error(`非法 cron 表达式: ${cronExpr}`);
    }
    this.remove(id);
    const task = cron.schedule(cronExpr, () => {
      void action();
    });
    this.jobs.set(id, { id, cronExpr, task });
  }

  remove(id: string): void {
    const job = this.jobs.get(id);
    if (job) {
      void job.task.stop();
      this.jobs.delete(id);
    }
  }

  list(): { id: string; cronExpr: string }[] {
    return [...this.jobs.values()].map((j) => ({ id: j.id, cronExpr: j.cronExpr }));
  }

  stopAll(): void {
    for (const job of this.jobs.values()) void job.task.stop();
    this.jobs.clear();
  }
}
