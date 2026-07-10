<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useSessionStore } from '@/stores/session';
import { PHASE_LABELS } from '@aiwf/shared';
import Panel from '@/components/Panel.vue';
import FlowGraph from '@/features/graph/FlowGraph.vue';
import MonitorPanel from '@/features/monitor/MonitorPanel.vue';
import ChannelManager from '@/features/control/ChannelManager.vue';
import RunControl from '@/features/control/RunControl.vue';

const session = useSessionStore();

const connMeta = computed(() => {
  switch (session.conn) {
    case 'open':
      return { dot: 'bg-ok', text: '已连接' };
    case 'connecting':
      return { dot: 'bg-active node-active', text: '连接中' };
    default:
      return { dot: 'bg-warn', text: '已断开 · 重连中' };
  }
});

const statusMeta = computed(() => {
  const s = session.run?.status;
  switch (s) {
    case 'running':
      return { text: '运行中', tone: 'text-active' };
    case 'completed':
      return { text: '已完成', tone: 'text-ok' };
    case 'stopped':
      return { text: '已停止', tone: 'text-ink-muted' };
    case 'failed':
      return { text: '失败', tone: 'text-warn' };
    default:
      return { text: '空闲', tone: 'text-ink-faint' };
  }
});

onMounted(() => session.connect());
</script>

<template>
  <div class="flex h-screen flex-col bg-panel-void text-ink-bright">
    <!-- 顶栏：身份 + 连接状态 + 运行态 -->
    <header
      class="flex flex-shrink-0 items-center gap-4 border-b border-panel-line px-5 py-3"
    >
      <div class="flex items-center gap-2.5">
        <div class="flex h-7 w-7 items-center justify-center rounded bg-active/15">
          <span class="h-2.5 w-2.5 rounded-full bg-active" />
        </div>
        <div class="flex flex-col leading-tight">
          <span class="font-display text-sm font-bold tracking-tight">AGENT 控制台</span>
          <span class="font-mono text-[10px] tracking-[0.2em] text-ink-faint"
            >AI 协作工作流 · 编排 / 监控 / 控制</span
          >
        </div>
      </div>

      <div class="ml-auto flex items-center gap-5 font-mono text-[11px]">
        <span v-if="session.run" class="flex items-center gap-1.5 text-ink-muted">
          阶段 <span class="text-ink-bright">{{ PHASE_LABELS[session.run.phase] }}</span>
        </span>
        <span v-if="session.run" class="flex items-center gap-1.5 text-ink-muted">
          轮次 <span class="text-ink-bright tabular-nums">{{ session.run.iteration }}</span>
        </span>
        <span class="flex items-center gap-1.5">
          <span class="text-ink-faint">状态</span>
          <span :class="statusMeta.tone">{{ statusMeta.text }}</span>
        </span>
        <span class="flex items-center gap-1.5">
          <span class="h-1.5 w-1.5 rounded-full" :class="connMeta.dot" />
          <span class="text-ink-muted">{{ connMeta.text }}</span>
        </span>
      </div>
    </header>

    <!-- 主体：左控制 · 中编排图（英雄）· 右监控。响应式：窄屏纵向堆叠。 -->
    <main
      class="grid min-h-0 flex-1 gap-3 p-3"
      style="grid-template-columns: minmax(0, 20rem) minmax(0, 1fr) minmax(0, 24rem)"
    >
      <div class="flex min-h-0 flex-col gap-3 overflow-auto max-lg:hidden">
        <Panel eyebrow="control" title="运行控制" class="flex-shrink-0">
          <RunControl />
        </Panel>
        <Panel eyebrow="adapter" title="渠道网关" class="flex-shrink-0">
          <ChannelManager />
        </Panel>
      </div>

      <Panel eyebrow="orchestration" title="编排流水线" class="min-h-0">
        <template #action>
          <span class="font-mono text-[10px] text-ink-faint">调研 → 执行 → 审查</span>
        </template>
        <div class="h-full min-h-[24rem] overflow-hidden rounded-md border border-panel-line">
          <FlowGraph />
        </div>
      </Panel>

      <Panel eyebrow="monitor" title="实时监控" class="min-h-0">
        <MonitorPanel />
      </Panel>
    </main>
  </div>
</template>
