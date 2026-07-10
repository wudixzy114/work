import type { Role, RoleBinding } from '@aiwf/shared';
import type { AdapterClient, ChatMessage } from '@aiwf/adapter';

/** 从绑定列表中取出某角色的渠道与模型。 */
export function bindingFor(bindings: RoleBinding[], role: Role): RoleBinding {
  const found = bindings.find((b) => b.role === role);
  if (!found) throw new Error(`角色 ${role} 未绑定渠道`);
  return found;
}

/** 各角色的系统提示词，体现「强模型调研 / 执行模型执行 / 最强模型审查」的分工。 */
const SYSTEM_PROMPTS: Record<Role, string> = {
  research:
    '你是资深技术调研员。针对给定任务，产出简明的实现要点、关键约束与推荐方案，供执行者直接落地。',
  execute:
    '你是执行工程师。基于调研结论完成具体产出。只输出成果本身，力求可用、正确。',
  review:
    '你是最严格的代码审查者。审查执行成果是否满足任务要求。若通过，回复以「APPROVED」开头；否则以「REJECTED」开头并给出必须修改的点。',
};

/** 用指定角色的绑定，经 adapter 发起一次真实调用，返回文本。 */
export async function invokeRole(
  client: AdapterClient,
  bindings: RoleBinding[],
  role: Role,
  runId: string,
  userContent: string,
): Promise<string> {
  const binding = bindingFor(bindings, role);
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPTS[role] },
    { role: 'user', content: userContent },
  ];
  const res = await client.chat(
    binding.channelId,
    { model: binding.model, messages, temperature: role === 'review' ? 0 : 0.7 },
    { runId, role },
  );
  return res.text;
}
