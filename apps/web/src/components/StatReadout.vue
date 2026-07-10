<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string;
    value: string | number;
    unit?: string;
    tone?: 'default' | 'active' | 'flow' | 'warn';
  }>(),
  { tone: 'default', unit: '' },
);

const toneClass: Record<string, string> = {
  default: 'text-ink-bright',
  active: 'text-active',
  flow: 'text-flow',
  warn: 'text-warn',
};
</script>

<template>
  <div class="flex flex-col gap-1 rounded-md border border-panel-line bg-panel-raised/60 px-3 py-2.5">
    <span class="font-mono text-[10px] uppercase tracking-[0.15em] text-ink-faint">{{
      label
    }}</span>
    <div class="flex items-baseline gap-1">
      <span class="font-mono text-xl font-medium tabular-nums" :class="toneClass[tone]">{{
        value
      }}</span>
      <span v-if="unit" class="font-mono text-xs text-ink-muted">{{ unit }}</span>
    </div>
  </div>
</template>
