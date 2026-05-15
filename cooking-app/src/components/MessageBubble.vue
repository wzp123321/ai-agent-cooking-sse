<template>
  <!--
    ═══════════════════════════════════════════════════════
    MessageBubble — 单条消息气泡组件
    ═══════════════════════════════════════════════════════
    设计说明：
      - 用户消息：橙色渐变背景，白色文字，右对齐（flex-direction: row-reverse）
      - AI 消息：卡片背景，深色文字，左对齐，内容支持 Markdown 渲染
      - AI 消息正在生成时：显示打字光标（streaming = true 时）

    渲染策略：
      - 用户消息：直接显示纯文本（不需要格式）
      - AI 消息：通过 marked 库将 Markdown 转换为 HTML，使用 v-html 渲染
      - typing-cursor：blink 动画，模拟真实打字效果
  -->
  <div class="message" :class="message.role">

    <!-- 头像区域 -->
    <div class="avatar" :class="`${message.role}-avatar`">
      {{ message.role === 'user' ? '👤' : '👨‍🍳' }}
    </div>

    <!-- 消息气泡 -->
    <div class="bubble" :class="message.role">

      <!-- 用户消息：纯文本展示 -->
      <template v-if="message.role === 'user'">
        {{ message.content }}
      </template>

      <!-- AI 消息：Markdown 渲染 + 打字光标 -->
      <template v-else>
        <!--
          v-html：直接将 marked 解析后的 HTML 插入 DOM
          安全性：AI 返回内容通过 marked 解析，不会执行脚本
          eslint-disable：关闭 vue/no-v-html 警告（已确认可信来源）
        -->
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div class="markdown-body" v-html="renderedContent" />

        <!-- 打字光标（AI 回复进行中时闪烁） -->
        <span v-if="message.streaming" class="typing-cursor" />
      </template>

    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * MessageBubble — 单条消息组件
 *
 * Props：
 *   - message: ChatMessage 对象
 *     - role: 'user' | 'assistant'
 *     - content: 消息文本（Markdown 格式或纯文本）
 *     - streaming: 是否正在流式生成（仅 assistant 消息使用）
 *
 * computed — renderedContent：
 *   - 用户消息：不需要渲染，直接由模板展示纯文本
 *   - AI 消息：通过 marked.parse() 将 Markdown 转为 HTML 字符串
 *   - marked 配置了 gfm: true（支持表格、删除线等 GitHub 扩展语法）
 */
import { computed } from 'vue'
import { marked } from 'marked'
import type { ChatMessage } from '@/types'

const props = defineProps<{ message: ChatMessage }>()

/**
 * Markdown 渲染结果
 *
 * marked.parse() 返回 string（同步模式）
 * 空内容返回空字符串，避免渲染空 div
 */
const renderedContent = computed(() => {
  if (!props.message.content) return ''
  return marked.parse(props.message.content) as string
})
</script>

<style scoped>
/* ── 基础布局 ─────────────────────────────────────────── */
.message {
  display: flex;
  gap: 12px;
  animation: fadeInUp 0.25s ease; /* 入场动画：向上淡入 */
  max-width: 860px;               /* 最大宽度，避免气泡过宽 */
}

/* 用户消息：右对齐 */
.message.user {
  flex-direction: row-reverse;
  margin-left: auto; /* 从右侧开始布局 */
}

/* 入场动画关键帧 */
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(8px); /* 轻微上移 */
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ── 头像 ─────────────────────────────────────────────── */
.avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  flex-shrink: 0;           /* 不参与 flex 压缩 */
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  align-self: flex-end;     /* 与气泡底部对齐 */
}

.user-avatar {
  background: var(--accent); /* 橙色背景 */
}

.assistant-avatar {
  background: var(--bg-card);
  border: 1px solid var(--border);
}

/* ── 气泡 ─────────────────────────────────────────────── */
.bubble {
  max-width: calc(100% - 52px); /* 留出头像和间距的空间 */
  padding: 12px 16px;
  border-radius: 16px;
  line-height: 1.7;       /* 行高，提升可读性 */
  font-size: 14px;
  word-break: break-word; /* 长单词/URL 换行 */
}

/* 用户气泡：橙色渐变 */
.bubble.user {
  background: linear-gradient(135deg, #ff6b35, #ff4500);
  color: #fff;
  border-bottom-right-radius: 4px; /* 右下角做尖角效果 */
}

/* AI 气泡：卡片背景 */
.bubble.assistant {
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text-primary);
  border-bottom-left-radius: 4px; /* 左下角做尖角效果 */
}

/* ── Markdown 内容样式 ───────────────────────────────── */
/* :deep() 穿透 scoped，选择 .markdown-body 内部的所有子元素 */
.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3) {
  color: var(--accent-light);
  margin: 12px 0 6px;
  font-weight: 600;
}

.markdown-body :deep(h2) { font-size: 15px; }
.markdown-body :deep(h3) { font-size: 14px; }
.markdown-body :deep(p) { margin: 6px 0; }

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  padding-left: 20px;
  margin: 6px 0;
}

.markdown-body :deep(li) { margin: 3px 0; }

/* 行内代码 */
.markdown-body :deep(code) {
  background: rgba(255, 107, 53, 0.12);
  color: var(--accent-light);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 13px;
  font-family: 'Courier New', monospace;
}

/* 代码块 */
.markdown-body :deep(pre) {
  background: #111;
  border-radius: 8px;
  padding: 12px;
  overflow-x: auto;        /* 水平滚动（代码块超出时） */
  margin: 10px 0;
}

.markdown-body :deep(pre code) {
  background: none;
  color: #d0d0d0;
  padding: 0;
  font-size: 13px;
}

.markdown-body :deep(strong) { color: var(--accent-light); }

.markdown-body :deep(blockquote) {
  border-left: 3px solid var(--accent);
  padding-left: 12px;
  color: var(--text-secondary);
  margin: 8px 0;
}

.markdown-body :deep(hr) {
  border: none;
  border-top: 1px solid var(--border);
  margin: 12px 0;
}

/* 表格 */
.markdown-body :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 10px 0;
  font-size: 13px;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid var(--border);
  padding: 6px 10px;
  text-align: left;
}

.markdown-body :deep(th) {
  background: var(--bg-hover);
  color: var(--accent-light);
}

/* ── 打字光标 ─────────────────────────────────────────── */
.typing-cursor {
  display: inline-block;
  width: 2px;
  height: 1em;
  background: var(--accent); /* 橙色闪烁光标 */
  margin-left: 2px;
  vertical-align: text-bottom; /* 与文字基线对齐 */
  animation: blink 0.8s infinite;
}

@keyframes blink {
  0%, 100% { opacity: 1; }  /* 亮 */
  50%       { opacity: 0; }  /* 灭，形成闪烁效果 */
}
</style>
