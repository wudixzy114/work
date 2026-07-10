import { buildDevGraph } from './dev.js';
import type { AdapterClient } from '@aiwf/adapter';
import type { Phase } from '@aiwf/shared';

/**
 * 其余四阶段（修复/重构/维护/上线）当前复用与开发阶段同构的三模型骨架。
 * 首里程碑先保证结构齐全、可运行；后续里程碑各自定制提示词与节点。
 */
export function buildFixGraph(client: AdapterClient) {
  return buildDevGraph(client);
}
export function buildRefactorGraph(client: AdapterClient) {
  return buildDevGraph(client);
}
export function buildMaintainGraph(client: AdapterClient) {
  return buildDevGraph(client);
}
export function buildReleaseGraph(client: AdapterClient) {
  return buildDevGraph(client);
}

export function buildGraphForPhase(client: AdapterClient, phase: Phase) {
  switch (phase) {
    case 'develop':
      return buildDevGraph(client);
    case 'fix':
      return buildFixGraph(client);
    case 'refactor':
      return buildRefactorGraph(client);
    case 'maintain':
      return buildMaintainGraph(client);
    case 'release':
      return buildReleaseGraph(client);
  }
}
