<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { channelsApi } from '@/lib/api';
import type { Channel, ProviderKind } from '@aiwf/shared';

const channels = ref<Channel[]>([]);
const showForm = ref(false);

const form = reactive({
  name: '',
  kind: 'openai' as ProviderKind,
  baseUrl: '',
  apiKey: '',
  model: '',
});

async function refresh(): Promise<void> {
  channels.value = await channelsApi.list();
}

async function submit(): Promise<void> {
  if (!form.name || !form.baseUrl || !form.apiKey) return;
  await channelsApi.create({
    name: form.name,
    kind: form.kind,
    baseUrl: form.baseUrl,
    apiKey: form.apiKey,
    modelMap: {},
    weight: 1,
    enabled: true,
  });
  Object.assign(form, { name: '', baseUrl: '', apiKey: '', model: '' });
  showForm.value = false;
  await refresh();
}

async function remove(id: string): Promise<void> {
  await channelsApi.remove(id);
  await refresh();
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
        @click="showForm = !showForm"
      >
        {{ showForm ? '取消' : '+ 新增' }}
      </button>
    </div>

    <div
      v-for="c in channels"
      :key="c.id"
      class="flex items-center gap-2 rounded border border-panel-line bg-panel-raised/50 px-2.5 py-1.5"
    >
      <span class="h-1.5 w-1.5 rounded-full" :class="c.enabled ? 'bg-ok' : 'bg-ink-faint'" />
      <span class="font-mono text-xs text-ink-bright">{{ c.name }}</span>
      <span class="font-mono text-[10px] text-ink-faint">{{ c.kind }}</span>
      <button
        class="ml-auto font-mono text-[11px] text-ink-faint hover:text-warn"
        @click="remove(c.id)"
      >
        删除
      </button>
    </div>
    <p v-if="channels.length === 0 && !showForm" class="font-mono text-[11px] text-ink-faint">
      尚无渠道。新增一个中转/内网端点以开始。
    </p>

    <form v-if="showForm" class="flex flex-col gap-2 rounded border border-panel-line p-2.5" @submit.prevent="submit">
      <input v-model="form.name" placeholder="名称" class="ctl-input" />
      <select v-model="form.kind" class="ctl-input">
        <option value="openai">OpenAI 协议</option>
        <option value="anthropic">Anthropic 协议</option>
      </select>
      <input v-model="form.baseUrl" placeholder="Base URL（如 https://中转/v1）" class="ctl-input" />
      <input v-model="form.apiKey" type="password" placeholder="API Key" class="ctl-input" />
      <button type="submit" class="rounded bg-flow/90 px-2 py-1 font-mono text-xs font-semibold text-panel-void hover:bg-flow">
        保存渠道
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
</style>
