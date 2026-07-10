import type { Phase, Role, RoleBinding } from '@aiwf/shared';
import type { AdapterClient, ChatMessage } from '@aiwf/adapter';
import { systemPrompt } from './prompts.js';

/** 从绑定列表中取出某角色的渠道与模型。 */
export function bindingFor(bindings: RoleBinding[], role: Role): RoleBinding {
  const found = bindings.find((b) => b.role === role);
  if (!found) throw new Error(`角色 ${role} 未绑定渠道`);
  return found;
}

function buildMessages(
  phase: Phase,
  role: Role,
  userContent: string,
): ChatMessage[] {
  return [
    { role: 'system', content: systemPrompt(phase, role) },
    { role: 'user', content: userContent },
  ];
}

/** 用指定角色的绑定，经 adapter 发起一次真实调用，返回文本。 */
export async function invokeRole(
  client: AdapterClient,
  bindings: RoleBinding[],
  phase: Phase,
  role: Role,
  runId: string,
  userContent: string,
): Promise<string> {
  const binding = bindingFor(bindings, role);
  const res = await client.chat(
    binding.channelId,
    {
      model: binding.model,
      messages: buildMessages(phase, role, userContent),
      temperature: role === 'review' ? 0 : 0.7,
    },
    { runId, role },
  );
  return res.text;
}

/**
 * 流式调用：逐 token 回调 onDelta，用于前端实时渲染当前 Agent 输出。
 * 返回完整文本。
 */
export async function invokeRoleStream(
  client: AdapterClient,
  bindings: RoleBinding[],
  phase: Phase,
  role: Role,
  runId: string,
  userContent: string,
  onDelta: (delta: string) => void,
): Promise<string> {
  const binding = bindingFor(bindings, role);
  const res = await client.chatStream(
    binding.channelId,
    {
      model: binding.model,
      messages: buildMessages(phase, role, userContent),
      temperature: role === 'review' ? 0 : 0.7,
    },
    { runId, role },
    onDelta,
  );
  return res.text;
}
