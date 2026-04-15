import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Agentic Framework",
  description: "面向 agent 执行观测的 TypeScript monorepo 文档",
  lang: "zh-CN",
  themeConfig: {
    nav: [
      { text: "指南", link: "/guide/overview" },
      { text: "快速开始", link: "/guide/getting-started" },
      { text: "jsbridge 接入", link: "/guide/jsbridge-integration" },
      { text: "Harness Skill 生成", link: "/guide/harness-skill-generation" },
      { text: "Agent 会话", link: "/guide/agent-sessions" },
    ],
    sidebar: [
      {
        text: "指南",
        items: [
          { text: "概述", link: "/guide/overview" },
          { text: "架构", link: "/guide/architecture" },
          { text: "快速开始", link: "/guide/getting-started" },
          { text: "示例应用（example）", link: "/guide/example-app" },
          { text: "jsbridge 接入", link: "/guide/jsbridge-integration" },
      { text: "Harness Skill 生成", link: "/guide/harness-skill-generation" },
      { text: "Agent 会话", link: "/guide/agent-sessions" },
          { text: "环境变量", link: "/guide/environment" },
          { text: "HTTP API", link: "/guide/api" },
          { text: "扩展 Provider", link: "/guide/extending" },
        ],
      },
    ],
    footer: {
      message: "Agentic Framework 一期文档",
    },
  },
});
