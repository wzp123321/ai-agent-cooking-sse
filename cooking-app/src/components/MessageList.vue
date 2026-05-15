<template>
  <!--
    ═══════════════════════════════════════════════════════
    MessageList — 消息列表容器组件
    ═══════════════════════════════════════════════════════
    功能：
      ① 欢迎屏（无消息时显示，引导用户开始对话）
      ② 消息列表（遍历 chatStore.messages）
      ③ Typing 动画（AI 回复前的三个跳动的点）

    滚动策略：
      - 使用 flexbox 纵向布局
      - 新消息追加后，通过 watch + nextTick 自动滚到底部
      - scroll-behavior: smooth 提升滚动体验
  -->
  <div class="messages-container" ref="containerRef">

    <!-- ══ ① 欢迎屏（无消息时显示） ══ -->
    <Transition name="fade">
      <div v-if="chatStore.messages.length === 0" class="welcome-screen">
        <div class="welcome-emoji">👨‍🍳</div>
        <h2 class="welcome-title">你好！我是厨神小助</h2>
        <p class="welcome-desc">
          我可以帮你解答各种烹饪问题，从家常小炒到复杂大菜，<br />
          从食材选购到烹饪技法，都难不倒我！
        </p>
        <!-- 功能标签组 -->
        <div class="welcome-tags">
          <el-tag type="warning" effect="plain" round>🍜 菜谱推荐</el-tag>
          <el-tag type="warning" effect="plain" round>🔪 烹饪技法</el-tag>
          <el-tag type="warning" effect="plain" round>🥗 营养搭配</el-tag>
          <el-tag type="warning" effect="plain" round>🛒 食材选购</el-tag>
        </div>
      </div>
    </Transition>

    <!-- ══ ② 消息列表 ══ -->
    <div class="messages-list">
      <MessageBubble
        v-for="msg in chatStore.messages"
        :key="msg.id"
        :message="msg"
      />
    </div>

    <!-- ══ ③ Typing 动画（AI 回复中但尚未收到任何内容时显示） ══ -->
    <div v-if="chatStore.loading && lastMsgIsEmpty" class="typing-row">
      <div class="avatar ai-avatar">👨‍🍳</div>
      <div class="typing-dots">
        <span /><span /><span />
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
/**
 * MessageList — 消息列表组件
 *
 * 核心逻辑：
 *   - 响应式监听 chatStore.messages 变化
 *   - 每当消息内容变化时，执行 nextTick + scroll 到最底部
 *   - lastMsgIsEmpty 计算属性：判断是否需要显示 typing 动画
 *
 * nextTick 说明：
 *   因为 Vue 的 DOM 更新是异步的，直接在数据变化后立即读取 scrollHeight
 *   可能拿到的是更新前的值，所以需要等 nextTick 确保 DOM 已更新。
 */
import { ref, computed, watch, nextTick } from 'vue'
import { useChatStore } from '@/stores/chat'
import MessageBubble from '@/components/MessageBubble.vue'

const chatStore = useChatStore()
const containerRef = ref<HTMLElement | null>(null)

/**
 * 判断是否显示 typing 动画
 *
 * 条件：loading = true 且最后一条消息是 AI 发的但内容为空
 * 原因：
 *   - AI 消息先被 push 进去（content=''），loading 变为 true
 *   - 收到第一个 chunk 后，content 就不为空了，不再需要 typing 动画
 *   - 所以 typing 动画仅在"刚开始等待但还没收到任何内容"时短暂显示
 */
const lastMsgIsEmpty = computed(() => {
  const msgs = chatStore.messages
  const last = msgs[msgs.length - 1]
  return last?.role === 'assistant' && last.content === '' && last.streaming
})

/**
 * 消息变化时自动滚到底部
 *
 * 监听策略：监听所有消息 content 拼接后的字符串（避免直接监听对象导致深度开销）
 * 触发时机：任意消息 content 变化（用户消息追加 / AI 流式拼写）
 */
watch(
  // 拼接所有消息 content 作为依赖（content 变化时触发回调）
  () => chatStore.messages.map((m) => m.content).join(''),
  async () => {
    await nextTick() // 等待 Vue DOM 更新完成
    if (containerRef.value) {
      // scrollTop = scrollHeight：滚动到最底部
      containerRef.value.scrollTop = containerRef.value.scrollHeight
    }
  },
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

/* ── 欢迎屏 ───────────────────────────────────────────── */
.welcome-screen {
  text-align: center;
  padding: 60px 20px;
  max-width: 480px;
  margin: auto; /* 垂直居中 */
}

.welcome-emoji { font-size: 72px; margin-bottom: 16px; }

.welcome-title {
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 12px;
  color: var(--text-primary);
}

.welcome-desc {
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.8;
  margin-bottom: 24px;
}

.welcome-tags {
  display: flex;
  flex-wrap: wrap;   /* 允许换行 */
  gap: 10px;
  justify-content: center;
}

/* ── 消息列表 ─────────────────────────────────────────── */
.messages-list {
  display: flex;
  flex-direction: column;
  gap: 20px;         /* 每条消息之间的间距 */
}

/* ── Typing 动画 ─────────────────────────────────────── */
.typing-row {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  margin-top: 20px;
}

.avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
}

.ai-avatar {
  background: var(--bg-card);
  border: 1px solid var(--border);
}

.typing-dots {
  display: flex;
  gap: 4px;
  align-items: center;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 12px 18px;
}

/* 三个点的打字动画 */
.typing-dots span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-muted);
  animation: dotBounce 1.2s infinite;
}

.typing-dots span:nth-child(2) { animation-delay: 0.2s; }
.typing-dots span:nth-child(3) { animation-delay: 0.4s; }

@keyframes dotBounce {
  0%, 60%, 100% { transform: translateY(0); background: var(--text-muted); }
  30%            { transform: translateY(-6px); background: var(--accent); } /* 弹跳 + 变橙色 */
}

/* ── 过渡动画 ─────────────────────────────────────────── */
/* fade 过渡：欢迎屏显示/隐藏时淡入淡出 */
.fade-enter-active,
.fade-leave-active { transition: opacity 0.3s; }
.fade-enter-from,
.fade-leave-to { opacity: 0; }

/* ── 移动端适配 ──────────────────────────────────────── */
@media (max-width: 768px) {
  .messages-container { padding: 16px; }
}
</style>
