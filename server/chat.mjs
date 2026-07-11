/**
 * Chat API handler — streams AI responses with tool calling support.
 * Uses @ai-sdk/openai-compatible for the model and streams via the AI SDK data protocol.
 *
 * Supports both OpenAI and DeepSeek (OpenAI-compatible).
 *
 * Environment variables:
 *   OPENAI_API_KEY    – OpenAI API key
 *   DEEPSEEK_API_KEY  – DeepSeek API key (auto-configures base URL & model)
 *   OPENAI_BASE_URL   – override the default base URL
 *   CHAT_MODEL        – override the default model name
 *
 * Defaults when DEEPSEEK_API_KEY is set:
 *   base URL: https://api.deepseek.com/v1
 *   model:    deepseek-chat
 *
 * Defaults when only OPENAI_API_KEY is set:
 *   base URL: https://api.openai.com/v1
 *   model:    gpt-4o-mini
 */

import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { streamText, convertToModelMessages } from 'ai'
import { buildSystemPrompt, buildToolDefinitions } from './chat-tools.mjs'

/** Build an OpenAI-compatible provider instance.
 *  Reads env vars lazily so .env files loaded by Vite's loadEnv are available. */
function getOpenAI() {
  const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY

  const apiKey = DEEPSEEK_API_KEY || OPENAI_API_KEY
  if (!apiKey) {
    throw new Error(
      'Neither DEEPSEEK_API_KEY nor OPENAI_API_KEY is set. ' +
      'Set one of them in your .env file or environment.',
    )
  }

  const isDeepSeek = Boolean(DEEPSEEK_API_KEY)
  const baseURL = process.env.OPENAI_BASE_URL ||
    (isDeepSeek ? 'https://api.deepseek.com/v1' : 'https://api.openai.com/v1')
  const modelName = process.env.CHAT_MODEL ||
    (isDeepSeek ? 'deepseek-chat' : 'gpt-4o-mini')

  // Wrap fetch to log request body AND raw response stream for debugging tool calls
  const originalFetch = globalThis.fetch
  const debugFetch = async (url, init) => {
    const urlStr = typeof url === 'string' ? url : url?.href ?? String(url)
    if (urlStr.includes('/chat/completions') && init?.body) {
      try {
        const body = JSON.parse(init.body)
        console.log('[chat] >>> POST to', urlStr)
        console.log('[chat] >>> model:', body.model)
        console.log('[chat] >>> tools:', body.tools ? body.tools.map(t => t.function?.name || '?') : 'NONE')
        console.log('[chat] >>> tool_choice:', body.tool_choice)
        console.log('[chat] >>> messages count:', body.messages?.length)
      } catch { /* ignore parse errors */ }
    }
    const response = await originalFetch(url, init)
    // Clone response to read body for debug without consuming it
    if (urlStr.includes('/chat/completions') && response.ok) {
      const clone = response.clone()
      const reader = clone.body?.getReader()
      if (reader) {
        // Read stream asynchronously in the background, log raw tool_calls chunks
        const decoder = new TextDecoder()
        let buffer = ''
        ;(async () => {
          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              buffer += decoder.decode(value, { stream: true })
              // Log lines that mention tool_calls
              const lines = buffer.split('\n')
              buffer = lines.pop() ?? ''
              for (const line of lines) {
                if (line.startsWith('data: ') && line.includes('tool_calls')) {
                  console.log('[chat] <<< RAW tool_calls chunk:', line.slice(6, 500))
                }
              }
            }
          } catch { /* ignore */ }
        })()
      }
    }
    return response
  }

  return {
    provider: createOpenAICompatible({
      name: isDeepSeek ? 'deepseek' : 'openai',
      apiKey,
      baseURL,
      fetch: debugFetch,
    }),
    model: modelName,
  }
}

/**
 * Tool definitions & system prompt — auto-generated from the presets catalog
 * and tile catalog. Edit server/presets-catalog.mjs or server/chat-tools.mjs
 * to add/remove presets or tiles.
 */
const TOOLS = buildToolDefinitions()
const SYSTEM_PROMPT = buildSystemPrompt()

/**
 * Read and parse the JSON request body from a Node.js readable stream.
 */
async function readBody(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf-8'))
}

/**
 * Main chat handler — called from the Vite plugin middleware.
 */
export async function handleChat(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }

  try {
    const body = await readBody(req)
    const { messages } = body

    if (!messages || !Array.isArray(messages)) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Missing messages array' }))
      return
    }

    const { provider, model } = getOpenAI()

    // The v4 client sends UIMessage[] (with `parts`),
    // but streamText expects ModelMessage[] (with `content`).
    const modelMessages = await convertToModelMessages(messages)

    console.log('[chat] request — modelMessages count:', modelMessages.length, 'tool count:', Object.keys(TOOLS).length)

    const result = streamText({
      model: provider(model),
      system: SYSTEM_PROMPT,
      messages: modelMessages,
      tools: TOOLS,
      // No maxSteps — tools are executed on the client side via onToolCall.
      // pipeUIMessageStreamToResponse streams tool-call parts to the client,
      // then the client sends a new POST with tool results for continued generation.
      temperature: 0.7,
      onStepFinish({ text, toolCalls, toolResults, finishReason, usage }) {
        console.log('[chat] step finish — finishReason:', finishReason)
        console.log('[chat] step finish — text preview:', text?.slice(0, 200))
        console.log('[chat] step finish — toolCalls count:', toolCalls?.length ?? 0)
        if (toolCalls?.length > 0) {
          for (const tc of toolCalls) {
            console.log('[chat] step finish — toolCall:', tc.toolName, 'input:', JSON.stringify(tc.input))
          }
        }
        if (usage) console.log('[chat] step finish — usage:', JSON.stringify(usage))
      },
      onFinish({ text, steps, finishReason, usage }) {
        console.log('[chat] finish — finishReason:', finishReason)
        console.log('[chat] finish — total steps:', steps?.length)
        console.log('[chat] finish — full text:', text)
      },
    })

    // DEBUG: intercept what pipeUIMessageStreamToResponse sends
    const origWrite = res.write.bind(res)
    const decoder = new TextDecoder()
    let streamChunks = 0
    res.write = (chunk, encoding, cb) => {
      // Properly decode: handle string, Buffer, and Uint8Array
      let str
      if (typeof chunk === 'string') {
        str = chunk
      } else if (chunk != null) {
        str = decoder.decode(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk), { stream: true })
      } else {
        str = ''
      }
      streamChunks++
      if (str.startsWith('data:') && str.length > 6) {
        const content = str.slice(5).trim()
        if (content && content !== '[DONE]') {
          // Only log tool-related messages concisely
          if (content.includes('tool-input') || content.includes('tool-call') || content.includes('tool-result')) {
            console.log('[chat] <<< SSE', streamChunks, ':', content.slice(0, 300))
          }
        }
      }
      return origWrite(chunk, encoding, cb)
    }

    // Pipe UI message stream, surfacing real errors instead of generic "An error occurred."
    result.pipeUIMessageStreamToResponse(res, {
      onError(err) {
        const message = err instanceof Error
          ? (err.message || `${err.constructor.name}: status ${err.statusCode ?? 'N/A'}`)
          : String(err)
        console.error('[chat] stream error:', err)
        return `Error: ${message}`
      },
    })
  } catch (err) {
    console.error('[chat] handler error:', err)
    const message = err instanceof Error ? err.message : String(err)
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: message }))
    }
  }
}
