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
/* ══════════════════════════════════════════════════════════
   MessageList — 高级消息列表
   渐变遮罩 · 平滑滚动 · 优雅间距
   ══════════════════════════════════════════════════════════ */

.messages-container {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: clamp(16px, 3vw, 32px);
  scroll-behavior: smooth;
  display: flex;
  flex-direction: column;
  overscroll-behavior: contain;
  position: relative;
}

.messages-list {
  display: flex;
  flex-direction: column;
  gap: clamp(16px, 3vw, 28px);
  margin-block-start: auto;
}

@media (width < 640px) {
  .messages-container {
    padding: 12px;
  }

  .messages-list {
    gap: 14px;
  }
}
</style>
