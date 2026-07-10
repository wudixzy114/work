<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useSessionStore } from '@/stores/session';
import { PHASE_LABELS } from '@aiwf/shared';
import Panel from '@/components/Panel.vue';
import FlowGraph from '@/features/graph/FlowGraph.vue';
import MonitorPanel from '@/features/monitor/MonitorPanel.vue';
import LiveOutput from '@/features/monitor/LiveOutput.vue';
import BudgetMeter from '@/features/monitor/BudgetMeter.vue';
import ChannelManager from '@/features/control/ChannelManager.vue';
import RunControl from '@/features/control/RunControl.vue';
import SchedulePanel from '@/features/control/SchedulePanel.vue';

const session = useSessionStore();

/** 移动端标签页（窄屏三栏改为可切换单栏，保证控制面板始终可达）。 */
type Tab = 'control' | 'graph' | 'monitor';
const activeTab = ref<Tab>('graph');
const TABS: { key: Tab; label: string }[] = [
  { key: 'control', label: '控制' },
  { key: 'graph', label: '编排' },
  { key: 'monitor', label: '监控' },
];

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
    case 'paused':
      return { text: '已暂停', tone: 'text-active' };
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
      class="flex flex-shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-panel-line px-4 py-3 sm:px-5"
    >
      <div class="flex items-center gap-2.5">
        <div class="flex h-7 w-7 items-center justify-center rounded bg-active/15">
          <span class="h-2.5 w-2.5 rounded-full bg-active" />
        </div>
        <div class="flex flex-col leading-tight">
          <span class="font-display text-sm font-bold tracking-tight">AGENT 控制台</span>
          <span class="hidden font-mono text-[10px] tracking-[0.2em] text-ink-faint sm:block"
            >AI 协作工作流 · 编排 / 监控 / 控制</span
          >
        </div>
      </div>

      <div class="ml-auto flex items-center gap-3 font-mono text-[11px] sm:gap-5">
        <span v-if="session.run" class="hidden items-center gap-1.5 text-ink-muted sm:flex">
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
          <span class="hidden text-ink-muted sm:inline">{{ connMeta.text }}</span>
        </span>
      </div>
    </header>

    <!-- 移动端标签切换（lg 以下显示） -->
    <nav class="flex flex-shrink-0 gap-1 border-b border-panel-line px-3 py-2 lg:hidden">
      <button
        v-for="t in TABS"
        :key="t.key"
        :class="[
          'flex-1 rounded px-3 py-1.5 font-mono text-xs',
          activeTab === t.key
            ? 'bg-panel-raised text-ink-bright'
            : 'text-ink-faint hover:text-ink-muted',
        ]"
        @click="activeTab = t.key"
      >
        {{ t.label }}
      </button>
    </nav>

    <!-- 主体：桌面三栏网格；移动端按标签显示单栏。 -->
    <main class="grid min-h-0 flex-1 gap-3 p-3 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)_minmax(0,24rem)]">
      <!-- 控制列 -->
      <div
        class="min-h-0 flex-col gap-3 overflow-auto lg:flex"
        :class="activeTab === 'control' ? 'flex' : 'hidden'"
      >
        <Panel eyebrow="control" title="运行控制" class="flex-shrink-0">
          <RunControl />
        </Panel>
        <Panel eyebrow="adapter" title="渠道网关" class="flex-shrink-0">
          <ChannelManager />
        </Panel>
        <Panel eyebrow="scheduler" title="定时调度" class="flex-shrink-0">
          <SchedulePanel />
        </Panel>
      </div>

      <!-- 编排图（英雄） -->
      <Panel
        eyebrow="orchestration"
        title="编排流水线"
        class="min-h-0"
        :class="activeTab === 'graph' ? 'flex' : 'hidden lg:flex'"
      >
        <template #action>
          <span class="font-mono text-[10px] text-ink-faint">调研 → 执行 → 审查</span>
        </template>
        <div class="flex h-full min-h-[20rem] flex-col gap-3">
          <div class="min-h-0 flex-1 overflow-hidden rounded-md border border-panel-line">
            <FlowGraph />
          </div>
          <div class="h-40 flex-shrink-0">
            <LiveOutput />
          </div>
        </div>
      </Panel>

      <!-- 监控列 -->
      <Panel
        eyebrow="monitor"
        title="实时监控"
        class="min-h-0"
        :class="activeTab === 'monitor' ? 'flex' : 'hidden lg:flex'"
      >
        <template #action>
          <div class="w-32"><BudgetMeter /></div>
        </template>
        <MonitorPanel />
      </Panel>
    </main>
  </div>
</template>
