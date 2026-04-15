# 快速开始

## 1. 配置环境变量

在 **monorepo 根目录** 复制模板并编辑：

```bash
cp .env.example .env
```

建议至少设置 `AGENTIC_SERVER_TOKEN`（与 ingest 使用的 Bearer 一致）。**Server、Example、UI 均从仓库根目录读取 `.env`**，与从哪个子包启动无关。

## 2. 安装与构建

```bash
npm install
npm run build
```

`build` 按依赖顺序编译：`shared` → `jsbridge` → `server` → `ui`。

## 3. 启动服务

**API（开发热重载，需已构建各包或至少 shared / jsbridge）：**

```bash
npm run dev:server
```

生产形态可先全量 `npm run build`，再：

```bash
npm run start -w @agentic/server
```

**UI：**

```bash
npm run dev:ui
```

浏览器访问终端提示的地址（默认 Vite `5173`）。API 基地址来自根目录 `.env` 的 `AGENTIC_BASE_URL` 或 `VITE_API_BASE`（详见 [环境变量](./environment.md)）。

**注入演示数据（可选）：**

```bash
npm run start:example
```

在 UI 的 Run 列表中应能看到新 Run 与多 `agentId` 事件。示例行为说明见 [示例应用（example）](./example-app.md)；SDK 接入步骤见 [jsbridge 接入](./jsbridge-integration.md)。

## UI 技能库入口（新增）

- 顶部导航进入 `Skill 库` 页面后，列表按 `skillId` 分组并展示版本链。
- 每个版本行在操作列可直接进入：
  - `详情`（基础信息与文件）
  - `人工反馈`
  - `治理`
  - `演进优化`
- 三个深度模块（人工反馈/治理/演进优化）已独立成页面，便于按职责操作。

## 4. 文档站（本目录）

```bash
npm run docs:dev
```

在仓库根执行；构建静态站点：`npm run docs:build`。

## 根目录脚本一览


| 脚本                      | 作用              |
| ----------------------- | --------------- |
| `npm run build`         | 全量构建业务包         |
| `npm run dev:server`    | 开发启动 Server     |
| `npm run dev:ui`        | 开发启动 UI         |
| `npm run start:example` | 运行 example      |
| `npm run docs:dev`      | 启动 VitePress 文档 |
| `npm run docs:build`    | 构建文档静态资源        |
| `npm run docs:preview`  | 预览构建后的文档        |


