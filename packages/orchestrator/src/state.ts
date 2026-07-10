import { Annotation } from '@langchain/langgraph';
import type { NodeState, Phase, RoleBinding, StopConditions } from '@aiwf/shared';

/**
 * LangGraph 状态定义。每次节点返回的增量都会生成一个 checkpoint，
 * 从而天然支持持久化、断点恢复与时间旅行回退。
 */
export const OrchestratorState = Annotation.Root({
  runId: Annotation<string>(),
  phase: Annotation<Phase>(),
  task: Annotation<string>(),

  /** 角色绑定（研/执/审各自的渠道与模型），运行期只读。 */
  bindings: Annotation<RoleBinding[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  stopConditions: Annotation<StopConditions>({
    reducer: (_prev, next) => next,
    default: () => ({
      maxIterations: 3,
      maxTokens: null,
      maxCostUsd: null,
      timeoutMs: null,
      stopOnApproval: true,
    }),
  }),

  /** 调研阶段产出的上下文，传递给执行节点。 */
  research: Annotation<string>({ reducer: (_p, n) => n, default: () => '' }),
  /** 执行阶段产出的成果。 */
  execution: Annotation<string>({ reducer: (_p, n) => n, default: () => '' }),
  /** 审查意见。 */
  reviewNotes: Annotation<string>({ reducer: (_p, n) => n, default: () => '' }),

  iteration: Annotation<number>({ reducer: (_p, n) => n, default: () => 0 }),
  approved: Annotation<boolean>({ reducer: (_p, n) => n, default: () => false }),

  /** 三节点的实时状态，驱动前端图高亮。 */
  nodes: Annotation<NodeState[]>({
    reducer: (_prev, next) => next,
    default: () => [
      { role: 'research', status: 'pending', output: '' },
      { role: 'execute', status: 'pending', output: '' },
      { role: 'review', status: 'pending', output: '' },
    ],
  }),
});

export type OrchestratorStateType = typeof OrchestratorState.State;
