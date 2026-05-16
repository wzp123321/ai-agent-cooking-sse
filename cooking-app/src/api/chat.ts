/**
 * ============================================================
 * cooking-app API 客户端
 * ============================================================
 *
 * 功能概述：
 *   封装与 cooking-agent 后端服务的 HTTP 通信，包括：
 *   - 普通对话（完整返回）
 *   - 流式对话（SSE，逐字接收）
 *   - 会话管理（清除历史）
 *   - 健康检查
 *
 * 技术细节：
 *   - 使用原生 fetch API（无额外依赖）
 *   - SSE 流式通过 ReadableStream + TextDecoder 实现
 *   - BASE_URL 由 Vite 代理到 http://localhost:3001（见 vite.config.js）
 *
 * 错误处理：
 *   - HTTP 状态码非 2xx 统一抛出 Error
 *   - SSE 解析失败行直接跳过，不中断后续处理
 */

// ─── 模块引入 ──────────────────────────────────────────────
import type { ChatResponse, SessionMeta, ChatMessage } from '@/types'
import { BASE_URL } from '@/constants'

// ─── 普通对话 ──────────────────────────────────────────────

/**
 * 发送普通对话请求（非流式）
 *
 * 使用场景：
 *   - 简单快速问答
 *   - 调试/测试接口
 *
 * @param message   - 用户输入的消息
 * @param sessionId - 会话 ID（默认 'default'）
 * @returns 包含 AI 回复的结构化对象
 * @throws Error 网络错误或 API 返回非 2xx 状态
 */
export async function sendChat(message: string, sessionId: string): Promise<ChatResponse> {
  console.info(`[API] POST /chat [${sessionId}]`)

  const res = await fetch(`${BASE_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sessionId }),
  })

  // 非 2xx 状态码统一处理
  if (!res.ok) {
    // 尝试从响应体中提取错误信息；JSON 解析失败时兜底返回 "请求失败"
    const err = await res.json().catch(() => ({ error: '请求失败' }))
    console.error(`[API] ❌ /chat 请求失败：HTTP ${res.status}`, err)
    throw new Error((err as { error: string }).error || `HTTP ${res.status}`)
  }

  const data = await res.json() as ChatResponse
  console.info(`[API] ✅ /chat [${sessionId}] 收到回复：${data.message.length} 字符`)
  return data
}

// ─── 流式对话 ──────────────────────────────────────────────

/**
 * 发送流式对话请求（SSE — Server-Sent Events）
 *
 * 原理：
 *   - 前端 fetch 连接到 /api/chat/stream
 *   - 后端以 text/event-stream 格式推送多个 SSE 事件
 *   - 每个事件包含一个增量 token，客户端实时拼接并渲染
 *
 * SSE 事件类型：
 *   - 'chunk'：每个 token 片段到达时触发 → 调用 onChunk
 *   - 'done' ：全部传输结束时触发 → 调用 onDone
 *   - 'error'：后端出错时触发 → 调用 onError
 *
 * @param message   - 用户输入
 * @param sessionId - 会话 ID
 * @param onChunk  - 每次收到 token 片段的回调（拼接后渲染）
 * @param onDone   - 流结束后回调（关闭 loading 状态）
 * @param onError  - 出错时的回调（显示错误提示）
 */
export async function sendChatStream(
  message: string,
  sessionId: string,
  onChunk: (chunk: string) => void,
  onDone: (full: string) => void,
  onError: (err: Error) => void,
): Promise<void> {
  console.info(`[API] POST /chat/stream [${sessionId}] 建立连接…`)

  let response: Response

  // ── 发起请求 ──
  try {
    response = await fetch(`${BASE_URL}/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, sessionId }),
    })
  } catch (err) {
    // 网络不可达、域名解析失败等底层错误会在这里触发
    console.error('[API] ❌ /chat/stream 网络请求失败：', err)
    onError(err as Error)
    return
  }

  // ── 状态码校验 ──
  if (!response.ok) {
    console.error(`[API] ❌ /chat/stream HTTP ${response.status}`)
    onError(new Error(`HTTP ${response.status}`))
    return
  }

  console.info('[API] 🔗 SSE 连接已建立，开始接收流…')

  // ── 读取 SSE 流 ──
  // response.body 是 ReadableStream，通过 getReader() 异步读取
  const reader = response.body!.getReader()
  const decoder = new TextDecoder() // 将字节流转为 UTF-8 字符串

  /** 缓冲区：存储上一次读取后剩余的不完整行 */
  let buffer = ''

  while (true) {
    // 读取下一个数据块（chunk）
    const { done, value } = await reader.read()

    // done = true 表示流已结束
    if (done) {
      console.info('[API] ✅ SSE 流读取完毕')
      break
    }

    // 将新到达的二进制数据追加到缓冲区，并转成字符串
    buffer += decoder.decode(value, { stream: true })

    // 按 SSE 协议规定的换行符分割
    // 每条 SSE 消息格式为：event: <事件名>\ndata: <JSON>\n\n
    const lines = buffer.split('\n')
    // 最后一行留在缓冲区（可能是不完整的，等待下次数据到达）
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      // 跳过空行
      if (!line.trim()) continue

      // SSE 数据行以 "data: " 开头
      if (line.startsWith('data: ')) {
        const jsonStr = line.slice(6).trim() // 去掉 "data: " 前缀

        if (!jsonStr) continue

        try {
          const data = JSON.parse(jsonStr) as Record<string, unknown>

          // ── chunk 事件 ──
          // content 字段是 string，且不是 done 事件（done 事件包含 sessionId）
          if (typeof data['content'] === 'string' && !('sessionId' in data)) {
            onChunk(data['content'] as string)
          }
          // ── done 事件 ──
          else if (typeof data['sessionId'] === 'string') {
            console.info(`[API] ✅ SSE done [${data['sessionId']}] 传输完成`)
            onDone(data['content'] as string)
          }
          // ── error 事件 ──
          else if (typeof data['error'] === 'string') {
            console.error('[API] ❌ SSE error 事件：', data['error'])
            onError(new Error(data['error'] as string))
          }
        } catch {
          // JSON 解析失败（收到不完整的 JSON），直接跳过，不中断处理
          console.warn('[API] ⚠️  SSE 行解析失败，跳过：', jsonStr.slice(0, 50))
        }
      }
    }
  }
}

// ─── 会话管理 ──────────────────────────────────────────────

/**
 * 清除指定会话（服务端删除消息历史）
 * 调用时机：用户点击"新对话"或"清空当前对话"按钮
 */
export async function clearSession(sessionId: string): Promise<void> {
  console.info(`[API] DELETE /session/${sessionId}`)

  try {
    const res = await fetch(`${BASE_URL}/session/${sessionId}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    console.info(`[API] ✅ 会话 ${sessionId} 已清除`)
  } catch (err) {
    // 清除会话失败通常是网络问题，Print 错误但不 throw（前端已同步清除了本地状态）
    console.error(`[API] ❌ 清除会话 ${sessionId} 失败：`, err)
  }
}

// ─── 健康检查 ──────────────────────────────────────────────

/**
 * 健康检查 — 判断 Agent 服务是否在线
 *
 * 调用时机：
 *   - App.vue 挂载时（onMounted）
 *   - SidebarPanel 每 30 秒轮询一次
 *
 * @returns true = Agent 在线，false = Agent 离线或网络不可达
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch('/health')
    const online = res.ok

    console.info(`[API] 🔍 健康检查：${online ? '✅ Agent 在线' : '❌ Agent 离线'}`)
    return online
  } catch {
    console.warn('[API] ⚠️  健康检查网络错误：Agent 服务不可达')
    return false
  }
}

// ─── 会话列表 & 历史 ──────────────────────────────────────

export async function getSessions(): Promise<SessionMeta[]> {
  console.info('[API] GET /api/sessions')
  const res = await fetch(`${BASE_URL}/sessions`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function getHistory(sessionId: string): Promise<ChatMessage[]> {
  console.info(`[API] GET /api/history/${sessionId}`)
  const res = await fetch(`${BASE_URL}/history/${sessionId}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json() as { sessionId: string; history: { role: string; content: string; tool_call_id?: string }[] }
  return data.history
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m, i) => ({
      id: `${sessionId}_${i}`,
      role: m.role as 'user' | 'assistant',
      content: m.content,
      timestamp: Date.now(),
    }))
}
