import { buildPhaseGraph } from './dev.js';
import type { AdapterClient } from '@aiwf/adapter';
import type { Phase } from '@aiwf/shared';

/**
 * 按阶段构建图。五阶段共享三模型骨架，但各自的调研/执行/审查提示词不同
 * （见 prompts.ts），因此行为真实分化，而非复用同一套逻辑。
 */
export function buildGraphForPhase(client: AdapterClient, phase: Phase) {
  return buildPhaseGraph(client, phase);
}
