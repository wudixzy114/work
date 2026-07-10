import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';

/**
 * 创建 SqliteSaver。它把每一步 checkpoint 落到 SQLite，
 * 提供三种能力：持久化、进程重启后断点恢复、时间旅行回退到任意历史 checkpoint。
 */
export function createCheckpointer(dbPath: string): SqliteSaver {
  return SqliteSaver.fromConnString(dbPath);
}

export type Checkpointer = SqliteSaver;
