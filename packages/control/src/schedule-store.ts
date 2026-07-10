import Database from 'better-sqlite3';
import { type Schedule, ScheduleSchema } from '@aiwf/shared';

/**
 * 定时任务的 SQLite 持久化。服务重启后可重新装载并注册到调度器，
 * 保证定时编排不因重启丢失。
 */
export class ScheduleStore {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schedules (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
  }

  upsert(schedule: Schedule): void {
    this.db
      .prepare(
        `INSERT INTO schedules (id, payload, created_at) VALUES (@id, @payload, @createdAt)
         ON CONFLICT(id) DO UPDATE SET payload = excluded.payload`,
      )
      .run({
        id: schedule.id,
        payload: JSON.stringify(schedule),
        createdAt: schedule.createdAt,
      });
  }

  remove(id: string): boolean {
    return this.db.prepare(`DELETE FROM schedules WHERE id = ?`).run(id).changes > 0;
  }

  all(): Schedule[] {
    const rows = this.db
      .prepare(`SELECT payload FROM schedules ORDER BY created_at ASC`)
      .all() as { payload: string }[];
    return rows.map((r) => ScheduleSchema.parse(JSON.parse(r.payload)));
  }

  close(): void {
    this.db.close();
  }
}
