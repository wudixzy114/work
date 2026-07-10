<script setup lang="ts">
import { cn } from '@/lib/utils';

const props = defineProps<{
  title?: string;
  eyebrow?: string;
  class?: string;
}>();
</script>

<template>
  <section
    :class="
      cn(
        'flex flex-col rounded-lg border border-panel-line bg-panel-base/80 backdrop-blur-sm',
        props.class,
      )
    "
  >
    <header
      v-if="title || eyebrow"
      class="flex items-baseline justify-between border-b border-panel-line px-4 py-2.5"
    >
      <div class="flex flex-col">
        <span
          v-if="eyebrow"
          class="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint"
          >{{ eyebrow }}</span
        >
        <h2 v-if="title" class="font-display text-sm font-semibold text-ink-bright">
          {{ title }}
        </h2>
      </div>
      <slot name="action" />
    </header>
    <div class="min-h-0 flex-1 overflow-auto p-4">
      <slot />
    </div>
  </section>
</template>
