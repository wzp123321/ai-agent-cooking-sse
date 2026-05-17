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
/* ══════════════════════════════════════════════════════════
   MessageBubble — 高级气泡设计
   玻璃质感 · 多层阴影 · 弹性动画 · 精致排版
   ══════════════════════════════════════════════════════════ */

.message {
  display: flex;
  gap: clamp(8px, 2vw, 12px);
  animation: messageIn var(--duration-slow) var(--ease-spring) both;
  max-width: min(860px, 100%);
}

.message.user {
  flex-direction: row-reverse;
  margin-inline-start: auto;
}

@keyframes messageIn {
  from {
    opacity: 0;
    transform: translateY(16px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* ── 头像 ─────────────────────────────────────────────── */
.avatar {
  --avatar-size: clamp(30px, 5vw, 38px);

  width: var(--avatar-size);
  height: var(--avatar-size);
  border-radius: 50%;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  font-size: clamp(15px, 2.5vw, 18px);
  align-self: flex-end;
  transition: transform var(--duration-fast) var(--ease-spring);
  position: relative;
}

.avatar::after {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: 50%;
  opacity: 0;
  transition: opacity var(--duration-normal);
}

.avatar:active { transform: scale(0.9); }

.user-avatar {
  background: linear-gradient(135deg, #ff6b35, #e55a28);
  box-shadow:
    0 2px 8px rgba(255, 107, 53, 0.35),
    inset 0 1px 0 rgba(255, 255, 255, 0.15);
}

.user-avatar::after {
  background: linear-gradient(135deg, rgba(255,107,53,0.4), transparent);
}

.assistant-avatar {
  background: linear-gradient(135deg, #1c1c22, #262630);
  border: 1px solid var(--border);
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.25),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

/* ── 气泡 ─────────────────────────────────────────────── */
.bubble {
  --bubble-padding: clamp(10px, 2vw, 14px) clamp(12px, 2.5vw, 18px);

  max-width: calc(100% - var(--avatar-size) - clamp(8px, 2vw, 12px));
  padding: var(--bubble-padding);
  border-radius: clamp(12px, 2.5vw, 18px);
  font-size: clamp(13px, 1.8vw, 15px);
  line-height: 1.68;
  overflow-wrap: break-word;
  word-break: break-word;
  transition:
    transform var(--duration-fast) var(--ease-out),
    box-shadow var(--duration-normal) var(--ease-out);
  position: relative;
}

.bubble.user {
  background: linear-gradient(135deg, #ff6b35 0%, #ff5722 50%, #e64a19 100%);
  color: #fff;
  border-end-end-radius: clamp(3px, 0.6vw, 5px);
  box-shadow:
    0 4px 16px rgba(255, 107, 53, 0.25),
    0 1px 3px rgba(0, 0, 0, 0.2);
}

.bubble.user::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(180deg, rgba(255,255,255,0.08) 0%, transparent 50%);
  pointer-events: none;
}

.bubble.assistant {
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text-primary);
  border-end-start-radius: clamp(3px, 0.6vw, 5px);
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.2),
    0 0 0 1px rgba(255, 255, 255, 0.02) inset;
}

.bubble.assistant:hover {
  border-color: var(--border-light);
  box-shadow:
    0 4px 20px rgba(0, 0, 0, 0.3),
    0 0 0 1px rgba(255, 255, 255, 0.03) inset;
}

/* ── Markdown 内容 ────────────────────────────────────── */
.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3) {
  color: var(--accent-light);
  margin-block: clamp(8px, 1.5vw, 14px) clamp(4px, 0.8vw, 8px);
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: -0.01em;
}

.markdown-body :deep(h1) { font-size: clamp(16px, 2.5vw, 20px); }
.markdown-body :deep(h2) { font-size: clamp(14px, 2.2vw, 17px); }
.markdown-body :deep(h3) { font-size: clamp(13px, 2vw, 15px); }

.markdown-body :deep(p) {
  margin-block: clamp(4px, 0.8vw, 8px);
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  padding-inline-start: clamp(16px, 3vw, 24px);
  margin-block: clamp(4px, 0.8vw, 8px);
}

.markdown-body :deep(li) { margin-block: 3px; }
.markdown-body :deep(li)::marker { color: var(--accent); }

.markdown-body :deep(code) {
  background: var(--accent-soft);
  color: var(--accent-light);
  padding: 0.15em 0.45em;
  border-radius: 4px;
  font-size: 0.88em;
  font-family: 'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Courier New', monospace;
  border: 1px solid rgba(255, 107, 53, 0.1);
}

.markdown-body :deep(pre) {
  background: #0a0a0e;
  border: 1px solid var(--border);
  border-radius: clamp(6px, 1.2vw, 10px);
  padding: clamp(10px, 2vw, 16px);
  overflow-x: auto;
  margin-block: clamp(8px, 1.5vw, 14px);
  box-shadow: inset 0 1px 4px rgba(0, 0, 0, 0.3);
  position: relative;
}

.markdown-body :deep(pre code) {
  background: none;
  border: none;
  color: #c8c8d4;
  padding: 0;
  font-size: clamp(12px, 1.6vw, 14px);
  line-height: 1.6;
}

.markdown-body :deep(strong) {
  color: var(--accent-light);
  font-weight: 600;
}

.markdown-body :deep(em) {
  color: var(--text-secondary);
}

.markdown-body :deep(blockquote) {
  border-inline-start: 3px solid var(--accent);
  padding-inline-start: clamp(10px, 2vw, 16px);
  color: var(--text-secondary);
  margin-block: clamp(6px, 1vw, 10px);
  background: var(--accent-soft);
  border-radius: 0 var(--radius-xs) var(--radius-xs) 0;
  padding-block: 4px;
}

.markdown-body :deep(hr) {
  border: none;
  border-block-start: 1px solid var(--border);
  margin-block: clamp(10px, 2vw, 16px);
}

.markdown-body :deep(a) {
  color: var(--accent-light);
  text-decoration: none;
  border-bottom: 1px solid rgba(255, 140, 90, 0.3);
  transition: border-color var(--duration-fast);
}

.markdown-body :deep(a:hover) {
  border-bottom-color: var(--accent-light);
}

.markdown-body :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin-block: clamp(8px, 1.5vw, 12px);
  font-size: clamp(12px, 1.6vw, 14px);
  border-radius: var(--radius-xs);
  overflow: hidden;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid var(--border);
  padding: clamp(4px, 1vw, 8px) clamp(6px, 1.5vw, 12px);
  text-align: start;
}

.markdown-body :deep(th) {
  background: var(--bg-hover);
  color: var(--accent-light);
  font-weight: 600;
}

.markdown-body :deep(tr:nth-child(even)) {
  background: rgba(255, 255, 255, 0.015);
}

/* ── 打字指示器（三点跳动） ──────────────────────────── */
.typing-cursor {
  display: inline-block;
  width: 6px;
  height: 6px;
  background: var(--accent);
  border-radius: 50%;
  margin-inline-start: 4px;
  vertical-align: middle;
  animation: dotPulse 1.2s ease-in-out infinite;
  box-shadow: 0 0 6px var(--accent-glow);
}

@keyframes dotPulse {
  0%, 60%, 100% {
    opacity: 0.3;
    transform: scale(0.8);
  }
  30% {
    opacity: 1;
    transform: scale(1.2);
  }
}

/* ── 响应式断点 ───────────────────────────────────────── */
@media (width < 640px) {
  .message { gap: 6px; }

  .bubble {
    --bubble-padding: 8px 12px;
    border-radius: 12px;
  }

  .bubble.user      { border-end-end-radius: 3px; }
  .bubble.assistant { border-end-start-radius: 3px; }
}

@media (width >= 1200px) {
  .message { max-width: 860px; }
  .bubble  { font-size: 15px; }
}
</style>
