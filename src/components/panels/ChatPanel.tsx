import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from 'ai'
import { useUiStore } from '@/stores/ui-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { X, Send, MessageCircle, Wrench } from 'lucide-react'
import { TOOL_EXECUTORS } from '@/lib/map-tools'

export function ChatPanel() {
  const { t } = useTranslation()
  const chatOpen = useUiStore((s) => s.chatOpen)
  const setChatOpen = useUiStore((s) => s.setChatOpen)

  const {
    messages,
    sendMessage,
    status,
    error,
    addToolOutput,
  } = useChat({
    transport: new DefaultChatTransport({ api: '/api/chat' }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onError(err) {
      console.error('[ChatPanel] onError:', err)
    },
    async onToolCall({ toolCall }) {
      const rawInput = toolCall.input
      console.log('[ChatPanel] onToolCall:', toolCall.toolName, 'rawInput:', JSON.stringify(rawInput))
      const exec = TOOL_EXECUTORS[toolCall.toolName]
      if (!exec) {
        console.warn('[ChatPanel] unknown tool:', toolCall.toolName)
        addToolOutput({
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          state: 'output-error',
          errorText: `Unknown tool: ${toolCall.toolName}`,
        })
        return
      }

      try {
        // toolCall.input may be a parsed object or a JSON string depending on the transport version
        const input: Record<string, unknown> = typeof rawInput === 'string'
          ? JSON.parse(rawInput)
          : ((rawInput ?? {}) as Record<string, unknown>)
        const result = exec(input)
        console.log('[ChatPanel] tool result:', toolCall.toolName, result)
        addToolOutput({
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          output: result,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[ChatPanel] tool error:', toolCall.toolName, message)
        addToolOutput({
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          state: 'output-error',
          errorText: message,
        })
      }
    },
  })

  const [input, setInput] = useState('')
  const isLoading = status === 'submitted' || status === 'streaming'
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  // Focus input when panel opens
  useEffect(() => {
    if (chatOpen) {
      setTimeout(() => inputRef.current?.focus(), 150)
    }
  }, [chatOpen])

  const handleSend = () => {
    const text = input.trim()
    if (!text || isLoading) return
    sendMessage({ text })
    setInput('')
  }

  const handleClose = () => {
    setChatOpen(false)
  }

  const getMessageText = (msg: (typeof messages)[number]): string => {
    if (!msg.parts) return ''
    for (const part of msg.parts) {
      if (part.type === 'text') return part.text
    }
    return ''
  }

  return (
    <>
      {/* Backdrop */}
      {chatOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 backdrop-blur-sm transition-opacity"
          onClick={handleClose}
        />
      )}

      {/* Drawer */}
      <div
        className={
          'fixed bottom-0 left-0 right-0 z-40 flex flex-col transition-transform duration-300 ease-out ' +
          (chatOpen ? 'translate-y-0' : 'translate-y-full')
        }
        style={{ height: '460px' }}
      >
        <div className="flex flex-col h-full mx-auto w-full max-w-2xl rounded-t-3xl border border-b-0 border-zinc-700/60 bg-zinc-900/95 shadow-2xl shadow-black/40 backdrop-blur-xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between shrink-0 px-5 py-3 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-7 h-7 rounded-full bg-emerald-500/20">
                <MessageCircle className="w-4 h-4 text-emerald-400" />
              </div>
              <span className="text-sm font-medium text-zinc-200">
                {t('chat.title', 'Assistant')}
              </span>
              {isLoading && (
                <span className="flex gap-1 ml-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="w-7 h-7 text-zinc-500 hover:text-zinc-300"
              onClick={handleClose}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Error banner */}
          {error && (
            <div className="shrink-0 px-5 py-2 bg-red-950/30 border-b border-red-900/30 text-xs text-red-400">
              {error.message || String(error)}
            </div>
          )}

          {/* Messages */}
          <ScrollArea className="flex-1 min-h-0">
            <div ref={scrollRef} className="px-5 py-4 space-y-4">
              {messages.length <= 1 && (
                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                  <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-zinc-800/50 mb-4">
                    <MessageCircle className="w-7 h-7 text-zinc-600" />
                  </div>
                  <p className="text-sm text-zinc-500">
                    {t('chat.empty', 'Ask me anything about your map.')}
                  </p>
                </div>
              )}

              {messages.map((msg) => {
                const text = getMessageText(msg)
                const isUser = msg.role === 'user'
                if (!isUser && msg.role !== 'assistant') return null
                if (!isUser && !text && !msg.parts?.some((p) => p.type === 'dynamic-tool')) return null

                return (
                  <div key={msg.id}>
                    {/* User message */}
                    {isUser && text && (
                      <div className="flex justify-end">
                        <div className="max-w-[80%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm leading-relaxed bg-emerald-600/80 text-white">
                          {text}
                        </div>
                      </div>
                    )}

                    {/* Assistant text */}
                    {!isUser && text && (
                      <div className="flex justify-start">
                        <div className="max-w-[80%] rounded-2xl rounded-bl-md px-4 py-2.5 text-sm leading-relaxed bg-zinc-800/80 text-zinc-200 whitespace-pre-wrap">
                          {text}
                        </div>
                      </div>
                    )}

                    {/* Tool invocations */}
                    {msg.parts
                      ?.filter((p) => p.type === 'dynamic-tool')
                      .map((part) => {
                        const ti = part as { toolCallId: string; toolName: string; state: string; result?: unknown; input?: unknown }
                        return (
                        <div key={ti.toolCallId} className="flex justify-start">
                          <div className="max-w-[85%] rounded-xl px-3 py-2 text-xs bg-zinc-800/40 border border-zinc-700/30 text-zinc-400">
                            <div className="flex items-center gap-1.5 mb-1">
                              <Wrench className="w-3 h-3 text-amber-500/70" />
                              <span className="font-medium text-zinc-500">{ti.toolName}</span>
                              {ti.state === 'result' && (
                                <span className="text-emerald-500/70 ml-auto">✓</span>
                              )}
                              {ti.state === 'call' && (
                                <span className="text-amber-500/70 ml-auto animate-pulse">···</span>
                              )}
                            </div>
                            {ti.state === 'result' && ti.result !== undefined && (
                              <div className="text-zinc-500 font-mono truncate">
                                {(() => {
                                  if (typeof ti.result === 'string') {
                                    try {
                                      const r = JSON.parse(ti.result)
                                      return r.message || String(ti.result)
                                    } catch {
                                      return ti.result
                                    }
                                  }
                                  return 'Done'
                                })()}
                              </div>
                            )}
                          </div>
                        </div>
                      )})}
                  </div>
                )
              })}
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="shrink-0 px-4 py-3 border-t border-zinc-800">
            <form onSubmit={(e) => { e.preventDefault(); handleSend() }} className="flex items-center gap-2">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t('chat.inputPlaceholder', 'Type a message…')}
                disabled={isLoading}
                className="flex-1 h-9 rounded-xl border-zinc-700 bg-zinc-800/50 text-sm text-zinc-200 placeholder:text-zinc-500 focus-visible:ring-emerald-500/30"
              />
              <Button
                variant="default"
                size="icon"
                type="submit"
                className="w-9 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shrink-0"
                disabled={!input.trim() || isLoading}
              >
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </div>
        </div>
      </div>
    </>
  )
}
