import type { Channel } from '@aiwf/shared';

/**
 * 渠道注册表：内存维护所有渠道，提供增删改查与模型名解析。
 * 借鉴 New API 的 channel 概念——把「官方/中转/内网」差异收敛为一组同构渠道。
 */
export class ChannelRegistry {
  private readonly channels = new Map<string, Channel>();

  upsert(channel: Channel): void {
    this.channels.set(channel.id, channel);
  }

  remove(id: string): boolean {
    return this.channels.delete(id);
  }

  get(id: string): Channel | undefined {
    return this.channels.get(id);
  }

  list(): Channel[] {
    return [...this.channels.values()];
  }

  /** 仅返回启用中的渠道。 */
  listEnabled(): Channel[] {
    return this.list().filter((c) => c.enabled);
  }

  /** 逻辑模型名 -> 上游真实模型名；未配置映射则透传。 */
  resolveModel(channelId: string, logicalModel: string): string {
    const channel = this.channels.get(channelId);
    if (!channel) return logicalModel;
    return channel.modelMap[logicalModel] ?? logicalModel;
  }
}
