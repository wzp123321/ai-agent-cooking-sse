<template>
  <div class="messages-container" ref="containerRef">

    <WelcomeScreen :visible="chatStore.messages.length === 0" />

    <div class="messages-list">
      <MessageBubble
        v-for="msg in chatStore.messages"
        :key="msg.id"
        :message="msg"
      />
    </div>

  </div>
</template>

<script setup lang="ts">
import { useChatStore } from '@/stores/chat'
import { useScrollToBottom } from '@/hooks/useScrollToBottom'
import MessageBubble from '@/components/MessageBubble.vue'
import WelcomeScreen from '@/components/WelcomeScreen.vue'

const chatStore = useChatStore()

const { containerRef } = useScrollToBottom(() =>
  chatStore.messages.map((m) => m.content).join(''),
)
</script>

<style scoped>
/* ── 容器 ─────────────────────────────────────────────── */
.messages-container {
  flex: 1;            /* 占据主区域剩余所有高度 */
  overflow-y: auto;   /* 内容超出时滚动 */
  padding: 24px;
  scroll-behavior: smooth; /* 平滑滚动效果 */
  display: flex;
  flex-direction: column;
  gap: 0;             /* 消息间距由组件自己控制 */
}

/* ── 消息列表 ─────────────────────────────────────────── */
.messages-list {
  display: flex;
  flex-direction: column;
  gap: 20px;         /* 每条消息之间的间距 */
}

/* ── 移动端适配 ──────────────────────────────────────── */
@media (max-width: 768px) {
  .messages-container { padding: 16px; }
}
</style>
