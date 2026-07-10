import type {
  Channel,
  ChannelInput,
  ChannelHealth,
  Schedule,
  ScheduleInput,
  UsageBreakdown,
  MonitorEvent,
} from '@aiwf/shared';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`请求失败 ${res.status} ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

const jsonHeaders = { 'content-type': 'application/json' };

/** 渠道管理的 REST 客户端。 */
export const channelsApi = {
  list: (): Promise<Channel[]> => fetch('/api/channels').then((r) => json<Channel[]>(r)),

  create: (input: ChannelInput): Promise<Channel> =>
    fetch('/api/channels', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(input),
    }).then((r) => json<Channel>(r)),

  update: (id: string, input: ChannelInput): Promise<Channel> =>
    fetch(`/api/channels/${id}`, {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify(input),
    }).then((r) => json<Channel>(r)),

  remove: (id: string): Promise<void> =>
    fetch(`/api/channels/${id}`, { method: 'DELETE' }).then(() => undefined),

  /** 主动探活一个渠道。 */
  probe: (id: string): Promise<ChannelHealth> =>
    fetch(`/api/channels/${id}/probe`, { method: 'POST' }).then((r) =>
      json<ChannelHealth>(r),
    ),
};

export interface CheckpointRef {
  checkpointId: string;
  at: number;
}

/** 运行历史与回退。 */
export const runsApi = {
  history: (runId: string): Promise<CheckpointRef[]> =>
    fetch(`/api/runs/${runId}/history`).then((r) => json<CheckpointRef[]>(r)),

  events: (runId: string): Promise<MonitorEvent[]> =>
    fetch(`/api/runs/${runId}/events`).then((r) => json<MonitorEvent[]>(r)),
};

/** 监控查询与成本归因。 */
export const monitorApi = {
  breakdown: (dimension: 'model' | 'channel'): Promise<UsageBreakdown[]> =>
    fetch(`/api/monitor/breakdown?dimension=${dimension}`).then((r) =>
      json<UsageBreakdown[]>(r),
    ),
};

/** 定时任务 CRUD。 */
export const schedulesApi = {
  list: (): Promise<Schedule[]> =>
    fetch('/api/schedules').then((r) => json<Schedule[]>(r)),

  create: (input: ScheduleInput): Promise<Schedule> =>
    fetch('/api/schedules', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(input),
    }).then((r) => json<Schedule>(r)),

  setEnabled: (id: string, enabled: boolean): Promise<Schedule> =>
    fetch(`/api/schedules/${id}/enabled`, {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify({ enabled }),
    }).then((r) => json<Schedule>(r)),

  remove: (id: string): Promise<void> =>
    fetch(`/api/schedules/${id}`, { method: 'DELETE' }).then(() => undefined),
};
