<template>
  <!--
    ═══════════════════════════════════════════════════════
    InputBar — 消息输入框组件
    ═══════════════════════════════════════════════════════
    功能：
      ① 多行文本输入（el-input textarea）
      ② 发送按钮（loading 状态、禁用状态联动）
      ③ 键盘快捷键支持
      ④ Agent 离线警告提示

    快捷键：
      - Enter       → 发送消息
      - Shift + Enter → 换行（不发送）
  -->
  <div class="input-area">
    <!-- 输入区域容器 -->
    <div class="input-wrapper">
      <!-- 多行文本输入框 -->
      <el-input
        ref="inputRef"
        v-model="inputText"
        type="textarea"
        :autosize="{ minRows: 1, maxRows: 5 }"
        :placeholder="placeholder"
        resize="none"
        class="message-input"
        @keydown="handleKeydown"
      />

      <!-- 发送按钮 -->
      <el-button
        type="primary"
        :icon="Promotion"
        :disabled="!canSend"
        :loading="chatStore.loading"
        class="send-btn"
        @click="handleSend"
      />
    </div>

    <!-- 免责声明提示 -->
    <p class="input-hint">
      {{ DISCLAIMER }}
    </p>
  </div>
</template>

<script setup lang="ts">
/**
 * InputBar — 消息输入组件
 *
 * 职责：
 *   - 收集用户输入
 *   - 发送消息（调用 Store action）
 *   - 管理键盘快捷键
 *
 * canSend 计算逻辑（四个条件全部满足才可发送）：
 *   1. inputText.trim().length > 0   → 输入框有内容
 *   2. !chatStore.loading             → 没有正在进行的请求
 *   3. chatStore.agentOnline          → Agent 在线
 */
import { ref, computed } from "vue";
import { Promotion } from "@element-plus/icons-vue";
import { useChatStore } from "@/stores/chat"
import { useConversation } from "@/hooks"
import { AGENT_OFFLINE_TIP, AGENT_ONLINE_PLACEHOLDER, DISCLAIMER } from "@/constants"

const chatStore = useChatStore()
const { sendMessage } = useConversation()

/** 输入框绑定的文本（双向绑定） */
const inputText = ref("");

/** el-input 的组件引用（用于 focus 等操作） */
const inputRef = ref();

/**
 * 占位符文本（Agent 离线时提示用户）
 * 使用 computed 确保 agentOnline 变化时自动更新
 */
const placeholder = computed(() =>
  chatStore.agentOnline ? AGENT_ONLINE_PLACEHOLDER : AGENT_OFFLINE_TIP,
);

/**
 * 发送按钮可用性
 *
 * 条件：非空 + 未加载 + Agent 在线
 * 用于 :disabled 属性，自动禁用按钮
 */
const canSend = computed(
  () =>
    inputText.value.trim().length > 0 &&
    !chatStore.loading &&
    chatStore.agentOnline,
);

/**
 * 键盘事件处理
 *
 * 规则：
 *   - Enter（无 Shift）→ 发送消息
 *   - Shift + Enter    → 插入换行（浏览器默认行为）
 *   - e.preventDefault()：阻止默认行为（避免 Enter 触发表单提交）
 */
function handleKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault(); // 阻止默认行为（避免换行或提交）
    handleSend();
  }
}

/**
 * 发送消息
 *
 * 流程：
 *   1. 防御性校验（canSend 已做初步检查，这里双重保险）
 *   2. 缓存输入内容并清空输入框（UX：发送后立即清空）
 *   3. 调用 Store action
 *   4. 发送失败时不回填（由 Store 处理错误展示）
 */
async function handleSend() {
  if (!canSend.value) return;

  const text = inputText.value.trim();
  inputText.value = ""; // 发送后清空输入框

  await sendMessage(text)
}
</script>

<style scoped>
/* ══════════════════════════════════════════════════════════
   InputBar — 高级输入区设计
   玻璃质感 · 渐变光效 · 弹性按钮 · 精致焦点态
   ══════════════════════════════════════════════════════════ */

.input-area {
  --input-padding: clamp(10px, 2vw, 16px) clamp(14px, 3vw, 24px);

  padding: var(--input-padding);
  padding-block-end: clamp(12px, 2.5vw, 20px);
  border-block-start: 1px solid var(--border);
  background: var(--bg-glass);
  backdrop-filter: blur(16px) saturate(120%);
  -webkit-backdrop-filter: blur(16px) saturate(120%);
  flex-shrink: 0;
  position: relative;
}

.input-area::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(255,255,255,0.02) 0%, transparent 100%);
  pointer-events: none;
}

.input-wrapper {
  display: flex;
  gap: clamp(8px, 1.5vw, 12px);
  align-items: flex-end;
  position: relative;
}

.message-input {
  flex: 1;
  min-width: 0;
}

::deep(.message-input .el-textarea) {
  width: 100%;
  display: block;
}

::deep(.message-input .el-textarea__inner) {
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text-primary);
  border-radius: clamp(10px, 1.8vw, 14px);
  padding: clamp(8px, 1.5vw, 12px) clamp(10px, 2vw, 16px);
  font-size: clamp(13px, 1.8vw, 15px);
  font-family: inherit;
  line-height: 1.6;
  transition:
    border-color var(--duration-normal) var(--ease-out),
    box-shadow var(--duration-normal) var(--ease-out),
    background var(--duration-normal) var(--ease-out);
  resize: none;
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.02);
}

::deep(.message-input .el-textarea__inner:hover) {
  border-color: var(--border-light);
  background: var(--bg-card-hover);
}

::deep(.message-input .el-textarea__inner:focus) {
  border-color: var(--accent);
  background: var(--bg-card);
  box-shadow:
    0 0 0 3px rgba(255, 107, 53, 0.1),
    0 0 20px rgba(255, 107, 53, 0.08),
    0 1px 3px rgba(0, 0, 0, 0.2);
}

::deep(.message-input .el-textarea__inner::placeholder) {
  color: var(--text-muted);
  opacity: 0.6;
  font-weight: 400;
}

.send-btn {
  --btn-size: clamp(40px, 7vw, 48px);

  width: var(--btn-size);
  height: var(--btn-size);
  border-radius: clamp(10px, 1.8vw, 14px);
  flex-shrink: 0;
  padding: 0;
  font-size: clamp(16px, 2.5vw, 20px);
  background: linear-gradient(135deg, #ff6b35, #e55a28) !important;
  border: none !important;
  box-shadow:
    0 2px 8px rgba(255, 107, 53, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.15);
  transition:
    transform var(--duration-fast) var(--ease-spring),
    box-shadow var(--duration-normal) var(--ease-out),
    opacity var(--duration-normal) var(--ease-out);
}

.send-btn:not(:disabled):hover {
  box-shadow:
    0 4px 20px rgba(255, 107, 53, 0.45),
    inset 0 1px 0 rgba(255, 255, 255, 0.2);
  transform: translateY(-1px);
}

.send-btn:not(:disabled):active {
  transform: scale(0.93) translateY(0);
  box-shadow:
    0 1px 4px rgba(255, 107, 53, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

.send-btn.is-disabled,
.send-btn:disabled {
  background: var(--bg-hover) !important;
  box-shadow: none !important;
  opacity: 0.4;
}

.input-hint {
  font-size: clamp(10px, 1.4vw, 12px);
  color: var(--text-muted);
  margin-block-start: clamp(6px, 1vw, 10px);
  text-align: center;
  opacity: 0.5;
  letter-spacing: 0.02em;
}

@media (width < 640px) {
  .input-area {
    --input-padding: 8px 12px;
    padding-block-end: 10px;
  }

  .send-btn {
    --btn-size: 38px;
  }
}
</style>
