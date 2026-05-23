/**
 * ============================================================
 * useSSEStream — SSE 流式请求 Hook
 * ============================================================
 *
 * 职责：
 *   封装 SSE（Server-Sent Events）流式请求的完整逻辑
 *   提供启动流、中止流、状态管理等能力
 *
 * 使用方式：
 *   const { startStream, stopStream, isStreaming, error } = useSSEStream({
 *     onChunk: (chunk) => console.log(chunk),
 *     onDone: (full) => console.log('完成:', full),
 *     onError: (err) => console.error(err),
 *   })
 *   await startStream('/chat/stream', { message: 'hello' })
 */

import { ref } from 'vue'
import { BASE_URL } from '@/constants'

export interface SSEStreamOptions {
  onChunk?: (chunk: string) => void
  onDone?: (full: string) => void
  onError?: (err: Error) => void
  timeoutMs?: number
}

export const useSSEStream = (options: SSEStreamOptions = {}) => {
  const {
    onChunk = () => {},
    onDone = () => {},
    onError = () => {},
    timeoutMs = 60_000,
  } = options

  const isStreaming = ref(false)
  const error = ref<Error | null>(null)
  const fullContent = ref('')

  let abortController: AbortController | null = null
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null

  const clearTimeoutTimer = () => {
    if (timeoutTimer !== null) {
      clearTimeout(timeoutTimer)
      timeoutTimer = null
    }
  }

  const stopStream = (): void => {
    clearTimeoutTimer()
    if (abortController) {
      abortController.abort()
      abortController = null
    }
    isStreaming.value = false
    console.info('[SSE] 🛑 流已停止')
  }

  const startStream = async (
    endpoint: string,
    body: Record<string, unknown>,
  ): Promise<void> => {
    if (isStreaming.value) {
      console.warn('[SSE] ⚠️ 正在流式传输中，忽略重复请求')
      return
    }

    stopStream()

    isStreaming.value = true
    error.value = null
    fullContent.value = ''

    console.info(`[SSE] 📤 开始流式请求: ${endpoint}`)

    abortController = new AbortController()

    if (timeoutMs > 0) {
      timeoutTimer = setTimeout(() => {
        if (!abortController) return
        console.warn('[SSE] ⏰ 流式请求超时')
        abortController.abort()
        abortController = null
      }, timeoutMs)
    }

    let response: Response

    try {
      response = await fetch(`${BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: abortController.signal,
      })
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        console.info('[SSE] 🛑 请求已取消')
        isStreaming.value = false
        return
      }
      console.error('[SSE] ❌ 网络请求失败：', err)
      error.value = err as Error
      isStreaming.value = false
      onError(err as Error)
      return
    }

    if (!response.ok) {
      console.error(`[SSE] ❌ HTTP ${response.status}`)
      const err = new Error(`HTTP ${response.status}`)
      error.value = err
      isStreaming.value = false
      onError(err)
      return
    }

    console.info('[SSE] 🔗 连接已建立，开始接收流…')

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          console.info('[SSE] ✅ 流读取完毕')
          break
        }

        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.trim()) continue

          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6).trim()
            if (!jsonStr) continue

            try {
              const data = JSON.parse(jsonStr) as Record<string, unknown>

              if (typeof data['content'] === 'string' && !('sessionId' in data)) {
                fullContent.value += data['content'] as string
                onChunk(data['content'] as string)
              } else if (typeof data['sessionId'] === 'string') {
                clearTimeoutTimer()
                console.info(`[SSE] ✅ 传输完成 [${data['sessionId']}]`)
                onDone(fullContent.value)
              } else if (typeof data['error'] === 'string') {
                clearTimeoutTimer()
                console.error('[SSE] ❌ 错误事件：', data['error'])
                const err = new Error(data['error'] as string)
                error.value = err
                onError(err)
              }
            } catch {
              console.warn('[SSE] ⚠️ 行解析失败，跳过：', jsonStr.slice(0, 50))
            }
          }
        }
      }
    } catch (err) {
      clearTimeoutTimer()
      console.error('[SSE] ❌ 连接中断：', err)
      const errorMsg = new Error('连接中断，请检查服务是否正常运行')
      error.value = errorMsg
      onError(errorMsg)
    } finally {
      isStreaming.value = false
      abortController = null
    }
  }

  return {
    startStream,
    stopStream,
    isStreaming,
    error,
    fullContent,
  }
}