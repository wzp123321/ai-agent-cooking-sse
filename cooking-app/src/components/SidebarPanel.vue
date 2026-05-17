<template>
  <!--
    ═══════════════════════════════════════════════════════
    SidebarPanel — 侧边栏组件
    ═══════════════════════════════════════════════════════
    组成模块：
      ① Logo 区域（品牌展示）
      ② 新建对话按钮
      ③ 历史会话列表（滚动）
      ④ 快捷提问按钮（引导用户快速开始）
      ⑤ 底部 Agent 在线状态指示灯

    响应式：
      - 桌面端：直接嵌入 ChatView 左侧（display: flex column）
      - 移动端：作为 el-drawer 的 body 内容使用
  -->
  <div class="sidebar">

    <!-- ══ ① Logo 区域 ══ -->
    <div class="sidebar-header">
      <div class="logo">
        <!-- 品牌图标 + 名称 -->
        <span class="logo-icon">🍳</span>
        <span class="logo-text">{{ APP_NAME }}</span>
      </div>
      <p class="logo-sub">{{ APP_SUBTITLE }}</p>
    </div>

    <!-- ══ ② 新建对话按钮 ══ -->
    <el-button
      type="primary"
      class="new-chat-btn"
      :icon="Plus"
      @click="handleNewChat"
    >
      新建对话
    </el-button>

    <!-- ══ ③ 历史会话列表 ══ -->
    <div class="session-section">
      <p class="section-title">历史对话</p>

      <div class="session-list">
        <!-- 遍历当前所有会话，active 状态高亮当前会话 -->
        <div
          v-for="session in chatStore.sessions"
          :key="session.id"
          class="session-item"
          :class="{ active: session.id === chatStore.currentSessionId }"
          @click="handleSwitchSession(session.id)"
        >
          <!-- 会话图标 -->
          <el-icon class="session-icon"><ChatLineRound /></el-icon>
          <!-- 会话标题（最多 20 字，超出省略） -->
          <span class="session-title">{{ session.title }}</span>
          <!-- 删除按钮（hover 时显示，阻止冒泡避免误触发切换） -->
          <el-button
            class="session-del"
            :icon="Close"
            text
            size="small"
            @click.stop="handleDeleteSession(session.id)"
          />
        </div>
      </div>
    </div>

    <!-- ══ ④ 快捷提问 ══ -->
    <div class="quick-section">
      <p class="section-title">🌟 快捷提问</p>
      <div class="quick-list">
        <!-- 点击后直接发送对应问题 -->
        <div
          v-for="q in QUICK_QUESTIONS"
          :key="q"
          class="quick-btn"
          @click="handleQuickQuestion(q)"
        >
          {{ q }}
        </div>
      </div>
    </div>

    <!-- ══ ⑤ 底部状态指示器 ══ -->
    <div class="sidebar-footer">
      <!-- 状态指示灯（绿=在线，红=离线） -->
      <span
        class="status-dot"
        :class="chatStore.agentOnline ? 'online' : 'offline'"
      />
      <span class="status-text">
        {{ chatStore.agentOnline ? 'Agent 已连接' : 'Agent 未连接' }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * SidebarPanel
 *
 * 职责：
 *   - 展示会话列表（支持切换/删除）
 *   - 提供新建对话入口
 *   - 内置快捷问题引导
 *   - 实时显示 Agent 在线状态
 *
 * 生命周期：
 *   - onMounted：立即执行健康检查 + 启动定时轮询
 *   - onUnmounted：组件销毁时清理定时器（防止内存泄漏）
 */
import { Plus, Close, ChatLineRound } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import { useChatStore } from '@/stores/chat'
import { QUICK_QUESTIONS, APP_NAME, APP_SUBTITLE } from '@/constants'
import { useHealthCheck, useConversation } from '@/hooks'

/**
 * emit 定义
 * close：关闭抽屉（移动端点击会话后触发）
 */
const emit = defineEmits<{ close: [] }>()

const chatStore = useChatStore()
const { sendMessage } = useConversation()

useHealthCheck()

// ── 事件处理 ──────────────────────────────────────────────

/** 新建对话 */
function handleNewChat() {
  chatStore.newSession()
  emit('close')
}

/** 切换会话并加载历史 */
function handleSwitchSession(id: string) {
  chatStore.switchSession(id)
  chatStore.loadHistory(id)
  emit('close')
}

/** 删除指定会话 */
async function handleDeleteSession(id: string) {
  await ElMessageBox.confirm(
    '确定要删除这条对话吗？删除后无法恢复。',
    '提示',
    {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    },
  )
  await chatStore.deleteSession(id)
}

/** 点击快捷问题，直接作为首条消息发送 */
function handleQuickQuestion(q: string) {
  sendMessage(q)
  emit('close')
}
</script>

<style scoped>
/* ══════════════════════════════════════════════════════════
   SidebarPanel — 现代响应式样式
   策略：clamp() 流体间距 + 逻辑属性 + 滚动优化
   ══════════════════════════════════════════════════════════ */

.sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: clamp(14px, 2.5vw, 22px) clamp(12px, 2vw, 18px);
  gap: clamp(12px, 2vw, 18px);
  overflow: hidden;
}

/* ── Logo ──────────────────────────────────────────────── */
.sidebar-header { text-align: center; }

.logo {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: clamp(6px, 1.2vw, 12px);
}

.logo-icon {
  font-size: clamp(24px, 4vw, 34px);
  filter: drop-shadow(0 2px 4px rgba(255, 107, 53, 0.3));
}

.logo-text {
  font-size: clamp(17px, 2.5vw, 22px);
  font-weight: 700;
  background: linear-gradient(135deg, var(--accent), var(--accent-light));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.logo-sub {
  color: var(--text-secondary);
  font-size: clamp(11px, 1.4vw, 13px);
  margin-block-start: clamp(2px, 0.5vw, 6px);
}

/* ── 新建按钮 ─────────────────────────────────────────── */
.new-chat-btn {
  width: 100%;
  border-radius: clamp(8px, 1.5vw, 12px);
  font-weight: 500;
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease;
}

.new-chat-btn:active {
  transform: scale(0.97);
}

/* ── 区块标题 ─────────────────────────────────────────── */
.section-title {
  font-size: clamp(10px, 1.3vw, 12px);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-block-end: clamp(6px, 1vw, 10px);
  font-weight: 500;
}

/* ── 会话列表 ─────────────────────────────────────────── */
.session-section {
  flex-shrink: 0;
}

.session-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: clamp(120px, 20vh, 180px);
  overflow-y: auto;
  scrollbar-width: thin;
}

.session-item {
  display: flex;
  align-items: center;
  gap: clamp(6px, 1vw, 10px);
  padding: clamp(6px, 1vw, 10px) clamp(8px, 1.5vw, 12px);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease,
    transform 0.15s ease;
  font-size: clamp(12px, 1.5vw, 14px);
  color: var(--text-secondary);
}

.session-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.session-item:active {
  transform: scale(0.98);
}

.session-item.active {
  background: var(--bg-hover);
  color: var(--accent);
  font-weight: 500;
}

.session-icon { flex-shrink: 0; }

.session-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-del {
  opacity: 0;
  flex-shrink: 0;
  transition: opacity 0.15s ease;
}

.session-item:hover .session-del { opacity: 1; }

/* ── 快捷问题 ─────────────────────────────────────────── */
.quick-section {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.quick-list {
  display: flex;
  flex-direction: column;
  gap: clamp(4px, 0.8vw, 8px);
  overflow-y: auto;
  scrollbar-width: thin;
}

.quick-btn {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: clamp(6px, 1vw, 10px) clamp(8px, 1.5vw, 12px);
  font-size: clamp(11px, 1.4vw, 13px);
  color: var(--text-secondary);
  cursor: pointer;
  text-align: start;
  transition:
    background 0.15s ease,
    color 0.15s ease,
    border-color 0.15s ease,
    transform 0.15s ease;
  line-height: 1.45;
}

.quick-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
  border-color: var(--accent);
}

.quick-btn:active {
  transform: scale(0.98);
}

/* ── 底部状态 ─────────────────────────────────────────── */
.sidebar-footer {
  margin-block-start: auto;
  display: flex;
  align-items: center;
  gap: clamp(6px, 1vw, 10px);
  font-size: clamp(11px, 1.4vw, 13px);
  color: var(--text-secondary);
  flex-shrink: 0;
  padding-block-start: clamp(8px, 1.5vw, 12px);
  border-block-start: 1px solid var(--border);
}

.status-dot {
  width: clamp(7px, 1vw, 9px);
  height: clamp(7px, 1vw, 9px);
  border-radius: 50%;
  background: var(--text-muted);
  transition:
    background 0.3s ease,
    box-shadow 0.3s ease;
  flex-shrink: 0;
}

.status-dot.online {
  background: #4caf50;
  box-shadow: 0 0 8px rgba(76, 175, 80, 0.5);
}

.status-dot.offline {
  background: #f44336;
  box-shadow: 0 0 8px rgba(244, 67, 54, 0.3);
}
</style>
