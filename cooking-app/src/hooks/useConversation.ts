/**
 * ============================================================
 * useConversation — 对话内容发送 Hook
 * ============================================================
 *
 * 职责：
 *   封装消息发送的完整流程（用户消息 → SSE 流式请求 → AI 回复）
 *   操作 store 中的 sessions / messages / loading 状态
 *
 * 使用方式：
 *   const { sendMessage } = useConversation()
 *   await sendMessage('红烧肉怎么做')
 */

import { ElMessage } from 'element-plus'
import { useChatStore } from '@/stores/chat'
import { sendChatStream } from '@/api/chat'
import { MAX_SESSION_TITLE_LENGTH, ERROR_MSG_AGENT_OFFLINE } from '@/constants'
import type { ChatMessage } from '@/types'

function genId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function useConversation() {
  const store = useChatStore()
  let abortController: AbortController | null = null

  function abort(): void {
    if (abortController) {
      abortController.abort()
      abortController = null
    }
  }

  async function sendMessage(content: string): Promise<void> {
    if (store.loading) {
      console.warn('[Conversation] ⚠️ 正在发送中，忽略重复请求')
      return
    }
    if (!content.trim()) {
      console.warn('[Conversation] ⚠️ 收到空消息，忽略')
      return
    }

    abort()

    store.loading = true
    const session = store.currentSession

    console.info(`[Conversation] 📤 发送消息 [${session.id}]：${content.slice(0, 50)}…`)

    if (session.messages.length === 0) {
      session.title = content.slice(0, MAX_SESSION_TITLE_LENGTH) + (content.length > MAX_SESSION_TITLE_LENGTH ? '…' : '')
      console.info(`[Conversation] 📝 会话标题更新为：${session.title}`)
    }

    const userMsg: ChatMessage = {
      id: genId(),
      role: 'user',
      content,
      timestamp: Date.now(),
    }
    session.messages.push(userMsg)
    session.updatedAt = Date.now()

    session.messages.push({
      id: genId(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      streaming: true,
    })
    const aiMsg = session.messages[session.messages.length - 1]
    console.info('[Conversation] ⏳ AI 消息已追加，等待流式响应…')

    abortController = new AbortController()

    try {
      await sendChatStream(
        content,
        session.id,
        (chunk) => {
          aiMsg.content += chunk
        },
        () => {
          aiMsg.streaming = false
          session.updatedAt = Date.now()
          store.loading = false
          abortController = null
          console.info(`[Conversation] ✅ AI 回复完成，共 ${aiMsg.content.length} 字符`)
        },
        (err) => {
          if ((err as any)?.name === 'AbortError') {
            console.info('[Conversation] 🛑 请求已被取消')
            return
          }
          aiMsg.content = ERROR_MSG_AGENT_OFFLINE
          aiMsg.streaming = false
          store.loading = false
          abortController = null
          ElMessage.error('Agent 服务请求失败，请检查后端是否已启动')
          console.error('[Conversation] ❌ 流式请求失败：', err)
        },
        abortController.signal,
      )
    } catch (err) {
      if ((err as any)?.name === 'AbortError') {
        console.info('[Conversation] 🛑 请求已被取消')
        return
      }
      aiMsg.content = `❌ 未知错误：${(err as Error).message}`
      aiMsg.streaming = false
      store.loading = false
      abortController = null
      console.error('[Conversation] ❌ sendMessage 未捕获的错误：', err)
    }
  }

  return { sendMessage, abort }
}