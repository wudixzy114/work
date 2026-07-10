import Database from 'better-sqlite3';
import { type EventQuery, type MonitorEvent, MonitorEventSchema } from '@aiwf/shared';

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

  /**
   * 按过滤条件查询事件，时间倒序、受 limit 约束。
   * 所有取值均以占位符绑定，杜绝 SQL 注入。
   */
  query(q: EventQuery): MonitorEvent[] {
    const { clause, params } = this.buildFilters(q);
    const limit = Math.min(q.limit ?? 200, 1000);
    const rows = this.db
      .prepare(`SELECT payload FROM monitor_events${clause} ORDER BY at DESC LIMIT ?`)
      .all(...params, limit) as { payload: string }[];
    return rows.map((r) => MonitorEventSchema.parse(JSON.parse(r.payload)));
  }

  /** 同 query 的过滤条件，返回命中总数（不受 limit 影响）。 */
  count(q: EventQuery): number {
    const { clause, params } = this.buildFilters(q);
    const row = this.db
      .prepare(`SELECT COUNT(*) AS n FROM monitor_events${clause}`)
      .get(...params) as { n: number };
    return row.n;
  }

  /**
   * 时间序列分桶：把命中事件按固定 bucketMs 聚合，供吞吐图使用。
   * 成本/token 从 payload JSON 中解析，仅统计成功调用。
   */
  timeSeries(
    q: EventQuery,
    bucketMs: number,
  ): Array<{ bucketStart: number; calls: number; tokens: number; costUsd: number }> {
    if (bucketMs <= 0) throw new Error('bucketMs 必须为正数');
    const { clause, params } = this.buildFilters(q);
    const rows = this.db
      .prepare(`SELECT payload FROM monitor_events${clause} ORDER BY at ASC`)
      .all(...params) as { payload: string }[];

    const buckets = new Map<
      number,
      { bucketStart: number; calls: number; tokens: number; costUsd: number }
    >();
    for (const r of rows) {
      const event = MonitorEventSchema.parse(JSON.parse(r.payload));
      if (event.kind !== 'call_success') continue;
      const bucketStart = Math.floor(event.at / bucketMs) * bucketMs;
      let bucket = buckets.get(bucketStart);
      if (!bucket) {
        bucket = { bucketStart, calls: 0, tokens: 0, costUsd: 0 };
        buckets.set(bucketStart, bucket);
      }
      bucket.calls += 1;
      bucket.tokens += event.usage?.totalTokens ?? 0;
      bucket.costUsd += event.costUsd ?? 0;
    }
    return [...buckets.values()].sort((a, b) => a.bucketStart - b.bucketStart);
  }

  /** 由过滤条件构造参数化 WHERE 子句；取值一律绑定，绝不拼接。 */
  private buildFilters(q: EventQuery): { clause: string; params: unknown[] } {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (q.runId !== undefined) {
      conditions.push('run_id = ?');
      params.push(q.runId);
    }
    if (q.channelId !== undefined) {
      conditions.push('channel_id = ?');
      params.push(q.channelId);
    }
    if (q.model !== undefined) {
      conditions.push('model = ?');
      params.push(q.model);
    }
    if (q.kind !== undefined) {
      conditions.push('kind = ?');
      params.push(q.kind);
    }
    if (q.since !== undefined) {
      conditions.push('at >= ?');
      params.push(q.since);
    }
    if (q.until !== undefined) {
      conditions.push('at <= ?');
      params.push(q.until);
    }
    const clause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
    return { clause, params };
  }

  close(): void {
    this.db.close();
  }
}
