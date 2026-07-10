import type { Channel, ChannelInput } from '@aiwf/shared';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`请求失败 ${res.status}`);
  return (await res.json()) as T;
}

/** 渠道管理的 REST 客户端。 */
export const channelsApi = {
  list: (): Promise<Channel[]> => fetch('/api/channels').then((r) => json<Channel[]>(r)),

  create: (input: ChannelInput): Promise<Channel> =>
    fetch('/api/channels', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }).then((r) => json<Channel>(r)),

  remove: (id: string): Promise<void> =>
    fetch(`/api/channels/${id}`, { method: 'DELETE' }).then(() => undefined),
};

export interface CheckpointRef {
  checkpointId: string;
  at: number;
}

/** 运行历史与回退。 */
export const runsApi = {
  history: (runId: string): Promise<CheckpointRef[]> =>
    fetch(`/api/runs/${runId}/history`).then((r) => json<CheckpointRef[]>(r)),
};
