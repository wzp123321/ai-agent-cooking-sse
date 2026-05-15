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
      厨神小助可能会犯错，重要食品安全问题请以权威资料为准
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
import { useChatStore } from "@/stores/chat";

const chatStore = useChatStore();

/** 输入框绑定的文本（双向绑定） */
const inputText = ref("");

/** el-input 的组件引用（用于 focus 等操作） */
const inputRef = ref();

/**
 * 占位符文本（Agent 离线时提示用户）
 * 使用 computed 确保 agentOnline 变化时自动更新
 */
const placeholder = computed(() =>
  chatStore.agentOnline
    ? "问我任何做菜相关的问题... (Enter 发送，Shift+Enter 换行)"
    : "⚠️ Agent 未连接，请先启动后端服务",
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

  await chatStore.sendMessage(text);
}
</script>

<style scoped>
/* ── 容器 ─────────────────────────────────────────────── */
.input-area {
  padding: 14px 20px 18px;
  border-top: 1px solid var(--border);
  background: var(--bg-secondary);
  flex-shrink: 0; /* 不参与垂直压缩，保持在底部 */
}

/* ── 输入区 ───────────────────────────────────────────── */
.input-wrapper {
  display: flex;
  gap: 10px;
  align-items: flex-end; /* 输入框和按钮底部对齐 */
}

.message-input {
  flex: 1; /* 占据所有剩余空间 */
}

/* 输入框内部 textarea 样式 */
::deep(.message-input .el-textarea__inner) {
  background: var(--bg-card);
  border-color: var(--border);
  color: var(--text-primary);
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 14px;
  font-family: inherit; /* 继承页面字体 */
  line-height: 1.6;
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
  resize: none; /* 禁用手动拖拽调整大小 */
}

/* 输入框 focus 状态 */
::deep(.message-input .el-textarea__inner:focus) {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgba(255, 107, 53, 0.15); /* 橙色外发光 */
}

/* ── 发送按钮 ─────────────────────────────────────────── */
.send-btn {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  flex-shrink: 0; /* 不参与 flex 压缩 */
  padding: 0; /* 去除默认 padding，仅显示图标 */
  font-size: 18px;
}

/* ── 底部提示 ─────────────────────────────────────────── */
.input-hint {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 8px;
  text-align: center;
}

/* ── 移动端适配 ──────────────────────────────────────── */
@media (max-width: 768px) {
  .input-area {
    padding: 10px 14px 14px;
  }
}
</style>
