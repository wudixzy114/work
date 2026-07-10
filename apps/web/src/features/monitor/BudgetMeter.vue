<script setup lang="ts">
import { computed } from 'vue';
import { useSessionStore } from '@/stores/session';

const session = useSessionStore();

const b = computed(() => session.budget);

/** 取成本与 token 中较高的占用比作为主进度。 */
const ratio = computed(() => {
  if (!b.value) return null;
  const r = Math.max(b.value.costRatio ?? 0, b.value.tokenRatio ?? 0);
  return Math.min(r, 1);
});

const barColor = computed(() => {
  if (!b.value) return 'bg-ink-faint';
  if (b.value.exceeded) return 'bg-warn';
  if (b.value.alerting) return 'bg-active';
  return 'bg-ok';
});
</script>

<template>
  <div v-if="b" class="flex flex-col gap-1.5">
    <div class="flex items-center justify-between font-mono text-[10px]">
      <span class="uppercase tracking-[0.15em] text-ink-faint">预算</span>
      <span
        :class="
          b.exceeded ? 'text-warn' : b.alerting ? 'text-active' : 'text-ink-muted'
        "
      >
        <template v-if="b.exceeded">已超限</template>
        <template v-else-if="b.alerting">接近上限</template>
        <template v-else>正常</template>
      </span>
    </div>
    <div class="h-1.5 overflow-hidden rounded-full bg-panel-line">
      <div
        class="h-full rounded-full transition-all duration-500"
        :class="barColor"
        :style="{ width: `${(ratio ?? 0) * 100}%` }"
      />
    </div>
    <div class="flex justify-between font-mono text-[10px] text-ink-muted">
      <span>${{ b.spentUsd.toFixed(4) }}</span>
      <span>{{ b.spentTokens.toLocaleString() }} tok</span>
    </div>
  </div>
</template>
