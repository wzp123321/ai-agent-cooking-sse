// ─── 消息类型 ─────────────────────────────────────────
export type MessageRole = 'user' | 'assistant'

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  timestamp: number
  streaming?: boolean // 是否正在流式输出
}

// ─── 会话类型 ─────────────────────────────────────────
export interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

// ─── API 响应类型 ─────────────────────────────────────
export interface ChatResponse {
  success: boolean
  message: string
  sessionId: string
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

// ─── SSE 事件类型 ─────────────────────────────────────
export interface SSEChunkData {
  content: string
}

export interface SSEDoneData {
  content: string
  sessionId: string
}

export interface SSEErrorData {
  error: string
}
