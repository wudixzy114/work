import { StateGraph, START, END } from '@langchain/langgraph';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import type { NodeState, Phase, Role } from '@aiwf/shared';
import type { AdapterClient } from '@aiwf/adapter';
import { OrchestratorState, type OrchestratorStateType } from '../state.js';
import { invokeRoleStream } from '../roles.js';

/** 节点进入时发出的真实信号（用于前端把该节点点亮为 active）。 */
export interface ActiveSignal {
  active: Role;
}

/** 逐 token 输出信号，用于前端实时渲染当前 Agent 的输出。 */
export interface TokenSignal {
  token: { role: Role; delta: string };
}

export type CustomSignal = ActiveSignal | TokenSignal;

/** 更新某角色节点的状态与输出，返回新的 nodes 数组（不可变更新）。 */
function setNode(
  nodes: NodeState[],
  role: Role,
  status: NodeState['status'],
  output?: string,
): NodeState[] {
  return nodes.map((n) =>
    n.role === role ? { ...n, status, output: output ?? n.output } : n,
  );
}

function emitActive(config: LangGraphRunnableConfig, role: Role): void {
  config.writer?.({ active: role } satisfies ActiveSignal);
}

function emitToken(config: LangGraphRunnableConfig, role: Role, delta: string): void {
  config.writer?.({ token: { role, delta } } satisfies TokenSignal);
}

/**
 * 通用三模型阶段图：调研（强模型）→ 执行（执行模型）→ 审查（最强模型）。
 * 审查不通过则回退到执行节点重做，直至通过或达到最大轮次。
 * 各阶段通过 phase 决定专属提示词（见 prompts.ts），行为差异真实存在。
 * 节点输出以真实流式逐 token 上报（emitToken），非乐观预测。
 */
export function buildPhaseGraph(client: AdapterClient, phase: Phase) {
  const research = async (
    s: OrchestratorStateType,
    config: LangGraphRunnableConfig,
  ): Promise<Partial<OrchestratorStateType>> => {
    emitActive(config, 'research');
    const text = await invokeRoleStream(
      client,
      s.bindings,
      phase,
      'research',
      s.runId,
      s.task,
      (d) => emitToken(config, 'research', d),
    );
    return {
      research: text,
      nodes: setNode(s.nodes, 'research', 'done', text),
    };
  };

  const execute = async (
    s: OrchestratorStateType,
    config: LangGraphRunnableConfig,
  ): Promise<Partial<OrchestratorStateType>> => {
    emitActive(config, 'execute');
    const prompt = [
      `任务：${s.task}`,
      `调研结论：\n${s.research}`,
      s.reviewNotes ? `上一轮审查意见（需修正）：\n${s.reviewNotes}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
    const text = await invokeRoleStream(
      client,
      s.bindings,
      phase,
      'execute',
      s.runId,
      prompt,
      (d) => emitToken(config, 'execute', d),
    );
    return {
      execution: text,
      iteration: s.iteration + 1,
      nodes: setNode(s.nodes, 'execute', 'done', text),
    };
  };

  const review = async (
    s: OrchestratorStateType,
    config: LangGraphRunnableConfig,
  ): Promise<Partial<OrchestratorStateType>> => {
    emitActive(config, 'review');
    const prompt = `任务：${s.task}\n\n执行成果：\n${s.execution}`;
    const text = await invokeRoleStream(
      client,
      s.bindings,
      phase,
      'review',
      s.runId,
      prompt,
      (d) => emitToken(config, 'review', d),
    );
    const approved = /^\s*APPROVED/i.test(text);
    return {
      reviewNotes: text,
      approved,
      // 若驳回，重置执行节点为 pending，以便下一轮重新点亮。
      nodes: setNode(
        approved ? s.nodes : setNode(s.nodes, 'execute', 'pending'),
        'review',
        'done',
        text,
      ),
    };
  };

  /** 审查后的路由：通过或达最大轮次则结束，否则回退到执行重做。 */
  const routeAfterReview = (s: OrchestratorStateType): 'node_execute' | typeof END => {
    if (s.approved && s.stopConditions.stopOnApproval) return END;
    if (s.iteration >= s.stopConditions.maxIterations) return END;
    return 'node_execute';
  };

  // 节点名加 node_ 前缀，避免与同名状态通道（research/execute/review）冲突。
  return new StateGraph(OrchestratorState)
    .addNode('node_research', research)
    .addNode('node_execute', execute)
    .addNode('node_review', review)
    .addEdge(START, 'node_research')
    .addEdge('node_research', 'node_execute')
    .addEdge('node_execute', 'node_review')
    .addConditionalEdges('node_review', routeAfterReview, {
      node_execute: 'node_execute',
      [END]: END,
    });
}

/** 向后兼容别名：开发阶段图。 */
export function buildDevGraph(client: AdapterClient) {
  return buildPhaseGraph(client, 'develop');
}
