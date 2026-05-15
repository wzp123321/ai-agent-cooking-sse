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
        <span class="logo-text">厨神小助</span>
      </div>
      <p class="logo-sub">AI 烹饪智能体</p>
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
          @click="chatStore.switchSession(session.id); emit('close')"
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
import { onMounted, onUnmounted } from 'vue'
import { Plus, Close, ChatLineRound } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import { useChatStore, QUICK_QUESTIONS } from '@/stores/chat'

/**
 * emit 定义
 * close：关闭抽屉（移动端点击会话后触发）
 */
const emit = defineEmits<{ close: [] }>()

const chatStore = useChatStore()

/**
 * 定时器引用（用于组件销毁时清理）
 * setInterval 返回值是 number，用于 clearInterval
 */
let timer: ReturnType<typeof setInterval>

// ── 生命周期 ──────────────────────────────────────────────

onMounted(() => {
  // 组件挂载后立即检查一次 Agent 是否在线
  chatStore.checkHealth()

  // 每 30 秒轮询一次健康检查接口
  // 原因：Agent 服务重启后，前端状态不会自动更新，需要主动探测
  timer = setInterval(() => {
    chatStore.checkHealth()
  }, 30_000)
})

onUnmounted(() => {
  // 清理定时器，防止组件销毁后定时器继续执行（内存泄漏）
  clearInterval(timer)
})

// ── 事件处理 ──────────────────────────────────────────────

/** 新建对话 */
function handleNewChat() {
  chatStore.newSession()
  emit('close') // 移动端关闭抽屉
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
  chatStore.sendMessage(q)
  emit('close') // 移动端关闭抽屉
}
</script>

<style scoped>
/* ── 容器 ──────────────────────────────────────────────── */
.sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 20px 16px;
  gap: 16px;          /* 子元素之间的间距 */
  overflow: hidden;   /* 超出容器高度隐藏 */
}

/* ── Logo ──────────────────────────────────────────────── */
.sidebar-header { text-align: center; }

.logo {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.logo-icon { font-size: 30px; }

.logo-text {
  font-size: 20px;
  font-weight: 700;
  /* 渐变色文字效果 */
  background: linear-gradient(135deg, var(--accent), var(--accent-light));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.logo-sub {
  color: var(--text-secondary);
  font-size: 12px;
  margin-top: 4px;
}

/* ── 新建按钮 ─────────────────────────────────────────── */
.new-chat-btn {
  width: 100%;
}

/* ── 区块标题 ─────────────────────────────────────────── */
.section-title {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  margin-bottom: 8px;
}

/* ── 会话列表 ─────────────────────────────────────────── */
.session-section {
  flex-shrink: 0;      /* 不参与 flex 拉伸 */
}

.session-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 160px;   /* 限制高度，超出滚动 */
  overflow-y: auto;
}

.session-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
  font-size: 13px;
  color: var(--text-secondary);
}

.session-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.session-item.active {
  background: var(--bg-hover);
  color: var(--accent);
}

.session-icon { flex-shrink: 0; }

.session-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis; /* 标题过长时显示省略号 */
  white-space: nowrap;
}

.session-del {
  opacity: 0;          /* 默认隐藏 */
  flex-shrink: 0;
}
/* hover 时显示删除按钮 */
.session-item:hover .session-del { opacity: 1; }

/* ── 快捷问题 ─────────────────────────────────────────── */
.quick-section {
  flex: 1;             /* 占据剩余所有空间 */
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.quick-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;    /* 内容超出时滚动 */
}

.quick-btn {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  text-align: left;    /* 左对齐，便于阅读长文本 */
  transition: all 0.2s;
  line-height: 1.4;
}

.quick-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
  border-color: var(--accent);
}

/* ── 底部状态 ─────────────────────────────────────────── */
.sidebar-footer {
  margin-top: auto;   /* 始终贴底 */
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-muted);
  transition: background 0.3s;
  flex-shrink: 0;
}

.status-dot.online {
  background: #4caf50;
  box-shadow: 0 0 6px #4caf50; /* 发光效果 */
}

.status-dot.offline { background: #f44336; }
</style>
