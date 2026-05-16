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
 */

import OpenAI from 'openai'
import 'dotenv/config'
import { buildSystemMessage } from './prompts'
import { TOOL_LIST, executeTools } from './tools'
import { sessionRepo } from './db/session.repository'
import { messageRepo } from './db/message.repository'
import type { Message, ChatResult } from './types'
import type { ToolCall, ReActStep } from './tools/types'

export class CookingAgent {
  private readonly client: OpenAI
  private readonly model: string = 'deepseek-chat'
  private readonly MAX_REACT_STEPS = 5

  constructor() {
    const apiKey = process.env.DEEPSEEK_API_KEY

    if (!apiKey) {
      console.error('[CookingAgent] ❌ 启动失败：缺少 DEEPSEEK_API_KEY 环境变量')
      throw new Error('缺少 DEEPSEEK_API_KEY 环境变量，请在 .env 文件中配置')
    }

    this.client = new OpenAI({
      apiKey,
      baseURL: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com',
    })

    console.info(`[CookingAgent] 🤖 模型：${this.model}`)
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

      const systemMsg: Message = { role: 'system', content: buildSystemMessage() }
      messageRepo.insert(sessionId, systemMsg, now)
      return [systemMsg]
    }

    const rows = messageRepo.findBySessionId(sessionId)
    const messages: Message[] = rows.map((r) => ({
      role: r.role as Message['role'],
      content: r.content,
      tool_call_id: r.tool_call_id ?? undefined,
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

  // ─── 普通对话 ────────────────────────────────────────────

  async chat(userMessage: string, sessionId: string = 'default'): Promise<ChatResult> {
    const messages = this.loadMessages(sessionId)
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

    const reactLog: ReActStep[] = []
    let totalToolCalls = 0

    try {
      for (let step = 1; step <= this.MAX_REACT_STEPS; step++) {
        console.info(`[Agent] 🧠 ReAct 推理第 ${step} 步...`)

        const response = await this.client.chat.completions.create({
          model: this.model,
          messages: messages as any,
          tools: TOOL_LIST.map((t) => ({
            type: 'function' as const,
            function: {
              name: t.name,
              description: t.description,
              parameters: t.parameters as unknown as Record<string, unknown>,
            },
          })),
          tool_choice: 'auto',
          temperature: 0.7,
          max_tokens: 2048,
        })

        const assistantMsg = response.choices[0].message

        if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
          console.info(`[Agent] 🔧 LLM 请求调用 ${assistantMsg.tool_calls.length} 个工具`)

          const toolMsg: Message = {
            role: 'assistant',
            content: assistantMsg.content ?? '',
            tool_call_id: undefined,
          }
          messages.push(toolMsg)
          this.persistMessage(sessionId, toolMsg)

          reactLog.push({
            step,
            thought: `需要调用工具获取准确信息：${assistantMsg.tool_calls.map((c) => c.function.name).join(', ')}`,
            action: assistantMsg.tool_calls.map((c) => c.function.name).join(' + '),
            actionInput: assistantMsg.tool_calls.map((c): Record<string, unknown> => {
              try { return JSON.parse(c.function.arguments) } catch { return {} }
            }),
          })

          const toolCalls: ToolCall[] = assistantMsg.tool_calls.map((c) => ({
            id: c.id,
            name: c.function.name,
            arguments: c.function.arguments,
          }))

          totalToolCalls += toolCalls.length
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
        } else {
          const finalContent = assistantMsg.content ?? ''
          console.info(`[Agent] ✅ LLM 直接回答（${finalContent.length} 字符）`)

          const answerMsg: Message = { role: 'assistant', content: finalContent }
          messages.push(answerMsg)
          this.persistMessage(sessionId, answerMsg)

          if (reactLog.length > 0) {
            console.info(`[Agent] 📋 ReAct 执行摘要（${reactLog.length} 步，调用 ${totalToolCalls} 个工具）：`)
            for (const s of reactLog) {
              console.info(`       步${s.step}: ${s.action} → ${s.observation}`)
            }
          }

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

      console.warn(`[Agent] ⚠️ 达到最大推理步数 ${this.MAX_REACT_STEPS}，强制结束`)
      const fallback = '抱歉，这个问题比较复杂，我已经尽力思考了。请您换个更具体的问题，或者我可以为您查询具体的菜谱、营养数据或食品安全信息。'
      const fallbackMsg: Message = { role: 'assistant', content: fallback }
      messages.push(fallbackMsg)
      this.persistMessage(sessionId, fallbackMsg)
      return { success: true, message: fallback, sessionId }

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
    const now = Date.now()

    console.info(`[Agent] 📥 流式请求 [${sessionId}]：${userMessage.slice(0, 60)}${userMessage.length > 60 ? '…' : ''}`)

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

    let fullContent = ''
    let totalToolCalls = 0
    const reactLog: ReActStep[] = []

    try {
      for (let step = 1; step <= this.MAX_REACT_STEPS; step++) {
        console.info(`[Agent] 🧠 ReAct 推理第 ${step} 步...`)

        const response = await this.client.chat.completions.create({
          model: this.model,
          messages: messages as any,
          tools: TOOL_LIST.map((t) => ({
            type: 'function' as const,
            function: {
              name: t.name,
              description: t.description,
              parameters: t.parameters as unknown as Record<string, unknown>,
            },
          })),
          tool_choice: 'auto',
          temperature: 0.7,
          max_tokens: 2048,
        })

        const assistantMsg = response.choices[0].message

        if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
          console.info(`[Agent] 🔧 LLM 请求调用 ${assistantMsg.tool_calls.length} 个工具`)

          const toolMsg: Message = {
            role: 'assistant',
            content: assistantMsg.content ?? '',
            tool_call_id: undefined,
          }
          messages.push(toolMsg)
          this.persistMessage(sessionId, toolMsg)

          reactLog.push({
            step,
            thought: `调用工具：${assistantMsg.tool_calls.map((c) => c.function.name).join(', ')}`,
            action: assistantMsg.tool_calls.map((c) => c.function.name).join(' + '),
            actionInput: assistantMsg.tool_calls.map((c): Record<string, unknown> => {
              try { return JSON.parse(c.function.arguments) } catch { return {} }
            }),
          })

          const toolCalls: ToolCall[] = assistantMsg.tool_calls.map((c) => ({
            id: c.id,
            name: c.function.name,
            arguments: c.function.arguments,
          }))

          totalToolCalls += toolCalls.length
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
              reactLog[reactLog.length - 1].observation = result.success
                ? `✅ 成功`
                : `❌ 失败：${result.error}`
            }
          }

          console.info(`[Agent] ✅ 工具执行完成，继续推理…`)
        } else {
          console.info(`[Agent] 🔄 进入流式回答阶段`)

          const stream = await this.client.chat.completions.create({
            model: this.model,
            messages: messages as any,
            stream: true,
            temperature: 0.7,
            max_tokens: 2048,
          })

          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content
            if (delta) {
              fullContent += delta
              onChunk(delta)
            }
          }

          const answerMsg: Message = { role: 'assistant', content: fullContent }
          messages.push(answerMsg)
          this.persistMessage(sessionId, answerMsg)

          if (reactLog.length > 0) {
            console.info(`[Agent] 📋 ReAct 执行摘要（${reactLog.length} 步，调用 ${totalToolCalls} 个工具）：`)
            for (const s of reactLog) {
              console.info(`       步${s.step}: ${s.action} → ${s.observation}`)
            }
          }

          console.info(`[Agent] ✅ 流式回答完成（${fullContent.length} 字符）`)
          onDone(fullContent)
          return
        }
      }

      console.warn(`[Agent] ⚠️ 达到最大推理步数 ${this.MAX_REACT_STEPS}，强制结束`)
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
}