<script setup lang="ts">
import { computed } from 'vue';
import { useSessionStore } from '@/stores/session';
import StatReadout from '@/components/StatReadout.vue';
import { ROLE_LABELS } from '@aiwf/shared';

const session = useSessionStore();

const cacheRate = computed(() => {
  const { totalTokens, cachedTokens } = session.summary;
  if (totalTokens === 0) return '0';
  return ((cachedTokens / totalTokens) * 100).toFixed(1);
});

const cost = computed(() => session.summary.totalCostUsd.toFixed(4));

/** 倒序展示最近事件，最新在上。 */
const feed = computed(() => [...session.events].reverse().slice(0, 40));

/** 按模型聚合成本与 token（客户端从实时事件流计算，无需额外请求）。 */
interface ModelStat {
  model: string;
  calls: number;
  tokens: number;
  costUsd: number;
}
const byModel = computed<ModelStat[]>(() => {
  const map = new Map<string, ModelStat>();
  for (const e of session.events) {
    if (e.kind !== 'call_success' || !e.model) continue;
    const stat = map.get(e.model) ?? { model: e.model, calls: 0, tokens: 0, costUsd: 0 };
    stat.calls += 1;
    stat.tokens += e.usage?.totalTokens ?? 0;
    stat.costUsd += e.costUsd ?? 0;
    map.set(e.model, stat);
  }
  return [...map.values()].sort((a, b) => b.tokens - a.tokens);
});

const maxTokens = computed(() =>
  Math.max(1, ...byModel.value.map((m) => m.tokens)),
);

function kindMeta(kind: string): { tone: string; text: string } {
  switch (kind) {
    case 'call_success':
      return { tone: 'text-ok', text: '成功' };
    case 'call_error':
      return { tone: 'text-warn', text: '错误' };
    case 'fallback':
      return { tone: 'text-active', text: '回退' };
    default:
      return { tone: 'text-flow', text: '发起' };
  }
}

function ts(at: number): string {
  const d = new Date(at);
  return d.toLocaleTimeString('zh-CN', { hour12: false });
}
</script>

<template>
  <div class="flex h-full flex-col gap-4">
    <div class="grid grid-cols-2 gap-2 lg:grid-cols-3">
      <StatReadout label="总调用" :value="session.summary.totalCalls" tone="flow" />
      <StatReadout label="总 Token" :value="session.summary.totalTokens.toLocaleString()" />
      <StatReadout label="缓存命中" :value="cacheRate" unit="%" />
      <StatReadout label="成本" :value="cost" unit="USD" />
      <StatReadout label="回退" :value="session.summary.fallbacks" tone="active" />
      <StatReadout label="错误" :value="session.summary.errors" tone="warn" />
    </div>

    <!-- 按模型成本归因 -->
    <div v-if="byModel.length > 0" class="flex flex-col gap-1.5">
      <span class="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint"
        >按模型用量</span
      >
      <div v-for="m in byModel" :key="m.model" class="flex flex-col gap-0.5">
        <div class="flex items-center justify-between font-mono text-[10px]">
          <span class="text-ink-muted">{{ m.model }}</span>
          <span class="text-ink-faint"
            >{{ m.tokens.toLocaleString() }} tok · ${{ m.costUsd.toFixed(4) }}</span
          >
        </div>
        <div class="h-1 overflow-hidden rounded-full bg-panel-line">
          <div
            class="h-full rounded-full bg-flow/70"
            :style="{ width: `${(m.tokens / maxTokens) * 100}%` }"
          />
        </div>
      </div>
    </div>

    <div class="flex min-h-0 flex-1 flex-col">
      <span class="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint"
        >实时事件流</span
      >
      <div class="min-h-0 flex-1 space-y-1 overflow-auto pr-1">
        <p v-if="feed.length === 0" class="font-mono text-xs text-ink-faint">
          暂无事件。启动一次运行后，此处将实时显示每一次真实调用。
        </p>
        <div
          v-for="e in feed"
          :key="e.id"
          class="flex items-center gap-2 rounded border border-panel-line/60 bg-panel-raised/40 px-2.5 py-1.5 font-mono text-[11px]"
        >
          <span class="text-ink-faint">{{ ts(e.at) }}</span>
          <span :class="kindMeta(e.kind).tone">{{ kindMeta(e.kind).text }}</span>
          <span class="text-ink-muted">{{ ROLE_LABELS[e.role] }}</span>
          <span class="truncate text-ink-muted">{{ e.model || '—' }}</span>
          <span v-if="e.usage" class="ml-auto text-ink-muted"
            >{{ e.usage.totalTokens }} tok</span
          >
          <span v-if="e.latencyMs != null" class="text-ink-faint"
            >{{ Math.round(e.latencyMs) }}ms</span
          >
        </div>
      </div>
    </div>
  </div>
</template>
