<script setup lang="ts">
import { computed } from 'vue';
import type { ChannelHealth } from '@aiwf/shared';

const props = defineProps<{ health: ChannelHealth | undefined }>();

const meta = computed(() => {
  const s = props.health?.status ?? 'unknown';
  switch (s) {
    case 'healthy':
      return { dot: 'bg-ok', text: '健康', tone: 'text-ok' };
    case 'degraded':
      return { dot: 'bg-active', text: '降级', tone: 'text-active' };
    case 'down':
      return { dot: 'bg-warn', text: '故障', tone: 'text-warn' };
    default:
      return { dot: 'bg-ink-faint', text: '未知', tone: 'text-ink-faint' };
  }
});
</script>

<template>
  <span class="flex items-center gap-1" :title="health?.lastError ?? ''">
    <span class="h-1.5 w-1.5 rounded-full" :class="meta.dot" />
    <span class="font-mono text-[10px]" :class="meta.tone">{{ meta.text }}</span>
    <span
      v-if="health?.latencyMs != null"
      class="font-mono text-[10px] text-ink-faint"
      >{{ Math.round(health.latencyMs) }}ms</span
    >
    <span
      v-if="health?.circuitOpen"
      class="font-mono text-[10px] text-warn"
      title="熔断已打开"
      >⚡</span
    >
  </span>
</template>
