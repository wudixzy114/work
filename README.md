# work

> **一个 pnpm monorepo 形式的多服务系统模板。**
> 包含 5 个核心 package + 1 个 web 前端，已升级到"商用级"（5 层全面升级）。

## 架构

```
work/
├─ apps/
│  └─ web/                    # Vite + React + TS 前端
├─ packages/
│  ├─ shared/                 # 跨包共享类型、常量、协议
│  ├─ adapter/                # 外部协议适配层（数据库 / 第三方 API）
│  ├─ control/                # 控制面（调度、配置、生命周期）
│  ├─ monitor/                # 监控面（日志、指标、健康检查）
│  ├─ orchestrator/           # 编排面（多服务协同、状态机）
│  └─ server/                 # 服务入口（HTTP / WebSocket）
├─ package.json
├─ pnpm-lock.yaml
├─ tsconfig.base.json
├─ .prettierrc.json
├─ eslint.config.js
└─ 需求清单.md                  # v0.0.5 升级需求
```

## 5 层模型

| 层 | 包 | 职责 |
|---|---|---|
| 1. 入口 | `server` | HTTP/WebSocket 接收，对外暴露 API |
| 2. 编排 | `orchestrator` | 业务状态机，跨服务协调 |
| 3. 控制 | `control` | 配置中心、生命周期、调度 |
| 4. 适配 | `adapter` | 异构系统接入（DB / 消息队列 / 第三方） |
| 5. 监控 | `monitor` | 观测性：日志 / metrics / trace |
| 共享 | `shared` | 类型、协议、常量 |

## 技术栈

- **包管理**：pnpm（monorepo）
- **语言**：TypeScript（strict 模式）
- **构建**：Vite（前端）+ tsc（后端）
- **代码质量**：ESLint + Prettier
- **测试**：未集成（v0.0.6 计划）

## 已完成

- ✅ 5 层骨架，每层有独立 package.json 和 tsconfig
- ✅ shared 层的类型 + 协议定义
- ✅ server 入口（HTTP）
- ✅ web 前端（占位页）

## 进行中

- ⏳ orchestrator 状态机引擎
- ⏳ adapter 层具体实现（DB / 第三方）
- ⏳ monitor 的指标采集

## 本地开发

```bash
pnpm install
pnpm --filter server dev          # 起后端
pnpm --filter web dev             # 起前端
```

## 设计动机

最初是为了解决"多个小工具各自一套配置、互相 import、循环依赖"的问题。
把每个工具的边界用 package 划清，跨包调用走 `shared` 协议，
服务编排走 `orchestrator`，基础设施走 `control` / `adapter` / `monitor`。

## 状态

- **v0.0.5** — 5 层全面升级至商用级骨架
- 实际部署在另一个内部仓库（私有），此仓库是模板/参考实现

## License

MIT
