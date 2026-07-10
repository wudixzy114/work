<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { schedulesApi, channelsApi } from '@/lib/api';
import {
  PHASE_LABELS,
  type Channel,
  type Phase,
  type Role,
  type Schedule,
} from '@aiwf/shared';

const schedules = ref<Schedule[]>([]);
const channels = ref<Channel[]>([]);
const showForm = ref(false);
const error = ref('');

const ROLES: Role[] = ['research', 'execute', 'review'];
const PHASES = Object.keys(PHASE_LABELS) as Phase[];

const form = reactive({
  name: '',
  cronExpr: '0 9 * * *',
  phase: 'develop' as Phase,
  task: '',
  channelId: '',
  model: '',
});

async function refresh(): Promise<void> {
  [schedules.value, channels.value] = await Promise.all([
    schedulesApi.list(),
    channelsApi.list(),
  ]);
}

async function submit(): Promise<void> {
  error.value = '';
  if (!form.name || !form.task || !form.channelId || !form.model) {
    error.value = '请填写名称、任务、渠道与模型';
    return;
  }
  try {
    await schedulesApi.create({
      name: form.name,
      cronExpr: form.cronExpr,
      enabled: true,
      runInput: {
        phase: form.phase,
        task: form.task,
        bindings: ROLES.map((role) => ({
          role,
          channelId: form.channelId,
          model: form.model,
        })),
        stopConditions: {
          maxIterations: 3,
          maxTokens: null,
          maxCostUsd: null,
          timeoutMs: null,
          stopOnApproval: true,
        },
      },
    });
    Object.assign(form, { name: '', task: '' });
    showForm.value = false;
    await refresh();
  } catch (e) {
    error.value = e instanceof Error ? e.message : '创建失败';
  }
}

async function toggle(s: Schedule): Promise<void> {
  await schedulesApi.setEnabled(s.id, !s.enabled);
  await refresh();
}

async function remove(id: string): Promise<void> {
  await schedulesApi.remove(id);
  await refresh();
}

onMounted(refresh);
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-center justify-between">
      <span class="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint"
        >定时任务</span
      >
      <button
        class="rounded border border-panel-line px-2 py-0.5 font-mono text-[11px] text-flow hover:border-flow"
        @click="showForm = !showForm"
      >
        {{ showForm ? '取消' : '+ 新增' }}
      </button>
    </div>

    <div
      v-for="s in schedules"
      :key="s.id"
      class="flex items-center gap-2 rounded border border-panel-line bg-panel-raised/50 px-2.5 py-1.5"
    >
      <button
        class="h-1.5 w-1.5 rounded-full"
        :class="s.enabled ? 'bg-ok' : 'bg-ink-faint'"
        :title="s.enabled ? '点击停用' : '点击启用'"
        @click="toggle(s)"
      />
      <span class="font-mono text-xs text-ink-bright">{{ s.name }}</span>
      <span class="font-mono text-[10px] text-flow">{{ s.cronExpr }}</span>
      <span class="font-mono text-[10px] text-ink-faint">{{
        PHASE_LABELS[s.runInput.phase]
      }}</span>
      <button
        class="ml-auto font-mono text-[11px] text-ink-faint hover:text-warn"
        @click="remove(s.id)"
      >
        删除
      </button>
    </div>
    <p
      v-if="schedules.length === 0 && !showForm"
      class="font-mono text-[11px] text-ink-faint"
    >
      无定时任务。可配置 cron 表达式定时触发某阶段运行（无人值守）。
    </p>

    <form
      v-if="showForm"
      class="flex flex-col gap-2 rounded border border-panel-line p-2.5"
      @submit.prevent="submit"
    >
      <input v-model="form.name" placeholder="任务名称" class="sc-input" />
      <input v-model="form.cronExpr" placeholder="cron 表达式（如 0 9 * * *）" class="sc-input" />
      <select v-model="form.phase" class="sc-input">
        <option v-for="p in PHASES" :key="p" :value="p">{{ PHASE_LABELS[p] }}</option>
      </select>
      <textarea
        v-model="form.task"
        rows="2"
        placeholder="任务描述"
        class="sc-input resize-none"
      />
      <div class="flex gap-2">
        <select v-model="form.channelId" class="sc-input flex-1">
          <option value="" disabled>渠道</option>
          <option v-for="c in channels" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
        <input v-model="form.model" placeholder="模型名" class="sc-input w-28" />
      </div>
      <p v-if="error" class="font-mono text-[10px] text-warn">{{ error }}</p>
      <button
        type="submit"
        class="rounded bg-flow/90 px-2 py-1 font-mono text-xs font-semibold text-panel-void hover:bg-flow"
      >
        保存定时任务
      </button>
    </form>
  </div>
</template>

<style scoped>
.sc-input {
  border-radius: 0.25rem;
  border: 1px solid var(--color-panel-line);
  background-color: var(--color-panel-void);
  padding: 0.375rem 0.5rem;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-ink-bright);
}
.sc-input:focus {
  outline: none;
  border-color: var(--color-flow);
}
</style>
