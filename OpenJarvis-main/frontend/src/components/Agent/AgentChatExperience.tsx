import { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Bot,
  Send,
  Square,
  Plus,
  Settings,
  History,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Cpu,
  Trash2,
  X,
  Sparkles,
  MessageSquare,
  ChevronDown,
  Terminal,
} from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { streamChat } from '../../lib/sse';
import { fetchAgentStatus, configureAgentConnection, type AgentStatusInfo } from '../../lib/api';
import { toast } from 'sonner';

export interface AgentChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface AgentConversation {
  id: string;
  title: string;
  model: string;
  createdAt: number;
  updatedAt: number;
  messages: AgentChatMessage[];
}

const STORAGE_KEY = 'openjarvis_personal_agent_history';

function loadStoredConversations(): AgentConversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveStoredConversations(convs: AgentConversation[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(convs));
  } catch {}
}

export function AgentChatExperience() {
  const selectedModel = useAppStore((s) => s.selectedModel);
  const setSelectedModel = useAppStore((s) => s.setSelectedModel);
  const models = useAppStore((s) => s.models);

  // Agent connectivity status
  const [agentStatus, setAgentStatus] = useState<AgentStatusInfo | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [ollamaHostInput, setOllamaHostInput] = useState('http://localhost:11434');
  const [savingHost, setSavingHost] = useState(false);

  // Conversation history
  const [conversations, setConversations] = useState<AgentConversation[]>(() => loadStoredConversations());
  const [activeConvId, setActiveConvId] = useState<string>(() => {
    const stored = loadStoredConversations();
    return stored[0]?.id || `agent-${Date.now()}`;
  });

  // Current active conversation
  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync messages when active conversation changes
  useEffect(() => {
    const found = conversations.find((c) => c.id === activeConvId);
    if (found) {
      setMessages(found.messages);
    } else {
      setMessages([]);
    }
  }, [activeConvId, conversations]);

  // Check Ollama and local model status via backend
  const checkStatus = useCallback(async () => {
    setCheckingStatus(true);
    try {
      const status = await fetchAgentStatus();
      setAgentStatus(status);
      setOllamaHostInput(status.host);
      // If no model is selected or selected model is not in local list, default to first local model
      if (status.models.length > 0 && (!selectedModel || !status.models.includes(selectedModel))) {
        setSelectedModel(status.models[0]);
      }
    } catch (err: any) {
      setAgentStatus({
        status: 'disconnected',
        host: ollamaHostInput,
        models: [],
        active_model: null,
        error: err.message || 'Cannot reach local agent backend',
      });
    } finally {
      setCheckingStatus(false);
    }
  }, [selectedModel, setSelectedModel, ollamaHostInput]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // Auto-scroll to bottom of conversation
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  // Start new conversation
  const handleNewConversation = () => {
    if (isStreaming) {
      handleStopStreaming();
    }
    const newId = `agent-${Date.now()}`;
    const newConv: AgentConversation = {
      id: newId,
      title: 'New conversation',
      model: selectedModel || 'qwen2.5:1.5b',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
    };
    const updated = [newConv, ...conversations.filter((c) => c.messages.length > 0)];
    setConversations(updated);
    saveStoredConversations(updated);
    setActiveConvId(newId);
    setMessages([]);
    textareaRef.current?.focus();
  };

  // Delete conversation
  const handleDeleteConversation = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = conversations.filter((c) => c.id !== id);
    setConversations(updated);
    saveStoredConversations(updated);
    if (activeConvId === id) {
      if (updated.length > 0) {
        setActiveConvId(updated[0].id);
      } else {
        handleNewConversation();
      }
    }
  };

  // Stop current streaming reply
  const handleStopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
  };

  // Send message
  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend ?? input).trim();
    if (!text || isStreaming) return;

    const currentModel = selectedModel || agentStatus?.active_model || 'qwen2.5:1.5b';

    // Verify Ollama connectivity
    if (agentStatus?.status === 'disconnected') {
      toast.error('Local Ollama is offline', {
        description: 'Please start Ollama (`ollama serve`) on your laptop to chat with your local agent.',
      });
      return;
    }

    const userMessage: AgentChatMessage = {
      id: `usr-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    const assistantPlaceholder: AgentChatMessage = {
      id: `ast-${Date.now() + 1}`,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };

    const updatedMessages = [...messages, userMessage, assistantPlaceholder];
    setMessages(updatedMessages);
    setInput('');

    // Update conversation title from first user message
    let currentConv = conversations.find((c) => c.id === activeConvId);
    let title = currentConv?.title || 'New conversation';
    if (title === 'New conversation' || !title) {
      title = text.slice(0, 42) + (text.length > 42 ? '...' : '');
    }

    const convToSave: AgentConversation = {
      id: activeConvId,
      title,
      model: currentModel,
      createdAt: currentConv?.createdAt || Date.now(),
      updatedAt: Date.now(),
      messages: updatedMessages,
    };

    const updatedConvs = [
      convToSave,
      ...conversations.filter((c) => c.id !== activeConvId),
    ];
    setConversations(updatedConvs);
    saveStoredConversations(updatedConvs);

    // Prepare streaming call through same-origin backend
    setIsStreaming(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // Build conversation payload for backend /v1/chat/completions
      const chatPayload = {
        model: currentModel,
        messages: [
          {
            role: 'system',
            content:
              'You are Jarvis, a helpful, personal conversational AI assistant running locally on the user\'s laptop. ' +
              'Speak naturally, concisely, and warmly. You respect privacy, operate locally, and assist with any question.',
          },
          ...updatedMessages
            .filter((m) => m.content.trim() !== '')
            .map((m) => ({ role: m.role, content: m.content })),
        ],
        stream: true as const,
      };

      let accumulated = '';
      for await (const chunk of streamChat(chatPayload, controller.signal)) {
        if (!chunk.data || chunk.data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(chunk.data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            accumulated += delta;
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last && last.role === 'assistant') {
                copy[copy.length - 1] = { ...last, content: accumulated };
              }
              return copy;
            });
          }
        } catch {}
      }

      // Persist final assistant reply
      const finalAssistant: AgentChatMessage = {
        ...assistantPlaceholder,
        content: accumulated || 'No response received. Please ensure your local model is loaded in Ollama.',
      };
      const finalMessages = [...messages, userMessage, finalAssistant];
      setMessages(finalMessages);

      const finalConv: AgentConversation = {
        ...convToSave,
        updatedAt: Date.now(),
        messages: finalMessages,
      };
      const finalConvs = [finalConv, ...conversations.filter((c) => c.id !== activeConvId)];
      setConversations(finalConvs);
      saveStoredConversations(finalConvs);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // User manually cancelled
      } else {
        const errMsg = err.message || 'Error communicating with local agent backend';
        toast.error('Local Agent Error', { description: errMsg });
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last && last.role === 'assistant') {
            copy[copy.length - 1] = {
              ...last,
              content: `⚠️ Error: ${errMsg}\n\nPlease verify that Ollama is running and model '${currentModel}' is installed.`,
            };
          }
          return copy;
        });
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  // Configure Ollama host
  const handleSaveHost = async () => {
    setSavingHost(true);
    try {
      await configureAgentConnection(ollamaHostInput);
      toast.success('Ollama host updated');
      await checkStatus();
    } catch (err: any) {
      toast.error('Failed to update host', { description: err.message });
    } finally {
      setSavingHost(false);
    }
  };

  const localModelOptions = agentStatus?.models && agentStatus.models.length > 0
    ? agentStatus.models
    : models.filter((m) => !m.id.startsWith('gpt-') && !m.id.startsWith('gemini-') && !m.id.startsWith('deepseek-')).map((m) => m.id);

  const activeLocalModel = selectedModel || agentStatus?.active_model || (localModelOptions[0] || 'qwen2.5:1.5b');

  return (
    <div className="flex flex-col h-full bg-[var(--color-bg)] text-[var(--color-text)] overflow-hidden relative">
      {/* ── Top Header ────────────────────────────────────────────── */}
      <header
        className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] shrink-0"
        style={{ background: 'var(--color-sidebar)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center relative shadow-sm"
            style={{
              background: 'linear-gradient(135deg, var(--color-accent), var(--color-accent-purple, #8b5cf6))',
              color: '#ffffff',
            }}
          >
            <Bot size={20} />
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[var(--color-bg)] ${
                agentStatus?.status === 'connected' ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold tracking-tight">Jarvis Conversational AI Agent</h1>
              <span
                className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded tracking-wider"
                style={{
                  background: 'var(--color-success)20',
                  color: 'var(--color-success)',
                  border: '1px solid var(--color-success)40',
                }}
              >
                100% Local
              </span>
            </div>
            <p className="text-xs text-[var(--color-text-secondary)]">
              Personal assistant running privately on your laptop via Ollama
            </p>
          </div>
        </div>

        {/* Header Controls */}
        <div className="flex items-center gap-2">
          {/* Local Model Selector Dropdown */}
          <div className="relative">
            <select
              value={activeLocalModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="appearance-none text-xs font-medium pl-2.5 pr-7 py-1.5 rounded-lg cursor-pointer transition-colors"
              style={{
                background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
              }}
            >
              {localModelOptions.length > 0 ? (
                localModelOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))
              ) : (
                <option value="qwen2.5:1.5b">qwen2.5:1.5b (local)</option>
              )}
            </select>
            <ChevronDown
              size={13}
              className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-50"
            />
          </div>

          {/* New Chat Button */}
          <button
            onClick={handleNewConversation}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors"
            style={{
              background: 'var(--color-accent)',
              color: 'var(--color-on-accent)',
            }}
            title="Start a new conversation thread"
          >
            <Plus size={14} />
            <span className="hidden sm:inline">New Chat</span>
          </button>

          {/* History Toggle */}
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="p-1.5 rounded-lg text-xs cursor-pointer transition-colors"
            style={{
              background: showHistory ? 'var(--color-bg-tertiary)' : 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-secondary)',
            }}
            title="View Conversation History"
          >
            <History size={16} />
          </button>

          {/* Settings Toggle */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-1.5 rounded-lg text-xs cursor-pointer transition-colors"
            style={{
              background: showSettings ? 'var(--color-bg-tertiary)' : 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-secondary)',
            }}
            title="Agent & Ollama Settings"
          >
            <Settings size={16} />
          </button>
        </div>
      </header>

      {/* ── Status Banner (if disconnected) ───────────────────────── */}
      {agentStatus?.status === 'disconnected' && (
        <div
          className="px-4 py-2.5 flex items-center justify-between text-xs border-b border-[var(--color-border)] animate-fade-in"
          style={{ background: 'var(--color-accent-amber-subtle, #fef3c720)', color: 'var(--color-warning, #d97706)' }}
        >
          <div className="flex items-center gap-2">
            <AlertCircle size={15} className="shrink-0" />
            <span>
              <strong>Ollama is offline:</strong> {agentStatus.error || 'Cannot connect to local Ollama service.'}{' '}
              Start it with <code className="font-mono bg-[var(--color-bg)] px-1 py-0.5 rounded">ollama serve</code>.
            </span>
          </div>
          <button
            onClick={checkStatus}
            disabled={checkingStatus}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-[var(--color-bg)] font-medium border border-[var(--color-border)] cursor-pointer hover:bg-[var(--color-bg-tertiary)]"
          >
            <RefreshCw size={12} className={checkingStatus ? 'animate-spin' : ''} />
            Retry
          </button>
        </div>
      )}

      {/* ── Main Chat Area ────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat Thread */}
        <div className="flex-1 flex flex-col h-full min-w-0">
          <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto py-12 px-4">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 shadow-sm"
                  style={{
                    background: 'linear-gradient(135deg, var(--color-accent), var(--color-accent-purple, #8b5cf6))',
                    color: '#ffffff',
                  }}
                >
                  <Sparkles size={32} />
                </div>
                <h2 className="text-lg font-semibold mb-1">How can I help you today?</h2>
                <p className="text-xs text-[var(--color-text-secondary)] mb-6">
                  I am your conversational AI agent running locally on <strong>{activeLocalModel}</strong>.
                  All responses are generated directly on your laptop with zero data leaving your machine.
                </p>

                {/* Quick Prompts */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full text-left">
                  {[
                    'Explain how local AI models work privately',
                    'Write a clean Python script to parse JSON logs',
                    'Give me tips to boost my daily productivity',
                    'Summarize the core benefits of running Ollama',
                  ].map((promptText) => (
                    <button
                      key={promptText}
                      onClick={() => handleSendMessage(promptText)}
                      className="p-3 rounded-xl text-xs transition-colors text-left flex items-start gap-2 cursor-pointer"
                      style={{
                        background: 'var(--color-bg-secondary)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text)',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-tertiary)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--color-bg-secondary)')}
                    >
                      <MessageSquare size={14} className="shrink-0 mt-0.5 text-[var(--color-accent)]" />
                      <span>{promptText}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 max-w-3xl mx-auto ${
                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {msg.role === 'assistant' && (
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-1 shadow-xs"
                      style={{
                        background: 'linear-gradient(135deg, var(--color-accent), #8b5cf6)',
                        color: '#ffffff',
                      }}
                    >
                      <Bot size={16} />
                    </div>
                  )}

                  <div
                    className={`rounded-2xl px-4 py-3 text-sm leading-relaxed max-w-[85%] ${
                      msg.role === 'user'
                        ? 'rounded-tr-xs bg-[var(--color-accent)] text-[var(--color-on-accent)] font-normal'
                        : 'rounded-tl-xs bg-[var(--color-bg-secondary)] text-[var(--color-text)] border border-[var(--color-border)] shadow-xs'
                    }`}
                  >
                    {msg.role === 'assistant' ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content || '...'}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* ── Input Bar ─────────────────────────────────────────── */}
          <div className="p-4 border-t border-[var(--color-border)] bg-[var(--color-sidebar)]">
            <div className="max-w-3xl mx-auto relative flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder={`Ask your local agent anything (${activeLocalModel})...`}
                rows={1}
                disabled={isStreaming}
                className="flex-1 max-h-32 min-h-[44px] resize-none rounded-xl px-4 py-3 text-sm outline-none transition-all placeholder:text-[var(--color-text-tertiary)] disabled:opacity-50"
                style={{
                  background: 'var(--color-bg-secondary)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text)',
                }}
              />

              {isStreaming ? (
                <button
                  onClick={handleStopStreaming}
                  className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 cursor-pointer shadow-sm transition-transform active:scale-95"
                  style={{
                    background: 'var(--color-error, #ef4444)',
                    color: '#ffffff',
                  }}
                  title="Stop generation"
                >
                  <Square size={16} fill="currentColor" />
                </button>
              ) : (
                <button
                  onClick={() => handleSendMessage()}
                  disabled={!input.trim()}
                  className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 cursor-pointer shadow-sm transition-transform active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    background: 'var(--color-accent)',
                    color: 'var(--color-on-accent)',
                  }}
                  title="Send message"
                >
                  <Send size={16} />
                </button>
              )}
            </div>

            <div className="max-w-3xl mx-auto flex items-center justify-between text-[11px] text-[var(--color-text-tertiary)] mt-2 px-1">
              <span className="flex items-center gap-1.5">
                <Cpu size={12} />
                Local Engine: <strong>{activeLocalModel}</strong>
              </span>
              <span>Requests route locally through backend • Zero cloud data leakage</span>
            </div>
          </div>
        </div>

        {/* ── History Panel (Drawer) ──────────────────────────────── */}
        {showHistory && (
          <aside
            className="w-72 border-l border-[var(--color-border)] flex flex-col bg-[var(--color-sidebar)] shrink-0 transition-all"
          >
            <div className="p-3 border-b border-[var(--color-border)] flex items-center justify-between">
              <span className="text-xs font-semibold flex items-center gap-1.5">
                <History size={14} /> Agent Conversations
              </span>
              <button
                onClick={() => setShowHistory(false)}
                className="p-1 rounded hover:bg-[var(--color-bg-tertiary)] cursor-pointer text-[var(--color-text-secondary)]"
              >
                <X size={14} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {conversations.length === 0 ? (
                <div className="text-xs text-center py-8 text-[var(--color-text-tertiary)]">
                  No previous conversations
                </div>
              ) : (
                conversations.map((conv) => (
                  <div
                    key={conv.id}
                    onClick={() => {
                      setActiveConvId(conv.id);
                      if (window.innerWidth < 768) setShowHistory(false);
                    }}
                    className={`p-2.5 rounded-lg text-xs cursor-pointer flex items-center justify-between group transition-colors ${
                      conv.id === activeConvId
                        ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)] font-medium'
                        : 'hover:bg-[var(--color-bg-secondary)] text-[var(--color-text)]'
                    }`}
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <p className="truncate">{conv.title}</p>
                      <span className="text-[10px] opacity-60">
                        {new Date(conv.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                    <button
                      onClick={(e) => handleDeleteConversation(conv.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-black/10 transition-opacity"
                      title="Delete thread"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </aside>
        )}

        {/* ── Settings Panel (Drawer) ─────────────────────────────── */}
        {showSettings && (
          <aside className="w-80 border-l border-[var(--color-border)] flex flex-col bg-[var(--color-sidebar)] shrink-0 p-4 space-y-5 overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--color-border)]">
              <span className="text-xs font-semibold flex items-center gap-1.5">
                <Settings size={14} /> Local Agent Settings
              </span>
              <button
                onClick={() => setShowSettings(false)}
                className="p-1 rounded hover:bg-[var(--color-bg-tertiary)] cursor-pointer text-[var(--color-text-secondary)]"
              >
                <X size={14} />
              </button>
            </div>

            {/* Connection Status */}
            <div className="p-3 rounded-xl bg-[var(--color-bg-secondary)] border border-[var(--color-border)] space-y-2">
              <div className="flex items-center justify-between text-xs font-medium">
                <span>Ollama Connectivity</span>
                <span
                  className={`flex items-center gap-1 font-semibold ${
                    agentStatus?.status === 'connected' ? 'text-emerald-500' : 'text-amber-500'
                  }`}
                >
                  {agentStatus?.status === 'connected' ? (
                    <>
                      <CheckCircle2 size={13} /> Reachable
                    </>
                  ) : (
                    <>
                      <AlertCircle size={13} /> Offline
                    </>
                  )}
                </span>
              </div>
              <p className="text-[11px] text-[var(--color-text-secondary)] leading-relaxed">
                OpenJarvis connects securely to your local Ollama instance on your machine.
              </p>
            </div>

            {/* Ollama Host */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--color-text-secondary)]">
                Local Ollama Service URL
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={ollamaHostInput}
                  onChange={(e) => setOllamaHostInput(e.target.value)}
                  placeholder="http://127.0.0.1:11434"
                  className="flex-1 px-3 py-1.5 text-xs rounded-lg font-mono outline-none border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)]"
                />
                <button
                  onClick={handleSaveHost}
                  disabled={savingHost}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--color-accent)] text-[var(--color-on-accent)] cursor-pointer disabled:opacity-50"
                >
                  {savingHost ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>

            {/* Local Models */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-[var(--color-text-secondary)]">
                Installed Local Models
              </label>
              {localModelOptions.length > 0 ? (
                <div className="space-y-1.5">
                  {localModelOptions.map((m) => (
                    <div
                      key={m}
                      onClick={() => {
                        setSelectedModel(m);
                        toast.success(`Selected local model: ${m}`);
                      }}
                      className={`p-2.5 rounded-lg text-xs flex items-center justify-between border cursor-pointer transition-all ${
                        m === activeLocalModel
                          ? 'border-[var(--color-accent)] bg-[var(--color-accent)]10 font-medium'
                          : 'border-[var(--color-border)] bg-[var(--color-bg-secondary)] hover:bg-[var(--color-bg-tertiary)]'
                      }`}
                    >
                      <span className="font-mono">{m}</span>
                      {m === activeLocalModel && (
                        <span className="text-[10px] text-[var(--color-accent)] font-semibold">Active</span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-3 rounded-lg border border-[var(--color-border)] text-xs text-[var(--color-text-tertiary)]">
                  No local models found in Ollama.
                </div>
              )}
            </div>

            {/* Offline Privacy Guarantee */}
            <div className="p-3 rounded-xl bg-[var(--color-bg-secondary)] border border-[var(--color-border)] space-y-1.5 text-[11px] text-[var(--color-text-secondary)]">
              <span className="font-semibold text-[var(--color-text)] flex items-center gap-1.5">
                <Terminal size={13} /> Zero Cloud Guarantee
              </span>
              <p>
                All prompts and streaming generations stay 100% on your laptop. No cloud API keys or billable requests are triggered.
              </p>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

