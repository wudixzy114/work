<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { channelsApi } from '@/lib/api';
import { useSessionStore } from '@/stores/session';
import type { Channel, ProviderKind } from '@aiwf/shared';
import HealthBadge from './HealthBadge.vue';

const session = useSessionStore();
const channels = ref<Channel[]>([]);
const showForm = ref(false);
const editingId = ref<string | null>(null);
const error = ref('');

const blank = () => ({
  name: '',
  kind: 'openai' as ProviderKind,
  baseUrl: '',
  apiKey: '',
  weight: 1,
  timeoutMs: 60_000,
  maxRetries: 2,
  enabled: true,
});
const form = reactive(blank());

const healthById = computed(() => session.health);

async function refresh(): Promise<void> {
  channels.value = await channelsApi.list();
}

function openCreate(): void {
  editingId.value = null;
  Object.assign(form, blank());
  showForm.value = true;
}

function openEdit(c: Channel): void {
  editingId.value = c.id;
  Object.assign(form, {
    name: c.name,
    kind: c.kind,
    baseUrl: c.baseUrl,
    apiKey: c.apiKey,
    weight: c.weight,
    timeoutMs: c.timeoutMs,
    maxRetries: c.maxRetries,
    enabled: c.enabled,
  });
  showForm.value = true;
}

async function submit(): Promise<void> {
  error.value = '';
  if (!form.name || !form.baseUrl || !form.apiKey) {
    error.value = '请填写名称、Base URL 与 Key';
    return;
  }
  const payload = {
    name: form.name,
    kind: form.kind,
    baseUrl: form.baseUrl,
    apiKey: form.apiKey,
    modelMap: {},
    weight: form.weight,
    enabled: form.enabled,
    timeoutMs: form.timeoutMs,
    maxRetries: form.maxRetries,
  };
  try {
    if (editingId.value) await channelsApi.update(editingId.value, payload);
    else await channelsApi.create(payload);
    showForm.value = false;
    editingId.value = null;
    await refresh();
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败';
  }
}

async function remove(id: string): Promise<void> {
  await channelsApi.remove(id);
  await refresh();
}

async function probe(id: string): Promise<void> {
  try {
    await channelsApi.probe(id);
  } catch {
    // 健康状态经 WS 广播回来，这里静默
  }
}

onMounted(refresh);
defineExpose({ channels, refresh });
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-center justify-between">
      <span class="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint"
        >渠道</span
      >
      <button
        class="rounded border border-panel-line px-2 py-0.5 font-mono text-[11px] text-flow hover:border-flow"
        @click="showForm ? (showForm = false) : openCreate()"
      >
        {{ showForm ? '取消' : '+ 新增' }}
      </button>
    </div>

    <div
      v-for="c in channels"
      :key="c.id"
      class="flex flex-col gap-1 rounded border border-panel-line bg-panel-raised/50 px-2.5 py-1.5"
    >
      <div class="flex items-center gap-2">
        <span
          class="h-1.5 w-1.5 rounded-full"
          :class="c.enabled ? 'bg-ok' : 'bg-ink-faint'"
        />
        <span class="font-mono text-xs text-ink-bright">{{ c.name }}</span>
        <span class="font-mono text-[10px] text-ink-faint">{{ c.kind }}</span>
        <div class="ml-auto flex items-center gap-2">
          <button
            class="font-mono text-[11px] text-ink-faint hover:text-flow"
            @click="probe(c.id)"
          >
            探活
          </button>
          <button
            class="font-mono text-[11px] text-ink-faint hover:text-ink-bright"
            @click="openEdit(c)"
          >
            编辑
          </button>
          <button
            class="font-mono text-[11px] text-ink-faint hover:text-warn"
            @click="remove(c.id)"
          >
            删除
          </button>
        </div>
      </div>
      <HealthBadge :health="healthById.get(c.id)" />
    </div>
    <p
      v-if="channels.length === 0 && !showForm"
      class="font-mono text-[11px] text-ink-faint"
    >
      尚无渠道。新增一个中转/内网端点以开始。
    </p>

    <form
      v-if="showForm"
      class="flex flex-col gap-2 rounded border border-panel-line p-2.5"
      @submit.prevent="submit"
    >
      <input v-model="form.name" placeholder="名称" class="ctl-input" />
      <select v-model="form.kind" class="ctl-input">
        <option value="openai">OpenAI 协议</option>
        <option value="anthropic">Anthropic 协议</option>
      </select>
      <input
        v-model="form.baseUrl"
        placeholder="Base URL（如 https://中转/v1）"
        class="ctl-input"
      />
      <input
        v-model="form.apiKey"
        type="password"
        placeholder="API Key"
        class="ctl-input"
      />
      <div class="flex gap-2">
        <label class="flex flex-1 flex-col gap-0.5">
          <span class="ctl-hint">权重</span>
          <input v-model.number="form.weight" type="number" min="1" class="ctl-input" />
        </label>
        <label class="flex flex-1 flex-col gap-0.5">
          <span class="ctl-hint">超时(ms)</span>
          <input
            v-model.number="form.timeoutMs"
            type="number"
            min="1000"
            step="1000"
            class="ctl-input"
          />
        </label>
        <label class="flex flex-1 flex-col gap-0.5">
          <span class="ctl-hint">重试</span>
          <input v-model.number="form.maxRetries" type="number" min="0" class="ctl-input" />
        </label>
      </div>
      <p v-if="error" class="font-mono text-[10px] text-warn">{{ error }}</p>
      <button
        type="submit"
        class="rounded bg-flow/90 px-2 py-1 font-mono text-xs font-semibold text-panel-void hover:bg-flow"
      >
        {{ editingId ? '更新渠道' : '保存渠道' }}
      </button>
    </form>
  </div>
</template>

<style scoped>
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
.ctl-hint {
  font-family: var(--font-mono);
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--color-ink-faint);
}
</style>
