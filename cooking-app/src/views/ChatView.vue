<template>
  <!--
    ═══════════════════════════════════════════════════════
    ChatView — 主页面容器组件
    ═══════════════════════════════════════════════════════
    布局结构：
      ┌─────────────┬──────────────────────────────┐
      │             │          chat-header          │
      │  sidebar    ├──────────────────────────────┤
      │  (桌面端)   │                              │
      │             │          message-list        │
      │             │          (可滚动)             │
      │             │                              │
      │             ├──────────────────────────────┤
      │             │          input-bar            │
      └─────────────┴──────────────────────────────┘

    移动端响应式策略：
      - 侧边栏在 <768px 宽度下隐藏
      - 顶部菜单按钮触发 el-drawer 抽屉式侧边栏
  -->

  <!-- 侧边栏抽屉（移动端 <768px，el-drawer 从左侧滑入） -->
  <el-drawer
    v-model="drawerOpen"
    direction="ltr"
    :with-header="false"
    size="260px"
    class="sidebar-drawer"
  >
    <!-- 抽屉内容复用 SidebarPanel 组件，关闭时触发 emit -->
    <SidebarPanel @close="drawerOpen = false" />
  </el-drawer>

  <!-- 主布局容器 -->
  <div class="layout">

    <!-- ══ 桌面端侧边栏（>768px 时显示） ══ -->
    <aside class="sidebar-desktop">
      <!-- 全屏高度，内容由 SidebarPanel 内部 flex 布局撑满 -->
      <SidebarPanel />
    </aside>

    <!-- ══ 主聊天区域 ══ -->
    <main class="chat-main">

      <!-- 顶部栏：Logo + 标题 + 清空按钮 -->
      <header class="chat-header">
        <!-- 移动端菜单按钮（>768px 隐藏，由 CSS display:none 控制） -->
        <el-button
          class="menu-btn"
          :icon="Menu"
          text
          circle
          @click="drawerOpen = true"
        />

        <!-- 机器人名称和副标题 -->
        <div class="header-info">
          <span class="header-title">厨神小助</span>
          <span class="header-sub">专业烹饪 AI 顾问</span>
        </div>

        <!-- 清空当前对话按钮（hover 时显示 tooltip） -->
        <el-tooltip content="清空当前对话" placement="bottom">
          <el-button
            :icon="Delete"
            text
            circle
            @click="handleClear"
          />
        </el-tooltip>
      </header>

      <!-- 消息列表区域（自动填满剩余高度） -->
      <MessageList />

      <!-- 底部输入框区域 -->
      <InputBar />
    </main>
  </div>
</template>

<script setup lang="ts">
/**
 * ChatView — 主页面入口组件
 *
 * 职责：
 *   - 整体布局（侧边栏 + 主内容区）
 *   - 移动端响应式（侧边栏 drawer 切换）
 *   - 提供"清空对话"的事件处理
 */
import { ref } from 'vue'
import { Menu, Delete } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import SidebarPanel from '@/components/SidebarPanel.vue'
import MessageList from '@/components/MessageList.vue'
import InputBar from '@/components/InputBar.vue'
import { useChatStore } from '@/stores/chat'

const chatStore = useChatStore()

/** 移动端抽屉开关状态（桌面端不受影响） */
const drawerOpen = ref(false)

/**
 * 清空当前对话
 *
 * 流程：
 *   1. 若当前无消息，直接返回（避免无意义弹窗）
 *   2. 弹出 Element Plus 确认框
 *   3. 用户确认后，调用 Store 的 clearCurrentSession action
 */
async function handleClear() {
  if (chatStore.messages.length === 0) return

  await ElMessageBox.confirm(
    '确定要清空当前对话吗？此操作不可恢复。',
    '提示',
    {
      confirmButtonText: '清空',
      cancelButtonText: '取消',
      type: 'warning',
    },
  )

  await chatStore.clearCurrentSession()
}
</script>

<style scoped>
/* ── 布局 ──────────────────────────────────────────────── */
.layout {
  display: flex;
  width: 100%;
  height: 100vh;   /* 全屏高度，溢出隐藏 */
  overflow: hidden;
}

/* ── 桌面端侧边栏 ─────────────────────────────────────── */
.sidebar-desktop {
  width: 260px;
  flex-shrink: 0;       /* 不参与 flex 压缩，始终保持 260px */
  border-right: 1px solid var(--border);
  background: var(--bg-secondary);
  display: flex;
  flex-direction: column;
}

/* ── 主聊天区 ─────────────────────────────────────────── */
.chat-main {
  flex: 1;             /* 占据剩余全部宽度 */
  display: flex;
  flex-direction: column;
  min-width: 0;        /* 防止 flex 子项超出容器 */
  background: var(--bg-primary);
}

/* ── 顶部栏 ───────────────────────────────────────────── */
.chat-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-secondary);
  flex-shrink: 0;      /* 不参与垂直压缩 */
}

/* 移动端菜单按钮（默认隐藏） */
.menu-btn {
  display: none;
}

.header-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.header-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.header-sub {
  font-size: 12px;
  color: var(--text-secondary);
}

/* ── 移动端响应式（<768px） ──────────────────────────── */
@media (max-width: 768px) {
  .sidebar-desktop {
    display: none;      /* 隐藏桌面侧边栏 */
  }
  .menu-btn {
    display: flex;      /* 显示汉堡菜单按钮 */
  }
}

/* ── 抽屉样式覆盖 ─────────────────────────────────────── */
::deep(.sidebar-drawer .el-drawer__body) {
  padding: 0;
  background: var(--bg-secondary);
}
</style>
