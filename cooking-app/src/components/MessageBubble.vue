<template>
  <div class="message" :class="message.role">
    <div class="avatar" :class="`${message.role}-avatar`">
      {{ message.role === 'user' ? '👤' : '👨‍🍳' }}
    </div>

    <div class="bubble" :class="message.role">
      <template v-if="message.role === 'user'">
        <img v-if="message.image" :src="message.image" class="user-image" alt="用户上传图片" />
        <span v-if="message.content" class="user-text">{{ message.content }}</span>
      </template>
      <template v-else>
        <div class="markdown-body" v-html="renderedContent" />
        <span v-if="message.streaming" class="typing-cursor" />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import { marked } from 'marked'
import type { ChatMessage } from '@/types'

const props = defineProps<{ message: ChatMessage }>()

const renderedContent = ref<string>('')
let parseTimer: ReturnType<typeof setTimeout> | null = null
let lastParsedLength = 0

function parseMarkdown() {
  const text = props.message.content
  if (!text) {
    renderedContent.value = ''
    lastParsedLength = 0
    return
  }
  const len = text.length
  if (len !== lastParsedLength) {
    renderedContent.value = marked.parse(text) as string
    lastParsedLength = len
  }
}

parseMarkdown()

watch(
  () => props.message.content,
  () => {
    if (props.message.streaming) {
      if (!parseTimer) {
        parseTimer = setTimeout(() => {
          parseTimer = null
          parseMarkdown()
        }, 60)
      }
    } else {
      if (parseTimer) {
        clearTimeout(parseTimer)
        parseTimer = null
      }
      parseMarkdown()
    }
  },
)

onUnmounted(() => {
  if (parseTimer) clearTimeout(parseTimer)
})
</script>

<style scoped>
/* ══════════════════════════════════════════════════════════
   MessageBubble — 奢华气泡设计
   渐变光泽 · 多层阴影 · 弹性入场 · 精致排版
   ══════════════════════════════════════════════════════════ */

.message {
  display: flex;
  gap: clamp(10px, 2vw, 14px);
  animation: messageSlideIn var(--duration-slow) var(--ease-out-back) both;
  max-width: min(860px, 100%);
}

.message.user {
  flex-direction: row-reverse;
  margin-inline-start: auto;
}

@keyframes messageSlideIn {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.avatar {
  --avatar-size: clamp(32px, 5vw, 40px);
  width: var(--avatar-size);
  height: var(--avatar-size);
  border-radius: var(--radius-full);
  flex-shrink: 0;
  display: grid;
  place-items: center;
  font-size: clamp(16px, 2.5vw, 19px);
  align-self: flex-end;
  transition: transform var(--duration-fast) var(--ease-out-back);
}

.avatar:active { transform: scale(0.9); }

.user-avatar {
  background: var(--accent-gradient-soft);
  box-shadow: var(--shadow-sm);
}

.assistant-avatar {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-xs);
}

.bubble {
  max-width: calc(100% - var(--avatar-size) - clamp(10px, 2vw, 14px));
  padding: 12px 16px;
  border-radius: var(--radius-md);
  font-size: 14px;
  line-height: 1.7;
  overflow-wrap: break-word;
  word-break: break-word;
  transition: box-shadow var(--duration-fast) var(--ease-out-expo);
  position: relative;
}

.bubble.user {
  background: var(--accent-gradient-soft);
  color: #fff;
  border-end-end-radius: 5px;
  box-shadow: 0 2px 12px rgba(232,138,26,0.22);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.user-image {
  max-width: 240px;
  max-height: 240px;
  border-radius: var(--radius-xs);
  object-fit: cover;
}

.user-text {
  word-break: break-word;
}

.bubble.assistant {
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text-primary);
  border-end-start-radius: 5px;
  box-shadow: var(--shadow-xs);
}

.bubble.assistant:hover {
  border-color: var(--border-light);
}

:deep(.markdown-body) {
  font-size: inherit;
  line-height: inherit;
}

:deep(.markdown-body h1),
:deep(.markdown-body h2),
:deep(.markdown-body h3) {
  font-weight: 700;
  color: var(--text-primary);
  margin: 16px 0 8px;
  letter-spacing: -0.01em;
}

:deep(.markdown-body h1) { font-size: 1.4em; }
:deep(.markdown-body h2) {
  font-size: 1.2em;
  border-bottom: 1px solid var(--border);
  padding-bottom: 6px;
}
:deep(.markdown-body h3) { font-size: 1.05em; }

:deep(.markdown-body code) {
  background: var(--bg-elevated);
  color: var(--accent-light);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 0.9em;
}

:deep(.markdown-body pre) {
  background: var(--bg-deep);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 14px 16px;
  overflow-x: auto;
  margin: 10px 0;
}

:deep(.markdown-body pre code) {
  background: transparent;
  color: var(--text-secondary);
  padding: 0;
}

:deep(.markdown-body ul),
:deep(.markdown-body ol) {
  padding-inline-start: 20px;
  margin: 6px 0;
}

:deep(.markdown-body li) { margin: 3px 0; }

:deep(.markdown-body p) { margin: 6px 0; }

:deep(.markdown-body strong) {
  color: var(--accent-light);
  font-weight: 600;
}

:deep(.markdown-body blockquote) {
  border-left: 3px solid var(--accent);
  padding: 4px 14px;
  margin: 10px 0;
  color: var(--text-secondary);
  background: var(--accent-soft);
  border-radius: 0 var(--radius-xs) var(--radius-xs) 0;
}

:deep(.markdown-body table) {
  width: 100%;
  border-collapse: collapse;
  margin: 10px 0;
  font-size: 0.9em;
}

:deep(.markdown-body th),
:deep(.markdown-body td) {
  padding: 8px 12px;
  border: 1px solid var(--border);
  text-align: left;
}

:deep(.markdown-body th) {
  background: var(--bg-elevated);
  font-weight: 600;
}

:deep(.markdown-body tr:nth-child(even)) {
  background: rgba(0,0,0,0.015);
}

:deep(.markdown-body a) {
  color: var(--accent-light);
  text-decoration: none;
}

:deep(.markdown-body a:hover) {
  text-decoration: underline;
}

.typing-cursor {
  display: inline-block;
  width: 2px;
  height: 1.1em;
  background: var(--accent);
  margin-inline-start: 2px;
  vertical-align: text-bottom;
  border-radius: 1px;
  animation: blink 0.8s step-end infinite;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0; }
}
</style>