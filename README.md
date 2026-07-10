# AI 协作工作流编排系统

本地可持久化、可恢复、可回退的多智能体 AI 协作工作流。把每个厂商 Agent 当作独立能力单元，用一套编排流程串起来（调研 → 执行 → 审查），去掉"人当保姆盯着点继续"的角色。

## 架构（5 层 + 前端）

Monorepo（npm workspaces），后端 TypeScript + LangGraph.js，前端 Vue 3 + Tailwind + Vue Flow。

```
packages/
  shared/        ① 共享 zod schema + WS 协议（前后端单一类型来源）
  adapter/       ② 网关：渠道注册、负载均衡+熔断、OpenAI/Anthropic 协议转换、统一 client
  monitor/       ③ 监控：采集真实用量、SQLite 落库、事件总线（禁止乐观更新）
  orchestrator/  ④ 编排：LangGraph 三模型图（研→执→审）、SqliteSaver 持久化/回退
  control/       ⑤ 控制：起停、定时（node-cron）、停止条件
  server/        Fastify + WebSocket 聚合对外
apps/
  web/           Vue 看板：编排图 + 实时监控 + 控制面板
```

数据流：`web ⇄(WS/HTTP)⇄ server ⇄ orchestrator(LangGraph) ⇄ adapter(网关) ⇄ 远程/中转 API`。

## 已实现能力（首里程碑）

- **可持久化 / 可恢复**：LangGraph SqliteSaver 落地每步 checkpoint，进程重启后可从 SQLite 恢复运行态。
- **可回退**：时间旅行，回退到任意历史 checkpoint 重跑。
- **三模型流程**：调研（强模型）→ 执行（执行模型）→ 审查（最强模型），审查驳回自动回退到执行重做。
- **网关**：借鉴 New API，多渠道 + 加权负载均衡 + 失败熔断 + OpenAI/Anthropic 双协议转换，消解厂商差异。
- **真实监控**：token / 缓存命中 / 成本 / 延迟 / 回退，全部来自上游实际返回，无乐观预测。
- **实时可视化**：Vue Flow 编排图，节点在真实进入时点亮 amber，边在数据真实传递时流动。
- fix / refactor / maintain / release 四阶段为同构骨架，后续里程碑定制。

## 运行

```bash
npm install
npm run build

# 起后端（默认 127.0.0.1:8787，可用 PORT 覆盖）
PORT=8787 npm run dev:server

# 另开终端起前端（默认 5173，自动代理 /api 与 /ws 到后端）
npm run dev:web
```

打开前端后：在"渠道网关"新增一个渠道（填中转/内网的 Base URL + Key），在"运行控制"填任务、为三个角色各绑一个渠道与模型，点"启动运行"。

> 若改了后端端口，需同步更新 `apps/web/vite.config.ts` 的 proxy target。

## 质量

```bash
npm run typecheck   # 全 workspace 严格类型检查
npm run lint        # ESLint (typescript-eslint + eslint-plugin-vue)
npm run format      # Prettier
```
