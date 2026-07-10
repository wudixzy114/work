<script setup lang="ts">
import { computed } from 'vue';
import { VueFlow, type Edge, type Node } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { useSessionStore } from '@/stores/session';
import { ROLE_LABELS, type NodeState, type Role } from '@aiwf/shared';
import AgentNode from './AgentNode.vue';

const session = useSessionStore();

const ORDER: Role[] = ['research', 'execute', 'review'];

function nodeState(role: Role): NodeState | null {
  return session.run?.nodes.find((n) => n.role === role) ?? null;
}

const nodes = computed<Node[]>(() =>
  ORDER.map((role, i) => ({
    id: role,
    type: 'agent',
    position: { x: i * 320, y: 80 },
    data: { label: ROLE_LABELS[role], role, node: nodeState(role) },
  })),
);

/** 边仅在其源节点已完成、目标节点激活/完成时“流动”，如实反映数据传递。 */
function edgeActive(from: Role, to: Role): boolean {
  const src = nodeState(from)?.status;
  const dst = nodeState(to)?.status;
  return (src === 'done' && (dst === 'active' || dst === 'done')) || false;
}

const edges = computed<Edge[]>(() => {
  const base: Array<[Role, Role]> = [
    ['research', 'execute'],
    ['execute', 'review'],
  ];
  const list: Edge[] = base.map(([from, to]) => ({
    id: `${from}-${to}`,
    source: from,
    target: to,
    animated: edgeActive(from, to),
    style: {
      stroke: edgeActive(from, to) ? 'var(--color-flow)' : 'var(--color-panel-line)',
      strokeWidth: 2,
    },
  }));
  // 审查驳回时的回退边：review -> execute。
  const rejected =
    nodeState('review')?.status === 'done' && session.run?.approved === false;
  list.push({
    id: 'review-execute-loop',
    source: 'review',
    target: 'execute',
    animated: rejected,
    label: '驳回回退',
    labelStyle: { fill: 'var(--color-warn)', fontFamily: 'var(--font-mono)', fontSize: '10px' },
    style: {
      stroke: rejected ? 'var(--color-warn)' : 'transparent',
      strokeWidth: 2,
      strokeDasharray: '4 4',
    },
    type: 'smoothstep',
  });
  return list;
});
</script>

<template>
  <VueFlow
    :nodes="nodes"
    :edges="edges"
    :nodes-draggable="false"
    :nodes-connectable="false"
    :elements-selectable="false"
    fit-view-on-init
    class="h-full w-full"
  >
    <template #node-agent="nodeProps">
      <AgentNode :data="nodeProps.data" />
    </template>
    <Background :gap="24" :size="1" pattern-color="#1e2b45" />
  </VueFlow>
</template>
