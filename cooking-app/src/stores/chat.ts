/**
 * ============================================================
 * Pinia Chat Store — 全局对话状态管理
 * ============================================================
 *
 * 功能概述：
 *   管理前端所有与对话相关的状态，包括：
 *   - 会话列表（多会话支持）
 *   - 当前激活的会话
 *   - 消息列表（响应式，自动触发视图更新）
 *   - Agent 在线状态
 *   - 加载状态（控制输入框和发送按钮的可用性）
 *
 * 技术细节：
 *   - 使用 Pinia 的 Composition API 风格（defineStore + 函数式 setup）
 *   - 流式消息通过响应式 ref 实时推送，UI 自动更新
 *   - 会话存储在内存中，页面刷新后丢失（生产建议加 localStorage 持久化）
 *
 * 命名规范：
 *   - state 变量：xxx.value（ref）或直接.xxx（reactive）
 *   - action 函数：camelCase，动词前缀（get/fetch/send/clear/delete）
 */

// ─── 模块引入 ──────────────────────────────────────────────
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { sendChatStream, clearSession, healthCheck } from '@/api/chat'
import type { ChatMessage, ChatSession } from '@/types'

// ─── 快捷问题常量 ──────────────────────────────────────────
//
// 预置在侧边栏的引导性问题，帮助用户快速开始探索 Agent 能力。
// 用户点击后，会直接作为首条消息发送给 Agent。
//
// 注意：emoji 放在字符串开头，便于在列表中快速识别。
export const QUICK_QUESTIONS = [
  '🍖 红烧肉怎么做才能入口即化？',
  '🥬 如何炒出脆嫩的蔬菜？',
  '🍜 家常番茄鸡蛋汤的做法',
  '🔪 切洋葱不流泪有什么技巧？',
  '🌶 川菜为什么那么辣？',
  '🥘 用冰箱剩余食材能做什么菜？',
]

// ─── 工具函数 ──────────────────────────────────────────────

/**
 * 生成唯一 ID
 *
 * 算法：Date.now()（毫秒级时间戳）+ 36 进制随机字符串
 * 用途：为每条消息和每个会话生成唯一标识符
 *
 * 示例输出：1747279123456_abc123
 */
function genId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 创建一个新的空白会话对象
 *
 * 用途：
 *   - 初始化时创建默认会话
 *   - 用户点击"新对话"时创建新会话
 */
function createSession(): ChatSession {
  const id = genId()
  return {
    id,
    title: '新对话',       // 标题在收到首条消息后更新
    messages: [],          // 初始为空数组
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

// ─── Store 定义 ────────────────────────────────────────────

export const useChatStore = defineStore('chat', () => {
  // ══════════════════════════════════════════════════════════
  // State（状态）
  // ══════════════════════════════════════════════════════════

  /**
   * 所有会话列表
   * 数组顺序：最新创建的会话在前面（unshift 策略）
   */
  const sessions = ref<ChatSession[]>([createSession()])

  /** 当前激活的会话 ID */
  const currentSessionId = ref<string>(sessions.value[0].id)

  /**
   * Agent 在线状态
   * 来源：healthCheck() 每 30 秒轮询一次 /health 接口
   * 用途：
   *   - 控制输入框 placeholder 提示
   *   - 侧边栏底部状态指示灯颜色
   */
  const agentOnline = ref<boolean>(false)

  /**
   * 发送中状态
   * 用途：
   *   - 禁用输入框（防止重复发送）
   *   - 控制发送按钮 loading 图标
   *   - MessageList 中决定是否显示 typing dots
   */
  const loading = ref<boolean>(false)

  // ══════════════════════════════════════════════════════════
  // Getters（计算属性）
  // ══════════════════════════════════════════════════════════

  /**
   * 当前激活的会话对象（响应式）
   * 若 sessionId 对应的会话不存在，降级返回第一个会话
   */
  const currentSession = computed<ChatSession>(
    () => sessions.value.find((s) => s.id === currentSessionId.value) ?? sessions.value[0],
  )

  /**
   * 当前会话的消息列表（响应式）
   * 每次 push 新消息时，引用 currentSession.messages，视图自动更新
   */
  const messages = computed<ChatMessage[]>(() => currentSession.value.messages)

  // ══════════════════════════════════════════════════════════
  // Actions（操作方法）
  // ══════════════════════════════════════════════════════════

  /**
   * 新建对话
   *
   * 流程：
   *   1. 创建空白会话对象
   *   2. 添加到 sessions 数组头部（最新对话在最前）
   *   3. 将 currentSessionId 切换到新会话
   *
   * 调用时机：用户点击侧边栏"新建对话"按钮
   */
  function newSession(): void {
    const s = createSession()
    sessions.value.unshift(s)        // 头部插入
    currentSessionId.value = s.id    // 自动切换到新会话
    console.info(`[Store] 🆕 新建会话：${s.id}`)
  }

  /**
   * 切换会话
   *
   * 流程：
   *   - 直接更新 currentSessionId（响应式自动切换 messages computed）
   *
   * 调用时机：用户点击侧边栏历史会话列表中的某一项目
   */
  function switchSession(id: string): void {
    if (id === currentSessionId.value) return // 已经是当前会话，无需切换
    console.info(`[Store] 🔄 切换会话：${currentSessionId.value} → ${id}`)
    currentSessionId.value = id
  }

  /**
   * 删除指定会话
   *
   * 流程：
   *   1. 调用 API 清除服务端记录（失败不阻断）
   *   2. 从 sessions 数组中移除（splice）
   *   3. 若删的是当前会话，自动切换到第一个会话
   *   4. 兜底：若 sessions 被删空了，自动创建新会话
   *
   * 调用时机：用户点击会话项右侧的 × 按钮
   */
  async function deleteSession(id: string): Promise<void> {
    console.info(`[Store] 🗑️ 删除会话：${id}`)

    await clearSession(id).catch(() => {}) // 服务端删除（可选，失败不阻断）

    const idx = sessions.value.findIndex((s) => s.id === id)
    if (idx !== -1) sessions.value.splice(idx, 1)

    // 若删掉的是当前会话，切换到第一个
    if (currentSessionId.value === id) {
      currentSessionId.value = sessions.value[0]?.id ?? ''
    }

    // 兜底：没有任何会话时自动创建
    if (sessions.value.length === 0) newSession()
  }

  /**
   * 清空当前会话消息
   *
   * 与 deleteSession 的区别：
   *   - deleteSession：整个会话删除
   *   - clearCurrentSession：保留会话，仅清空消息列表
   *
   * 调用时机：用户点击顶部"清空对话"按钮
   */
  async function clearCurrentSession(): Promise<void> {
    const session = currentSession.value
    console.info(`[Store] 🧹 清空会话消息：${session.id}`)

    await clearSession(session.id).catch(() => {})
    session.messages = []          // 清空消息数组（响应式，视图自动更新）
    session.title = '新对话'      // 恢复默认标题
    session.updatedAt = Date.now()
  }

  /**
   * 发送消息（核心方法）
   *
   * 完整流程：
   *   1. 参数校验（loading 中或空消息直接返回）
   *   2. 追加用户消息到 messages（响应式，UI 立即显示）
   *   3. 追加 AI 占位消息（content='', streaming=true）
   *   4. 调用 sendChatStream（底层 SSE 请求）
   *   5. onChunk：实时拼接 AI 回复（响应式，UI 逐字更新）
   *   6. onDone：关闭 streaming 状态（typing 消失）
   *   7. onError：显示错误消息到气泡中
   *
   * @param content - 用户输入的文本（已去除首尾空白）
   */
  async function sendMessage(content: string): Promise<void> {
    // ── 防御性校验 ──
    if (loading.value) {
      console.warn('[Store] ⚠️ 正在发送中，忽略重复请求')
      return
    }
    if (!content.trim()) {
      console.warn('[Store] ⚠️ 收到空消息，忽略')
      return
    }

    loading.value = true
    const session = currentSession.value

    console.info(`[Store] 📤 发送消息 [${session.id}]：${content.slice(0, 50)}…`)

    // ── 更新会话标题 ──
    // 若这是当前会话的第一条消息，用用户输入的前 20 字作为标题
    if (session.messages.length === 0) {
      session.title = content.slice(0, 20) + (content.length > 20 ? '…' : '')
      console.info(`[Store] 📝 会话标题更新为：${session.title}`)
    }

    // ── 追加用户消息（立即显示） ──
    const userMsg: ChatMessage = {
      id: genId(),
      role: 'user',
      content,
      timestamp: Date.now(),
    }
    session.messages.push(userMsg)
    session.updatedAt = Date.now()

    // ── 追加 AI 占位消息 ──
    // streaming: true 表示"正在生成中"，MessageBubble 会显示光标动画
    const aiMsg: ChatMessage = {
      id: genId(),
      role: 'assistant',
      content: '',          // 流结束前为空
      timestamp: Date.now(),
      streaming: true,
    }
    session.messages.push(aiMsg)
    console.info('[Store] ⏳ AI 消息已追加，等待流式响应…')

    // ── 发起 SSE 流式请求 ──
    try {
      await sendChatStream(
        content,
        session.id,
        // ── onChunk：每次收到 token 片段时触发 ──
        // 直接拼接到 aiMsg.content，Vue 响应式自动更新 DOM
        (chunk) => {
          aiMsg.content += chunk
        },
        // ── onDone：流结束时触发 ──
        () => {
          aiMsg.streaming = false          // 关闭光标动画
          session.updatedAt = Date.now()
          loading.value = false
          console.info(`[Store] ✅ AI 回复完成，共 ${aiMsg.content.length} 字符`)
        },
        // ── onError：SSE 出错时触发 ──
        (err) => {
          aiMsg.content = `❌ 请求失败：${err.message}\n\n请检查 Agent 服务是否已启动（cd cooking-agent && npm run dev）。`
          aiMsg.streaming = false
          loading.value = false

          ElMessage.error('Agent 服务请求失败，请检查后端是否已启动')
          console.error('[Store] ❌ 流式请求失败：', err)
        },
      )
    } catch (err) {
      // 理论上不会走到这里（sendChatStream 内部已处理了所有错误）
      // 此 catch 作为最后防线
      aiMsg.content = `❌ 未知错误：${(err as Error).message}`
      aiMsg.streaming = false
      loading.value = false
      console.error('[Store] ❌ sendMessage 未捕获的错误：', err)
    }
  }

  /**
   * 健康检查
   *
   * 调用时机：
   *   - SidebarPanel onMounted 时立即执行一次
   *   - SidebarPanel 每 30 秒轮询一次
   *
   * 效果：
   *   - 更新 agentOnline.value → 侧边栏状态灯变色 + 输入框提示语变化
   */
  async function checkHealth(): Promise<void> {
    agentOnline.value = await healthCheck()
  }

  // ══════════════════════════════════════════════════════════
  // 返回值（导出给组件使用）
  // ══════════════════════════════════════════════════════════
  return {
    // State
    sessions,
    currentSessionId,
    agentOnline,
    loading,
    // Getters
    currentSession,
    messages,
    // Actions
    newSession,
    switchSession,
    deleteSession,
    clearCurrentSession,
    sendMessage,
    checkHealth,
  }
})
