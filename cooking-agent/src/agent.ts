/**
 * ============================================================
 * CookingAgent — 智能体核心类（数据库持久化版）
 * ============================================================
 *
 * ┌──────────────────────────────────────────────────────┐
 * │                   ReAct 推理循环                      │
 * │  ① Thought  →  分析用户意图，决定下一步行动          │
 * │  ② Action   →  调用工具（或直接回答）               │
 * │  ③ Observe  →  获取工具返回结果                     │
 * │  ④ Loop     →  重复直到有足够信息给出完整回答       │
 * │  ⑤ Answer   →  综合所有信息，给出最终回答           │
 * └──────────────────────────────────────────────────────┘
 *
 * 持久化策略：
 *   - 每次请求从 DB 加载历史消息到内存
 *   - ReAct 循环中每追加一条消息，同步写入 DB
 *   - 会话元信息（标题、时间戳）存储在 sessions 表
 *
 * 容错机制：
 *   - LLM 调用失败自动重试（最多 3 次，指数退避）
 *   - 工具调用失败不中断流程，继续推理
 */

import 'dotenv/config'
import { buildSystemMessage } from './prompts'
import { TOOL_LIST, executeTools } from './tools'
import { sessionRepo } from './db/session.repository'
import { messageRepo } from './db/message.repository'
import { userProfileRepo } from './db/user-profile.repository'
import { getProvider, type LLMProvider } from './llm'
import type { Message, ChatResult } from './types'
import type { ToolCall, ReActStep } from './tools/types'
import type { ChatCompletionResult } from './llm/types'

const MAX_REACT_STEPS = 5
const MAX_RETRIES = 3
const RETRY_BASE_DELAY_MS = 500

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function buildToolsParam() {
  return TOOL_LIST.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters as unknown as Record<string, unknown>,
    },
  }))
}

export class CookingAgent {
  private readonly llm: LLMProvider

  constructor() {
    this.llm = getProvider()

    console.info(`[CookingAgent] 🤖 模型：${this.llm.model} (${this.llm.name})`)
    console.info(`[CookingAgent] 🛠️  已注册工具：${TOOL_LIST.map((t) => t.name).join('、')}`)
    console.info('[CookingAgent] 💾 持久化：SQLite (data/cooking.db)')
    console.log('[CookingAgent] ✅ CookingAgent 构造完成')
  }

  // ─── 会话管理 ────────────────────────────────────────────

  private loadMessages(sessionId: string): Message[] {
    const now = Date.now()

    if (!sessionRepo.findById(sessionId)) {
      console.info(`[Session] 🆕 新建会话 ${sessionId}`)
      sessionRepo.create(sessionId, '新对话', now)

      const profilePrompt = userProfileRepo.buildProfilePrompt()
      const systemContent = buildSystemMessage() + profilePrompt

      const systemMsg: Message = { role: 'system', content: systemContent }
      messageRepo.insert(sessionId, systemMsg, now)
      return [systemMsg]
    }

    const rows = messageRepo.findBySessionId(sessionId)
    const messages: Message[] = rows.map((r) => ({
      role: r.role as Message['role'],
      content: r.content,
      tool_call_id: r.tool_call_id ?? undefined,
      tool_calls: r.tool_calls ? JSON.parse(r.tool_calls) : undefined,
    }))

    console.info(`[Session] 📂 加载会话 ${sessionId}：${messages.length} 条消息`)
    return messages
  }

  private persistMessage(sessionId: string, msg: Message): void {
    messageRepo.insert(sessionId, msg, Date.now())
  }

  listSessions() {
    return sessionRepo.findAll()
  }

  clearSession(sessionId: string): void {
    messageRepo.deleteBySessionId(sessionId)
    const deleted = sessionRepo.deleteById(sessionId)
    console.info(`[Session] 🗑️ 清除会话 ${sessionId}：${deleted ? '成功' : '不存在'}`)
  }

  getHistory(sessionId: string): Message[] {
    return messageRepo.findHistoryBySessionId(sessionId)
  }

  // ─── LLM 调用（带重试）───────────────────────────────────

  private async callLLMWithRetry(messages: Message[]): Promise<ChatCompletionResult> {
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this.llm.chatCompletion({
          messages: messages as any,
          tools: buildToolsParam(),
          tool_choice: 'auto',
          temperature: 0.7,
          max_tokens: 2048,
        })
      } catch (err) {
        lastError = err as Error
        if (attempt < MAX_RETRIES) {
          const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1)
          console.warn(`[Agent] ⚠️ LLM 调用失败（第 ${attempt}/${MAX_RETRIES} 次），${delay}ms 后重试：${lastError.message}`)
          await sleep(delay)
        }
      }
    }

    throw lastError ?? new Error('LLM 调用失败，已达最大重试次数')
  }

  // ─── 用户消息预处理 ──────────────────────────────────────

  private prependUserMessage(messages: Message[], sessionId: string, userMessage: string): void {
    const now = Date.now()
    console.info(`[Agent] 📥 用户消息 [${sessionId}]：${userMessage.slice(0, 60)}${userMessage.length > 60 ? '…' : ''}`)

    const userMsg: Message = { role: 'user', content: userMessage }
    messages.push(userMsg)
    this.persistMessage(sessionId, userMsg)

    const isFirstUserMessage = messageRepo.countBySessionId(sessionId) === 1
    if (isFirstUserMessage) {
      const title = userMessage.slice(0, 20) + (userMessage.length > 20 ? '…' : '')
      sessionRepo.updateTitle(sessionId, title, now)
    } else {
      sessionRepo.touch(sessionId, now)
    }
  }

  // ─── 工具调用处理（chat / chatStream 共用）───────────────

  private async handleToolCalls(
    messages: Message[],
    sessionId: string,
    assistantContent: string | null,
    assistantToolCalls: ChatCompletionResult['tool_calls'],
    reactLog: ReActStep[],
    step: number,
  ): Promise<number> {
    if (!assistantToolCalls || assistantToolCalls.length === 0) return 0

    console.info(`[Agent] 🔧 LLM 请求调用 ${assistantToolCalls.length} 个工具`)

    const toolMsg: Message = {
      role: 'assistant',
      content: assistantContent ?? '',
      tool_calls: assistantToolCalls.map((c) => ({
        id: c.id,
        type: 'function' as const,
        function: {
          name: c.function.name,
          arguments: c.function.arguments,
        },
      })),
    }
    messages.push(toolMsg)
    this.persistMessage(sessionId, toolMsg)

    reactLog.push({
      step,
      thought: `需要调用工具获取准确信息：${assistantToolCalls.map((c) => c.function.name).join(', ')}`,
      action: assistantToolCalls.map((c) => c.function.name).join(' + '),
      actionInput: assistantToolCalls.map((c): Record<string, unknown> => {
        try { return JSON.parse(c.function.arguments) } catch { return {} }
      }),
    })

    const toolCalls: ToolCall[] = assistantToolCalls.map((c) => ({
      id: c.id,
      name: c.function.name,
      arguments: c.function.arguments,
    }))

    const toolResults = await executeTools(toolCalls, sessionId)

    for (const { id, result } of toolResults) {
      const obsContent = result.success
        ? JSON.stringify(result.data)
        : `【工具执行失败】${result.error}`

      const obsMsg: Message = {
        role: 'tool' as const,
        tool_call_id: id,
        content: obsContent,
      }
      messages.push(obsMsg)
      this.persistMessage(sessionId, obsMsg)

      if (reactLog.length > 0) {
        const last = reactLog[reactLog.length - 1]
        last.observation = result.success
          ? `✅ 执行成功，结果已返回`
          : `❌ 失败：${result.error}`
      }
    }

    console.info(`[Agent] ✅ 工具执行完成，继续推理…`)
    return toolCalls.length
  }

  // ─── ReAct 循环日志 ──────────────────────────────────────

  private logReActSummary(reactLog: ReActStep[], totalToolCalls: number): void {
    if (reactLog.length === 0) return
    console.info(`[Agent] 📋 ReAct 执行摘要（${reactLog.length} 步，调用 ${totalToolCalls} 个工具）：`)
    for (const s of reactLog) {
      console.info(`       步${s.step}: ${s.action} → ${s.observation}`)
    }
  }

  // ─── 普通对话 ────────────────────────────────────────────

  async chat(userMessage: string, sessionId: string = 'default'): Promise<ChatResult> {
    const messages = this.loadMessages(sessionId)
    this.prependUserMessage(messages, sessionId, userMessage)

    const reactLog: ReActStep[] = []
    let totalToolCalls = 0

    try {
      for (let step = 1; step <= MAX_REACT_STEPS; step++) {
        console.info(`[Agent] 🧠 ReAct 推理第 ${step} 步...`)

        const response = await this.callLLMWithRetry(messages)

        const assistantContent = response.content
        const assistantToolCalls = response.tool_calls

        if (assistantToolCalls && assistantToolCalls.length > 0) {
          totalToolCalls += await this.handleToolCalls(
            messages, sessionId, assistantContent, assistantToolCalls, reactLog, step,
          )
        } else {
          const finalContent = assistantContent ?? ''
          console.info(`[Agent] ✅ LLM 直接回答（${finalContent.length} 字符）`)

          const answerMsg: Message = { role: 'assistant', content: finalContent }
          messages.push(answerMsg)
          this.persistMessage(sessionId, answerMsg)

          this.logReActSummary(reactLog, totalToolCalls)

          const result: ChatResult = {
            success: true,
            message: finalContent,
            sessionId,
            usage: response.usage
              ? {
                  prompt_tokens: response.usage.prompt_tokens,
                  completion_tokens: response.usage.completion_tokens,
                  total_tokens: response.usage.total_tokens,
                }
              : undefined,
          }

          if (result.usage) {
            console.info(
              `[Agent] 📈 Token 消耗 - 输入：${result.usage.prompt_tokens}，` +
              `输出：${result.usage.completion_tokens}，` +
              `总计：${result.usage.total_tokens}`,
            )
          }

          return result
        }
      }

      return this.fallbackAnswer(messages, sessionId)

    } catch (error) {
      console.error(`[Agent] ❌ 调用失败 [${sessionId}]：${(error as Error).message}`)
      throw error
    }
  }

  // ─── 流式对话 ────────────────────────────────────────────

  async chatStream(
    userMessage: string,
    sessionId: string = 'default',
    onChunk: (delta: string) => void,
    onDone: (fullContent: string) => void,
  ): Promise<void> {
    const messages = this.loadMessages(sessionId)
    this.prependUserMessage(messages, sessionId, userMessage)

    let fullContent = ''
    let totalToolCalls = 0
    const reactLog: ReActStep[] = []

    try {
      for (let step = 1; step <= MAX_REACT_STEPS; step++) {
        console.info(`[Agent] 🧠 ReAct 推理第 ${step} 步...`)

        const response = await this.callLLMWithRetry(messages)

        const assistantContent = response.content
        const assistantToolCalls = response.tool_calls

        if (assistantToolCalls && assistantToolCalls.length > 0) {
          totalToolCalls += await this.handleToolCalls(
            messages, sessionId, assistantContent, assistantToolCalls, reactLog, step,
          )
        } else {
          console.info(`[Agent] 🔄 进入流式回答阶段`)

          await this.llm.chatCompletionStream(
            {
              messages: messages as any,
              temperature: 0.7,
              max_tokens: 2048,
            },
            (chunk) => {
              fullContent += chunk
              onChunk(chunk)
            },
            () => {
              console.info(`[Agent] ✅ 流式回答完成（${fullContent.length} 字符）`)
            },
            (err) => {
              console.error(`[Agent] ❌ 流式回答出错：${err.message}`)
            },
          )

          const answerMsg: Message = { role: 'assistant', content: fullContent }
          messages.push(answerMsg)
          this.persistMessage(sessionId, answerMsg)

          this.logReActSummary(reactLog, totalToolCalls)

          console.info(`[Agent] ✅ 流式回答完成（${fullContent.length} 字符）`)
          onDone(fullContent)
          return
        }
      }

      const fallback = '抱歉，这个问题比较复杂，我已经尽力思考了。请您换个更具体的问题。'
      const fallbackMsg: Message = { role: 'assistant', content: fallback }
      messages.push(fallbackMsg)
      this.persistMessage(sessionId, fallbackMsg)
      onDone(fallback)

    } catch (error) {
      console.error(`[Agent] ❌ 流式调用失败 [${sessionId}]：${(error as Error).message}`)
      throw error
    }
  }

  // ─── 兜底回答 ────────────────────────────────────────────

  private fallbackAnswer(messages: Message[], sessionId: string): ChatResult {
    console.warn(`[Agent] ⚠️ 达到最大推理步数 ${MAX_REACT_STEPS}，强制结束`)
    const fallback = '抱歉，这个问题比较复杂，我已经尽力思考了。请您换个更具体的问题，或者我可以为您查询具体的菜谱、营养数据或食品安全信息。'
    const fallbackMsg: Message = { role: 'assistant', content: fallback }
    messages.push(fallbackMsg)
    this.persistMessage(sessionId, fallbackMsg)
    return { success: true, message: fallback, sessionId }
  }
}