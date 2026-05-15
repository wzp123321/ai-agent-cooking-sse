/**
 * ============================================================
 * CookingAgent — 真正的智能体核心类
 * ============================================================
 *
 * 架构升级：从"对话机器人" → "有工具调用能力的智能体"
 *
 * ┌──────────────────────────────────────────────────────┐
 * │                   ReAct 推理循环                      │
 * │                                                       │
 * │  ① Thought  →  分析用户意图，决定下一步行动          │
 * │  ② Action   →  调用工具（或直接回答）               │
 * │  ③ Observe  →  获取工具返回结果                     │
 * │  ④ Loop     →  重复直到有足够信息给出完整回答       │
 * │  ⑤ Answer   →  综合所有信息，给出最终回答           │
 * └──────────────────────────────────────────────────────┘
 *
 * 核心能力：
 *   ✅ Function Calling（OpenAI SDK 工具调用）
 *   ✅ ReAct 推理循环（Thought → Action → Observe）
 *   ✅ 多工具协作（一次对话可调用多个工具）
 *   ✅ 流式输出（打字机效果）
 *   ✅ 多轮对话记忆
 *   ✅ Token 消耗统计
 *   ✅ SkillLoader（从 skills/*.md 动态加载）
 */

import OpenAI from 'openai'
import 'dotenv/config'
import { buildSystemMessage } from './prompts'
import { TOOL_LIST, executeTools } from './tools'
import type { Message, ChatResult } from './types'
import type { ToolCall, ReActStep } from './tools/types'

export class CookingAgent {
  // ─── 私有字段 ───────────────────────────────────────────

  /** OpenAI SDK 客户端（DeepSeek 兼容） */
  private readonly client: OpenAI

  /** 模型名 */
  private readonly model: string = 'deepseek-chat'

  /**
   * 会话记忆
   * 结构：Map<sessionId, messages[]>
   * 消息数组首条为 system message（包含工具描述和推理指令）
   */
  private readonly sessions: Map<string, Message[]> = new Map()

  /** Agent 最大推理步数（防止死循环） */
  private readonly MAX_REACT_STEPS = 5

  // ─── 构造函数 ───────────────────────────────────────────

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
    console.log('[CookingAgent] ✅ CookingAgent 构造完成')
  }

  // ─── 会话管理 ────────────────────────────────────────────

  /**
   * 获取（或初始化）会话历史
   */
  private getSession(sessionId: string): Message[] {
    if (!this.sessions.has(sessionId)) {
      console.info(`[Session] 🆕 新建会话 ${sessionId}`)
      const systemMessage = buildSystemMessage()
      this.sessions.set(sessionId, [
        { role: 'system', content: systemMessage },
      ])
    }
    return this.sessions.get(sessionId)!
  }

  /** 清除会话 */
  clearSession(sessionId: string): void {
    const deleted = this.sessions.delete(sessionId)
    console.info(`[Session] 🗑️ 清除会话 ${sessionId}：${deleted ? '成功' : '不存在'}`)
  }

  /** 获取历史（不含 system） */
  getHistory(sessionId: string): Message[] {
    const session = this.sessions.get(sessionId)
    if (!session) return []
    return session.filter((m) => m.role !== 'system')
  }

  // ─── 普通对话（工具调用 + 推理循环）───────────────────────

  /**
   * 核心方法：带工具调用的智能对话
   *
   * 完整流程：
   *   1. 追加用户消息
   *   2. 进入 ReAct 循环（最多 MAX_REACT_STEPS 次）
   *      a. 调用 LLM，传递 tools 参数
   *      b. 若 LLM 请求工具 → 执行工具 → 追加结果 → 继续循环
   *      c. 若 LLM 直接回答 → 跳出循环
   *   3. 返回最终回答和 token 消耗
   */
  async chat(userMessage: string, sessionId: string = 'default'): Promise<ChatResult> {
    const messages = this.getSession(sessionId)
    console.info(`[Agent] 📥 用户消息 [${sessionId}]：${userMessage.slice(0, 60)}${userMessage.length > 60 ? '…' : ''}`)
    console.info(`[Agent] 📊 当前上下文消息数：${messages.length}`)

    messages.push({ role: 'user', content: userMessage })

    // ReAct 执行日志
    const reactLog: ReActStep[] = []
    let totalToolCalls = 0

    try {
      // ── ReAct 推理循环 ──
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

        // ── Case 1: LLM 调用了工具 ──
        if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
          console.info(`[Agent] 🔧 LLM 请求调用 ${assistantMsg.tool_calls.length} 个工具`)

          // 追加 LLM 的 tool_calls 消息（关键！LLM 需要看到自己的调用请求）
          messages.push(assistantMsg as unknown as Message)

          // 记录 Thought
          reactLog.push({
            step,
            thought: `需要调用工具获取准确信息：${assistantMsg.tool_calls.map((c) => c.function.name).join(', ')}`,
            action: assistantMsg.tool_calls.map((c) => c.function.name).join(' + '),
            actionInput: assistantMsg.tool_calls.map((c): Record<string, unknown> => {
              try { return JSON.parse(c.function.arguments) } catch { return {} }
            }),
          })

          // ── 执行工具 ──
          const toolCalls: ToolCall[] = assistantMsg.tool_calls.map((c) => ({
            id: c.id,
            name: c.function.name,
            arguments: c.function.arguments,
          }))

          totalToolCalls += toolCalls.length

          const toolResults = await executeTools(toolCalls, sessionId)

          // ── 追加工具返回结果 ──
          for (const { id, result } of toolResults) {
            const obsContent = result.success
              ? JSON.stringify(result.data)
              : `【工具执行失败】${result.error}`

            messages.push({
              role: 'tool' as const,
              tool_call_id: id,
              content: obsContent,
            })

            // 更新 ReAct 日志的 Observation
            if (reactLog.length > 0) {
              const last = reactLog[reactLog.length - 1]
              last.observation = result.success
                ? `✅ 执行成功，结果已返回`
                : `❌ 失败：${result.error}`
            }
          }

          console.info(`[Agent] ✅ 工具执行完成，继续推理…`)
          // 循环继续：让 LLM 基于工具结果继续思考
        }

        // ── Case 2: LLM 直接给出最终回答 ──
        else {
          const finalContent = assistantMsg.content ?? ''
          console.info(`[Agent] ✅ LLM 直接回答（${finalContent.length} 字符）`)

          messages.push({ role: 'assistant', content: finalContent })

          // 打印 ReAct 执行摘要
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

      // 达到最大推理步数仍未结束
      console.warn(`[Agent] ⚠️ 达到最大推理步数 ${this.MAX_REACT_STEPS}，强制结束`)
      const fallback = '抱歉，这个问题比较复杂，我已经尽力思考了。请您换个更具体的问题，或者我可以为您查询具体的菜谱、营养数据或食品安全信息。'
      messages.push({ role: 'assistant', content: fallback })
      return { success: true, message: fallback, sessionId }

    } catch (error) {
      console.error(`[Agent] ❌ 调用失败 [${sessionId}]：${(error as Error).message}`)
      messages.pop() // 回滚用户消息
      throw error
    }
  }

  // ─── 流式对话 ────────────────────────────────────────────

  /**
   * 流式对话（带工具调用）
   *
   * 注意：工具执行本身不是流式的（工具结果是离散的 JSON）。
   * 流式效果体现在 LLM 的最终回答部分（打字机效果）。
   *
   * 流式流程：
   *   1. 正常执行 ReAct 循环
   *   2. 最终回答阶段使用 stream: true，逐 token 推送给客户端
   */
  async chatStream(
    userMessage: string,
    sessionId: string = 'default',
    onChunk: (delta: string) => void,
    onDone: (fullContent: string) => void,
  ): Promise<void> {
    const messages = this.getSession(sessionId)
    console.info(`[Agent] 📥 流式请求 [${sessionId}]：${userMessage.slice(0, 60)}${userMessage.length > 60 ? '…' : ''}`)

    messages.push({ role: 'user', content: userMessage })

    let fullContent = ''
    let totalToolCalls = 0
    const reactLog: ReActStep[] = []

    try {
      // ── ReAct 推理循环（非流式） ──
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
          messages.push(assistantMsg as unknown as Message)

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

            messages.push({
              role: 'tool' as const,
              tool_call_id: id,
              content: obsContent,
            })

            if (reactLog.length > 0) {
              reactLog[reactLog.length - 1].observation = result.success
                ? `✅ 成功`
                : `❌ 失败：${result.error}`
            }
          }

          console.info(`[Agent] ✅ 工具执行完成，继续推理…`)
        } else {
          // ── 最终回答 → 切换流式输出 ──
          console.info(`[Agent] 🔄 进入流式回答阶段`)

          // 打印 ReAct 日志
          if (reactLog.length > 0) {
            console.info(`[Agent] 📋 ReAct 执行摘要（${reactLog.length} 步，${totalToolCalls} 个工具）：`)
            for (const s of reactLog) {
              console.info(`       步${s.step}: ${s.action} → ${s.observation ?? '完成'}`)
            }
          }

          // 追加 assistant 消息
          messages.push({ role: 'assistant', content: '' })

          // 用 stream 重新生成最终回答（打字机效果）
          const stream = await this.client.chat.completions.create({
            model: this.model,
            messages: messages as any,
            stream: true,
            temperature: 0.7,
            max_tokens: 2048,
          })

          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content ?? ''
            if (delta) {
              fullContent += delta
              onChunk(delta)
            }
          }

          // 更新 messages 中最后一条 assistant 消息
          messages[messages.length - 1] = { role: 'assistant', content: fullContent }

          console.info(`[Agent] ✅ 流式回答完成（${fullContent.length} 字符）`)
          onDone(fullContent)
          return
        }
      }

      // 达到最大推理步数
      const fallback = '抱歉，这个问题比较复杂，建议您换个更具体的问题。'
      onDone(fallback)
      messages.push({ role: 'assistant', content: fallback })

    } catch (error) {
      console.error(`[Agent] ❌ 流式调用失败 [${sessionId}]：${(error as Error).message}`)
      messages.pop()
      throw error
    }
  }
}
