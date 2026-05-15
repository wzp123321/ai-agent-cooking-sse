# cooking-ai

> 🍳 基于 DeepSeek 的做菜智能体（Vue3 前端 + Node.js Agent 后端）

## 项目结构

```
cooking-ai/
├── cooking-agent/          ← Node.js Agent 后端（TypeScript，端口 3001）
│   ├── src/
│   │   ├── index.ts        ← Express 服务入口
│   │   ├── agent.ts        ← CookingAgent 核心（ReAct + Function Calling）
│   │   ├── prompts.ts      ← 系统提示词（动态生成工具描述）
│   │   ├── types.ts        ← 核心类型
│   │   └── tools/          ← 工具目录
│   │       ├── types.ts    ← 工具类型定义
│   │       ├── index.ts    ← 工具注册表
│   │       ├── recipe.ts   ← 菜谱查询
│   │       ├── nutrition.ts← 营养计算
│   │       ├── safety.ts   ← 食品安全
│   │       ├── technique.ts← 烹饪技法
│   │       └── suggest.ts  ← 食材推荐
│   └── README.md
│
└── cooking-app/            ← Vue3 前端（端口 5173）
    ├── src/
    │   ├── views/ChatView.vue
    │   ├── components/
    │   │   ├── SidebarPanel.vue
    │   │   ├── MessageList.vue
    │   │   ├── MessageBubble.vue
    │   │   └── InputBar.vue
    │   ├── stores/chat.ts      ← Pinia 状态管理
    │   ├── api/chat.ts         ← TypeScript API 客户端（SSE）
    │   ├── router/index.ts     ← Vue Router
    │   └── types/index.ts      ← 前端 TS 类型
    └── README.md
```

## 核心特性

| 特性 | 说明 |
|------|------|
| 🤖 **真正的 Agent** | ReAct 推理循环 + Function Calling |
| 🔧 **5 大工具** | 菜谱 / 营养 / 安全 / 技法 / 推荐 |
| ⚡ **流式响应** | SSE 打字机效果 |
| 💬 **多轮对话** | Session 级别记忆 |
| 📱 **响应式** | 移动端适配 |

## 快速启动

**第一步：配置 Agent**

```bash
cd cooking-ai/cooking-agent
cp .env.example .env
# 填入 DEEPSEEK_API_KEY=sk-xxxxxxxx

npm install
npm run dev   # 开发模式（tsc --watch）
```

**第二步：启动前端**

```bash
cd cooking-ai/cooking-app
npm install
npm run dev   # 访问 http://localhost:5173
```

## Agent 工具说明

| 工具 | 触发场景 | 示例问题 |
|------|---------|---------|
| `search_recipe` | 问菜谱做法 | "红烧肉怎么做" |
| `calculate_nutrition` | 问营养热量 | "这道菜减肥能吃吗" |
| `check_food_safety` | 问食品安全 | "四季豆能吃吗" |
| `explain_technique` | 问烹饪技法 | "炒菜怎么才不粘锅" |
| `suggest_dishes` | 问食材推荐 | "我冰箱里有鸡胸肉和西兰花，能做什么" |

## 技术栈

**后端**：`TypeScript` + `Node.js` + `Express` + `OpenAI SDK`

**前端**：`Vue 3` + `Vite` + `Pinia` + `Vue Router` + `TypeScript` + `Element Plus`
