<script setup lang="ts">
import { computed } from 'vue';
import { useSessionStore } from '@/stores/session';
import { ROLE_LABELS, type Role } from '@aiwf/shared';

const session = useSessionStore();

const ROLES: Role[] = ['research', 'execute', 'review'];

/** 优先显示当前活跃角色的流式输出；否则显示最后有内容的角色。 */
const focusRole = computed<Role>(() => {
  if (session.activeRole) return session.activeRole;
  for (const r of [...ROLES].reverse()) {
    if (session.liveOutput[r]) return r;
  }
  return 'research';
});

const text = computed(() => session.liveOutput[focusRole.value]);
</script>

<template>
  <div class="flex h-full flex-col gap-2">
    <div class="flex items-center gap-2">
      <span class="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint"
        >当前输出</span
      >
      <span
        v-if="session.activeRole"
        class="flex items-center gap-1.5 rounded border border-active/40 px-1.5 py-0.5"
      >
        <span class="h-1.5 w-1.5 rounded-full bg-active node-active" />
        <span class="font-mono text-[10px] text-active">{{
          ROLE_LABELS[focusRole]
        }}</span>
      </span>
      <span v-else class="font-mono text-[10px] text-ink-faint">{{
        ROLE_LABELS[focusRole]
      }}</span>
    </div>
    <div
      class="min-h-0 flex-1 overflow-auto rounded-md border border-panel-line bg-panel-void/60 p-3"
    >
      <pre
        v-if="text"
        class="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-ink-muted"
        >{{ text }}<span v-if="session.activeRole" class="cursor-blink">▋</span></pre
      >
      <p v-else class="font-mono text-[11px] text-ink-faint">
        运行开始后，此处逐 token 实时显示当前 Agent 的输出，便于判断是否陷入死循环。
      </p>
    </div>
  </div>
</template>

<style scoped>
@keyframes blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0;
  }
}
.cursor-blink {
  animation: blink 1s step-end infinite;
  color: var(--color-active);
}
@media (prefers-reduced-motion: reduce) {
  .cursor-blink {
    animation: none;
  }
}
</style>
