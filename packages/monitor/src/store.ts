import Database from 'better-sqlite3';
import { type MonitorEvent, MonitorEventSchema } from '@aiwf/shared';

/**
 * 监控事件的 SQLite 持久化。每条事件都是真实调用的落地记录，
 * 服务重启后可从此重建汇总，保证「可恢复」。
 */
export class MonitorStore {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS monitor_events (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        role TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        model TEXT NOT NULL,
        payload TEXT NOT NULL,
        at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_events_run ON monitor_events(run_id);
      CREATE INDEX IF NOT EXISTS idx_events_at ON monitor_events(at);
    `);
  }

  insert(event: MonitorEvent): void {
    this.db
      .prepare(
        `INSERT INTO monitor_events (id, run_id, kind, role, channel_id, model, payload, at)
         VALUES (@id, @runId, @kind, @role, @channelId, @model, @payload, @at)`,
      )
      .run({
        id: event.id,
        runId: event.runId,
        kind: event.kind,
        role: event.role,
        channelId: event.channelId,
        model: event.model,
        payload: JSON.stringify(event),
        at: event.at,
      });
  }

  /** 最近 N 条事件，按时间倒序落库、正序返回，用于快照重放。 */
  recent(limit = 200): MonitorEvent[] {
    const rows = this.db
      .prepare(`SELECT payload FROM monitor_events ORDER BY at DESC LIMIT ?`)
      .all(limit) as { payload: string }[];
    return rows
      .map((r) => MonitorEventSchema.parse(JSON.parse(r.payload)))
      .reverse();
  }

  byRun(runId: string): MonitorEvent[] {
    const rows = this.db
      .prepare(`SELECT payload FROM monitor_events WHERE run_id = ? ORDER BY at ASC`)
      .all(runId) as { payload: string }[];
    return rows.map((r) => MonitorEventSchema.parse(JSON.parse(r.payload)));
  }

  close(): void {
    this.db.close();
  }
}
