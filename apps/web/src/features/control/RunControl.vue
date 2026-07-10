<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useSessionStore } from '@/stores/session';
import { channelsApi, runsApi, type CheckpointRef } from '@/lib/api';
import {
  PHASE_LABELS,
  ROLE_LABELS,
  type Channel,
  type Phase,
  type Role,
} from '@aiwf/shared';

const session = useSessionStore();
const channels = ref<Channel[]>([]);

const ROLES: Role[] = ['research', 'execute', 'review'];
const PHASES = Object.keys(PHASE_LABELS) as Phase[];

const form = reactive({
  phase: 'develop' as Phase,
  task: '',
  bindings: {
    research: { channelId: '', model: '' },
    execute: { channelId: '', model: '' },
    review: { channelId: '', model: '' },
  } as Record<Role, { channelId: string; model: string }>,
  maxIterations: 3,
});

const canStart = computed(
  () =>
    form.task.trim().length > 0 &&
    ROLES.every((r) => form.bindings[r].channelId && form.bindings[r].model) &&
    !session.isRunning,
);

function start(): void {
  session.startRun({
    phase: form.phase,
    task: form.task,
    bindings: ROLES.map((role) => ({
      role,
      channelId: form.bindings[role].channelId,
      model: form.bindings[role].model,
    })),
    stopConditions: {
      maxIterations: form.maxIterations,
      maxTokens: null,
      maxCostUsd: null,
      timeoutMs: null,
      stopOnApproval: true,
    },
  });
}

function stop(): void {
  if (session.run) session.stopRun(session.run.runId);
}

function pause(): void {
  if (session.run) session.pauseRun(session.run.runId);
}

function resume(): void {
  if (session.run) session.resumeRun(session.run.runId);
}

const history = ref<CheckpointRef[]>([]);
async function loadHistory(): Promise<void> {
  if (session.run) history.value = await runsApi.history(session.run.runId);
}
function rollbackTo(cp: string): void {
  if (session.run) session.rollback(session.run.runId, cp);
}

watch(
  () => session.run?.status,
  (s) => {
    if (s === 'completed' || s === 'stopped') void loadHistory();
  },
);

onMounted(async () => {
  channels.value = await channelsApi.list();
});
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-col gap-1.5">
      <label class="ctl-label">阶段</label>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="p in PHASES"
          :key="p"
          :class="[
            'rounded border px-2.5 py-1 font-mono text-[11px]',
            form.phase === p
              ? 'border-active text-active'
              : 'border-panel-line text-ink-muted hover:border-ink-muted',
          ]"
          @click="form.phase = p"
        >
          {{ PHASE_LABELS[p] }}
        </button>
      </div>
    </div>

    <div class="flex flex-col gap-1.5">
      <label class="ctl-label">任务描述</label>
      <textarea
        v-model="form.task"
        rows="3"
        placeholder="描述要交给三模型流水线完成的任务…"
        class="ctl-input resize-none"
      />
    </div>

    <div class="flex flex-col gap-2">
      <label class="ctl-label">角色绑定（调研 → 执行 → 审查）</label>
      <div v-for="role in ROLES" :key="role" class="flex items-center gap-2">
        <span class="w-10 font-mono text-[11px] text-ink-muted">{{ ROLE_LABELS[role] }}</span>
        <select v-model="form.bindings[role].channelId" class="ctl-input flex-1">
          <option value="" disabled>选择渠道</option>
          <option v-for="c in channels" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
        <input
          v-model="form.bindings[role].model"
          placeholder="模型名"
          class="ctl-input w-28"
        />
      </div>
    </div>

    <div class="flex items-center gap-2">
      <label class="ctl-label">最大轮次</label>
      <input v-model.number="form.maxIterations" type="number" min="1" class="ctl-input w-16" />
    </div>

    <div class="flex gap-2">
      <button
        :disabled="!canStart"
        class="flex-1 rounded bg-active px-3 py-1.5 font-mono text-xs font-semibold text-panel-void enabled:hover:brightness-110 disabled:opacity-40"
        @click="start"
      >
        启动运行
      </button>
      <button
        v-if="!session.isPaused"
        :disabled="!session.isRunning"
        class="rounded border border-panel-line px-3 py-1.5 font-mono text-xs text-ink-muted enabled:hover:border-active enabled:hover:text-active disabled:opacity-30"
        @click="pause"
      >
        暂停
      </button>
      <button
        v-else
        class="rounded border border-active px-3 py-1.5 font-mono text-xs text-active hover:brightness-110"
        @click="resume"
      >
        继续
      </button>
      <button
        :disabled="!session.isRunning && !session.isPaused"
        class="rounded border border-warn px-3 py-1.5 font-mono text-xs text-warn disabled:opacity-30"
        @click="stop"
      >
        停止
      </button>
    </div>

    <div v-if="history.length > 0" class="flex flex-col gap-1.5">
      <label class="ctl-label">时间旅行 · 回退到 checkpoint</label>
      <div class="max-h-28 space-y-1 overflow-auto">
        <button
          v-for="(cp, i) in history"
          :key="cp.checkpointId"
          class="flex w-full items-center gap-2 rounded border border-panel-line px-2 py-1 font-mono text-[10px] text-ink-muted hover:border-flow hover:text-flow"
          @click="rollbackTo(cp.checkpointId)"
        >
          <span class="text-ink-faint">#{{ history.length - i }}</span>
          <span class="truncate">{{ cp.checkpointId.slice(0, 18) }}…</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ctl-label {
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  color: var(--color-ink-faint);
}
.ctl-input {
  border-radius: 0.25rem;
  border: 1px solid var(--color-panel-line);
  background-color: var(--color-panel-void);
  padding: 0.375rem 0.5rem;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-ink-bright);
}
.ctl-input:focus {
  outline: none;
  border-color: var(--color-flow);
}
</style>
