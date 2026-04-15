# 概述

**Agentic Framework（一期）** 面向 **agent 执行观测**：在执行侧通过 **jsbridge** 批量上报 CLI、大模型调用链、元信息等快照；**API Server** 将事件落库（SQLite）；**UI** 用于查看 Run 与时间线。支持 **单 agent** 与 **多 agent** 场景，通过 `runId` 与 `agentId` 区分与过滤。

## 一期范围

- 观测不同 agent / coding 场景下的执行过程，便于回溯「执行了什么命令、模型输入输出」等。
- 执行侧支持 **DeepSeek** 与 **Claude Code** 两类集成路径；设计上可在 `jsbridge` 中扩展到其他 coding 模型。
- 提供 **UI**、**API Server**，并通过 **jsbridge（SDK）** 与 **example** 演示端到端接入方式。

## 今日能力更新（Skill 相关）

- **Skill 生成支持 `fileTree`**：在原有 `files[]` 外，新增树形文件结构表达，且保持向后兼容。
- **Skill 生成稳定性增强**：服务端调用大模型优先尝试 `json_schema`，失败自动回退到 `json_object/plain`，并在必要时触发一次修复重试。
- **Harness Skill 生成模块**：支持基于 run 观测一键提炼 skill 草案，详见 [Harness Skill 生成模块](./harness-skill-generation.md)。
- **Agent 会话模块**：支持会话同步、检索、蒸馏与转 run，详见 [Agent 会话](./agent-sessions.md)。
- **Skill 库 UI 重构**：
  - 列表按 `skillId`（并区分 `format`）分组展示版本链（`vN`）。
  - 操作列统一入口：`详情`、`人工反馈`、`治理`、`演进优化`。
  - 治理、演进优化、人工反馈均已拆分为独立页面，详情页聚焦基础信息与文件内容。

更完整的产品目标与背景说明见仓库根目录的 `plan.md`（开发时以该文件为准，避免与文档站内容重复维护）。

## 仓库中的包


| 路径                  | 包 / 说明                                                 |
| ------------------- | ------------------------------------------------------ |
| `packages/shared`   | `@agentic/shared`：Zod 协议、`apiPaths`                    |
| `packages/server`   | `@agentic/server`：Hono + SQLite                        |
| `packages/jsbridge` | `@agentic/jsbridge`：上报客户端、DeepSeek / Claude Code 子进程包装 |
| `packages/ui`       | `@agentic/ui`：Vite + React 观测台                         |
| `apps/example`      | 端到端演示（伪造事件 + 子进程包装）                                    |


## 环境要求

- Node.js 18+（内置 `fetch`）
- npm（workspaces）

