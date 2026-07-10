import Database from 'better-sqlite3';
import { type Channel, ChannelSchema } from '@aiwf/shared';

/**
 * 渠道的 SQLite 持久化。服务重启后可重新装载渠道配置，
 * 避免每次重启都要重新录入中转/内网端点。
 */
export class ChannelStore {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS channels (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL
      );
    `);
  }

  upsert(channel: Channel): void {
    this.db
      .prepare(
        `INSERT INTO channels (id, payload) VALUES (@id, @payload)
         ON CONFLICT(id) DO UPDATE SET payload = excluded.payload`,
      )
      .run({ id: channel.id, payload: JSON.stringify(channel) });
  }

  remove(id: string): boolean {
    return this.db.prepare(`DELETE FROM channels WHERE id = ?`).run(id).changes > 0;
  }

  all(): Channel[] {
    const rows = this.db.prepare(`SELECT payload FROM channels`).all() as {
      payload: string;
    }[];
    return rows.map((r) => ChannelSchema.parse(JSON.parse(r.payload)));
  }

  close(): void {
    this.db.close();
  }
}
