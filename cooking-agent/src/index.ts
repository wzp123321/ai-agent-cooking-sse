/**
 * ============================================================
 * cooking-agent 入口文件 — Express HTTP 服务
 * ============================================================
 *
 * 功能概述：
 *   提供 HTTP REST API，供前端应用调用做菜智能体。
 *
 * 接口清单：
 *   GET  /health              - 健康检查（前端轮询判断 Agent 是否在线）
 *   POST /api/chat            - 普通对话（完整返回）
 *   POST /api/chat/stream     - 流式对话（SSE）
 *   GET  /api/history/:id     - 获取对话历史
 *   DELETE /api/session/:id   - 清除指定会话
 *
 * 技术选型：
 *   - Express：轻量 HTTP 框架，路由清晰，middleware 机制完善
 *   - CORS：允许前端跨域访问
 *   - SSE（Server-Sent Events）：服务端推送协议，比 WebSocket 更轻量
 *
 * 注意事项：
 *   - SSE 连接会占用一个 HTTP 响应流，直到 res.end() 才释放
 *   - 生产环境建议在 Nginx/网关层配置连接超时
 */

import express, { type Request, type Response } from 'express'
import cors from 'cors'
import 'dotenv/config'
import { CookingAgent } from './agent'
import { runMigrations } from './db/migrate'
import { userProfileRepo } from './db/user-profile.repository'
import type { ChatRequestBody } from './types'

// ─── Express 应用初始化 ────────────────────────────────────

const app = express()
const PORT = Number(process.env.PORT) || 9000

console.log('═══════════════════════════════════════════════')
console.log('   🍳 厨神小助 Agent 服务启动中…')
console.log('═══════════════════════════════════════════════')

// ─── 中间件配置 ────────────────────────────────────────────

// CORS：允许所有来源的跨域请求（开发环境）
// 生产环境建议配置为具体的前端域名，如：origin: 'http://localhost:5173'
app.use(cors())
console.info('[Middleware] ✅ CORS 已启用')

// JSON 请求体解析：限制 100KB 防止大请求攻击
app.use(express.json({ limit: '100kb' }))
console.info('[Middleware] ✅ JSON 解析中间件已启用（限制 100KB）')

// 请求日志中间件
app.use((req: Request, _res: Response, next: express.NextFunction) => {
  const start = Date.now()
  const { method, url } = req

  _res.on('finish', () => {
    const duration = Date.now() - start
    const { statusCode } = _res
    const level = statusCode >= 400 ? '⚠️' : '📥'
    console.info(`[HTTP] ${level} ${method} ${url} → ${statusCode} (${duration}ms)`)
  })

  next()
})

// 简易请求限流（基于 IP，每秒最多 10 个请求）
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_MAX = 10
const RATE_LIMIT_WINDOW_MS = 1000

app.use((req: Request, res: Response, next: express.NextFunction) => {
  const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown'
  const now = Date.now()
  const entry = rateLimitMap.get(ip)

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    next()
    return
  }

  entry.count++
  if (entry.count > RATE_LIMIT_MAX) {
    console.warn(`[RateLimit] ⚠️ IP ${ip} 超过限流阈值（${entry.count}/${RATE_LIMIT_WINDOW_MS}ms）`)
    res.status(429).json({ error: '请求过于频繁，请稍后再试' })
    return
  }

  next()
})

// 定期清理限流记录（每 60 秒）
setInterval(() => {
  const now = Date.now()
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(ip)
  }
}, 60_000)
console.info('[Middleware] ✅ 请求限流已启用（每 IP 每秒最多 10 次）')

// ─── 数据库初始化 ──────────────────────────────────────────

runMigrations()

// ─── Agent 初始化 ──────────────────────────────────────────

let agent: CookingAgent

try {
  agent = new CookingAgent()
  console.log('✅ 厨神小助 Agent 初始化成功')
} catch (err) {
  // Agent 初始化失败（如缺少 API Key）时，直接退出进程
  // 不让服务以不健康的状态启动，避免前端请求时报更难追踪的错误
  console.error('❌ Agent 初始化失败：', (err as Error).message)
  console.error('💡 请检查 .env 文件中的 DEEPSEEK_API_KEY 是否正确配置')
  process.exit(1)
}

// ─── 路由定义 ──────────────────────────────────────────────

/**
 * GET /health
 * ────────────────────────────────────────────────────────────
 * 健康检查接口。
 *
 * 用途：
 *   - 前端每 30 秒轮询一次，判断 Agent 服务是否在线
 *   - 负载均衡器/容器编排探测服务可用性
 *
 * 请求参数：无
 *
 * 返回示例：
 *   { "status": "ok", "agent": "厨神小助", "version": "1.0.0" }
 */
app.get('/health', (_req: Request, res: Response) => {
  console.debug('[Route] GET /health 被调用')
  res.json({
    status: 'ok',
    agent: '厨神小助',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  })
})

/**
 * POST /api/chat
 * ────────────────────────────────────────────────────────────
 * 普通对话接口（非流式，一次性返回完整结果）。
 *
 * 适用场景：
 *   - 简单问答（不需要打字机效果）
 *   - 客户端不支持 SSE（如某些低版本浏览器）
 *
 * 请求 Body：
 *   {
 *     "message": "string",   // 必填，用户消息
 *     "sessionId": "string"  // 选填，默认 'default'
 *   }
 *
 * 返回示例：
 *   {
 *     "success": true,
 *     "message": "这是 AI 回复的完整内容…",
 *     "sessionId": "123456_abc",
 *     "usage": { "prompt_tokens": 120, "completion_tokens": 85, "total_tokens": 205 }
 *   }
 */
app.post(
  '/api/chat',
  async (req: Request<object, object, ChatRequestBody>, res: Response) => {
    const { message, sessionId = 'default' } = req.body

    console.info(`[Route] POST /api/chat [${sessionId}] 收到请求`)

    // ── 参数校验 ──
    if (!message || typeof message !== 'string' || !message.trim()) {
      console.warn(`[Route] ⚠️  参数校验失败：message 为空或无效`)
      res.status(400).json({ error: '请提供有效的 message 字段' })
      return
    }

    try {
      // ── 调用 Agent ──
      const result = await agent.chat(message.trim(), sessionId)

      console.info(`[Route] ✅ /api/chat [${sessionId}] 返回成功`)
      res.json(result)
    } catch (err) {
      // 统一错误处理：返回 500 并附带错误信息（线上可关闭 detail）
      console.error(`[Route] ❌ /api/chat [${sessionId}] 调用出错：`, err)
      res.status(500).json({
        error: '调用 DeepSeek API 失败',
        detail: (err as Error).message,
      })
    }
  },
)

/**
 * POST /api/chat/stream
 * ────────────────────────────────────────────────────────────
 * 流式对话接口（SSE — Server-Sent Events）。
 *
 * 与 /api/chat 的区别：
 *   - 返回 Content-Type 为 text/event-stream
 *   - 响应体是多个 SSE 事件，直到最后一个事件才 res.end()
 *   - 适合长文本回复，前端可实现打字机效果
 *
 * SSE 事件格式：
 *   event: chunk
 *   data: {"content": "部分文本"}
 *
 *   event: done
 *   data: {"content": "完整文本", "sessionId": "xxx"}
 *
 *   event: error
 *   data: {"error": "错误描述"}
 */
app.post(
  '/api/chat/stream',
  async (req: Request<object, object, ChatRequestBody>, res: Response) => {
    const { message, sessionId = 'default' } = req.body

    console.info(`[Route] POST /api/chat/stream [${sessionId}] 建立 SSE 连接`)

    // ── 参数校验 ──
    if (!message || typeof message !== 'string' || !message.trim()) {
      console.warn(`[Route] ⚠️  参数校验失败：message 为空或无效`)
      res.status(400).json({ error: '请提供有效的 message 字段' })
      return
    }

    // ── 设置 SSE 响应头 ──
    // Content-Type：告知客户端这是 SSE 流，不是普通文本
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    // Cache-Control：禁止缓存，确保浏览器实时接收数据
    res.setHeader('Cache-Control', 'no-cache')
    // Connection：保持连接不断开
    res.setHeader('Connection', 'keep-alive')
    // X-Accel-Buffering：Nginx 反向代理时禁用缓冲（否则会等 SSE 结束后才返回）
    res.setHeader('X-Accel-Buffering', 'no')
    // 立即发送 HTTP 头（SSE 必须先 flush，才能开始发送 body）
    res.flushHeaders()

    console.info(`[Route] 🔗 SSE 头已发送，等待 Agent 处理…`)

    /**
     * SSE 事件发送工具函数
     *
     * event 字段：客户端通过 EventSource.addEventListener(event, handler) 监听
     * data 字段：JSON 序列化后的数据
     * \n\n：SSE 协议规定的消息分隔符
     */
    const sendEvent = (event: string, data: object): void => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }

    try {
      // ── 启动流式对话 ──
      await agent.chatStream(
        message.trim(),
        sessionId,
        // onChunk：每个 token 片段到达时触发，实时推送给客户端
        (chunk) => {
          sendEvent('chunk', { content: chunk })
        },
        // onDone：整个流结束后触发，告知客户端传输完成
        (full) => {
          sendEvent('done', { content: full, sessionId })
          console.info(`[Route] ✅ SSE [${sessionId}] 传输完成`)
          res.end()
        },
      )
    } catch (err) {
      // 出错时发送 error 事件，然后正常结束响应
      console.error(`[Route] ❌ SSE [${sessionId}] 出错：${(err as Error).message}`)
      sendEvent('error', { error: (err as Error).message })
      res.end()
    }
  },
)

/**
 * GET /api/sessions
 * ────────────────────────────────────────────────────────────
 * 获取所有会话列表（用于前端侧边栏展示历史对话）。
 *
 * 返回示例：
 *   [{ "id": "xxx", "title": "红烧肉怎么做", "created_at": 123, "updated_at": 456 }]
 */
app.get('/api/sessions', (_req: Request, res: Response) => {
  console.debug('[Route] GET /api/sessions')
  const sessions = agent.listSessions()
  res.json(sessions)
})

/**
 * GET /api/history/:sessionId
 * ────────────────────────────────────────────────────────────
 * 获取指定会话的对话历史（不含 system prompt）。
 *
 * 用途：
 *   - 前端加载页面时恢复历史会话
 *   - 调试时查看服务端存储的对话内容
 */
app.get(
  '/api/history/:sessionId',
  (req: Request<{ sessionId: string }>, res: Response) => {
    const { sessionId } = req.params

    console.info(`[Route] GET /api/history/${sessionId}`)

    const history = agent.getHistory(sessionId)
    res.json({ sessionId, history })
  },
)

/**
 * DELETE /api/session/:sessionId
 * ────────────────────────────────────────────────────────────
 * 清除指定会话，开启新对话。
 *
 * 用途：
 *   - 用户点击"清空对话"或"新对话"按钮时调用
 *   - 服务端删除该 sessionId 的所有消息历史
 */
app.delete(
  '/api/session/:sessionId',
  (req: Request<{ sessionId: string }>, res: Response) => {
    const { sessionId } = req.params

    console.info(`[Route] DELETE /api/session/${sessionId}`)

    agent.clearSession(sessionId)
    res.json({ success: true, message: `会话 ${sessionId} 已清除` })
  },
)

// ─── 用户画像接口 ──────────────────────────────────────────

/**
 * GET /api/profile
 * 获取用户画像（偏好设置）。
 */
app.get('/api/profile', (_req: Request, res: Response) => {
  console.debug('[Route] GET /api/profile')
  const profile = userProfileRepo.getOrCreate()
  res.json(profile)
})

/**
 * PUT /api/profile
 * 更新用户画像。
 *
 * 请求 Body：
 *   {
 *     "allergies": ["花生", "海鲜"],
 *     "diet_type": "生酮",
 *     "skill_level": "beginner",
 *     "disliked": ["香菜"],
 *     "calorie_goal": 1800
 *   }
 */
app.put('/api/profile', (req: Request, res: Response) => {
  console.info('[Route] PUT /api/profile')
  const { allergies, diet_type, skill_level, disliked, calorie_goal } = req.body

  const profile = userProfileRepo.update('default', {
    allergies,
    diet_type,
    skill_level,
    disliked,
    calorie_goal,
  })

  res.json(profile)
})

// ─── 全局错误处理 ──────────────────────────────────────────

// Express 路由未匹配到时触发（404）
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: '接口不存在' })
})

// 统一错误中间件（Express 会将 thrown Error 传递到这里）
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: express.NextFunction) => {
  console.error('[GlobalError] 未捕获的错误：', err)
  res.status(500).json({ error: '服务器内部错误', detail: err.message })
})

// ─── 服务启动 ──────────────────────────────────────────────

app.listen(PORT, () => {
  console.log('')
  console.log('═══════════════════════════════════════════════')
  console.log(`   🍳 厨神小助 Agent 服务已启动！`)
  console.log(`   🌐 访问地址：http://localhost:${PORT}`)
  console.log('═══════════════════════════════════════════════')
  console.log('📋 可用接口：')
  console.log(`   GET    /health               健康检查`)
  console.log(`   POST   /api/chat             普通对话`)
  console.log(`   POST   /api/chat/stream      流式对话（SSE）`)
  console.log(`   GET    /api/sessions         会话列表`)
  console.log(`   GET    /api/history/:id      获取对话历史`)
  console.log(`   DELETE /api/session/:id      清除会话`)
  console.log(`   GET    /api/profile          获取用户画像`)
  console.log(`   PUT    /api/profile          更新用户画像`)
  console.log('')
  console.info('[Server] 🚀 服务就绪，等待请求…')
})
