<script setup lang="ts">
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import { cn } from '@/lib/utils';
import type { NodeState } from '@aiwf/shared';

const props = defineProps<{
  data: { label: string; role: string; node: NodeState | null };
}>();

const status = computed(() => props.data.node?.status ?? 'pending');

const statusMeta = computed(() => {
  switch (status.value) {
    case 'active':
      return { ring: 'border-active node-active', dot: 'bg-active', text: '运行中' };
    case 'done':
      return { ring: 'border-ok/60', dot: 'bg-ok', text: '完成' };
    case 'error':
      return { ring: 'border-warn', dot: 'bg-warn', text: '错误' };
    default:
      return { ring: 'border-panel-line', dot: 'bg-ink-faint', text: '待命' };
  }
});
</script>

<template>
  <div
    :class="
      cn(
        'w-56 rounded-lg border bg-panel-raised px-4 py-3 transition-colors',
        statusMeta.ring,
      )
    "
  >
    <Handle type="target" :position="Position.Left" class="!bg-panel-line" />
    <div class="flex items-center justify-between">
      <span class="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">{{
        data.role
      }}</span>
      <span class="flex items-center gap-1.5">
        <span :class="cn('h-1.5 w-1.5 rounded-full', statusMeta.dot)" />
        <span class="font-mono text-[10px] text-ink-muted">{{ statusMeta.text }}</span>
      </span>
    </div>
    <h3 class="mt-1 font-display text-base font-semibold text-ink-bright">
      {{ data.label }}
    </h3>
    <p
      v-if="data.node?.output"
      class="mt-2 line-clamp-3 font-mono text-[11px] leading-relaxed text-ink-muted"
    >
      {{ data.node.output }}
    </p>
    <Handle type="source" :position="Position.Right" class="!bg-panel-line" />
  </div>
</template>
