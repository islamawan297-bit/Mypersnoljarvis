import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Square,
  RotateCcw,
  Trash2,
  Settings,
  Sparkles,
  Bot,
  User,
  AlertCircle,
  HelpCircle,
  Radio,
  Cpu,
} from 'lucide-react';
import { useVoiceAssistant, VoiceStatus } from '../hooks/useVoiceAssistant';
import { AudioWaveform } from '../components/Voice/AudioWaveform';
import { VoiceSettingsModal } from '../components/Voice/VoiceSettingsModal';

export function VoiceAssistantPage() {
  const {
    status,
    messages,
    interimText,
    currentAssistantText,
    error,
    isMuted,
    availableVoices,
    sttBackendAvailable,
    analyser,
    settings,
    updateSettings,
    selectedModel,
    toggleListening,
    stopSpeaking,
    repeatLastResponse,
    clearSession,
    toggleMute,
    isListening,
    isThinking,
    isSpeaking,
  } = useVoiceAssistant();

  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll transcript container as speech streams
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, interimText, currentAssistantText]);

  // Status badge config
  const getStatusBadge = (s: VoiceStatus) => {
    switch (s) {
      case 'listening':
        return {
          text: 'Listening...',
          color: '#00f2fe',
          bg: 'rgba(0, 242, 254, 0.15)',
          border: 'rgba(0, 242, 254, 0.4)',
          pulse: true,
        };
      case 'transcribing':
        return {
          text: 'Transcribing speech...',
          color: '#38bdf8',
          bg: 'rgba(56, 189, 248, 0.15)',
          border: 'rgba(56, 189, 248, 0.4)',
          pulse: true,
        };
      case 'thinking':
        return {
          text: 'Thinking...',
          color: '#c084fc',
          bg: 'rgba(192, 132, 252, 0.15)',
          border: 'rgba(192, 132, 252, 0.4)',
          pulse: true,
        };
      case 'speaking':
        return {
          text: 'Speaking response...',
          color: '#34d399',
          bg: 'rgba(52, 211, 153, 0.15)',
          border: 'rgba(52, 211, 153, 0.4)',
          pulse: true,
        };
      case 'error':
        return {
          text: 'Attention Required',
          color: '#f87171',
          bg: 'rgba(248, 113, 113, 0.15)',
          border: 'rgba(248, 113, 113, 0.4)',
          pulse: false,
        };
      default:
        return {
          text: 'Idle • Click Mic to Talk',
          color: 'var(--color-text-secondary)',
          bg: 'var(--color-bg-tertiary)',
          border: 'var(--color-border)',
          pulse: false,
        };
    }
  };

  const badge = getStatusBadge(status);

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{
        background: 'var(--color-bg-primary)',
        color: 'var(--color-text-primary)',
      }}
    >
      {/* Top Header Bar */}
      <header
        className="flex items-center justify-between px-6 py-3.5 border-b backdrop-blur-md"
        style={{
          borderColor: 'var(--color-border)',
          background: 'var(--color-bg-secondary)',
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center font-bold shadow-lg"
            style={{
              background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)',
              color: '#000',
            }}
          >
            <Radio size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight">Jarvis Voice Assistant</h1>
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider"
                style={{
                  background: 'rgba(0, 242, 254, 0.12)',
                  color: 'var(--color-accent)',
                  border: '1px solid rgba(0, 242, 254, 0.25)',
                }}
              >
                Local Voice AI
              </span>
            </div>
            <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              Real-time voice interaction with your local model
            </p>
          </div>
        </div>

        {/* Right side status badges & Settings trigger */}
        <div className="flex items-center gap-2.5">
          {/* Active Model Pill */}
          <div
            className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border"
            style={{
              borderColor: 'var(--color-border)',
              background: 'var(--color-bg-tertiary)',
              color: 'var(--color-text-secondary)',
            }}
          >
            <Cpu size={12} className="text-cyan-400" />
            <span className="font-mono text-[11px]">{selectedModel}</span>
          </div>

          {/* Language Pill */}
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border font-medium"
            style={{
              borderColor: 'var(--color-border)',
              background: 'var(--color-bg-tertiary)',
              color: 'var(--color-text-secondary)',
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            <span>
              {settings.voiceLanguage === 'ur'
                ? 'Urdu (اردو)'
                : settings.voiceLanguage === 'en'
                ? 'English'
                : 'Auto Language'}
            </span>
          </div>

          {/* Settings Button */}
          <button
            onClick={() => setSettingsModalOpen(true)}
            className="p-2 rounded-xl border hover:bg-white/5 transition-colors flex items-center gap-1.5 text-xs cursor-pointer"
            style={{
              borderColor: 'var(--color-border)',
              background: 'var(--color-bg-tertiary)',
              color: 'var(--color-text-primary)',
            }}
            title="Voice Assistant Settings"
          >
            <Settings size={15} />
            <span className="hidden sm:inline">Voice Settings</span>
          </button>
        </div>
      </header>

      {/* Main Voice Body */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left / Center Visualizer & Mic Orb Area */}
        <div className="flex-1 flex flex-col items-center justify-between p-6 md:p-8 overflow-y-auto">
          {/* Top Status Pill */}
          <div className="w-full flex justify-center pt-2">
            <div
              className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium border shadow-sm transition-all duration-300 ${
                badge.pulse ? 'animate-pulse' : ''
              }`}
              style={{
                background: badge.bg,
                color: badge.color,
                borderColor: badge.border,
              }}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: badge.color }}
              />
              <span>{badge.text}</span>
            </div>
          </div>

          {/* Central Animated Futuristic Microphone Orb */}
          <div className="my-auto py-8 flex flex-col items-center justify-center relative">
            {/* Outer pulsating futuristic aura rings */}
            {isListening && (
              <>
                <div className="absolute w-56 h-56 rounded-full bg-cyan-500/15 animate-ping duration-1000 pointer-events-none" />
                <div className="absolute w-48 h-48 rounded-full border border-cyan-400/40 animate-pulse pointer-events-none" />
              </>
            )}

            {isSpeaking && (
              <>
                <div className="absolute w-56 h-56 rounded-full bg-emerald-500/15 animate-pulse duration-700 pointer-events-none" />
                <div className="absolute w-48 h-48 rounded-full border border-emerald-400/40 animate-spin duration-3000 pointer-events-none" />
              </>
            )}

            {isThinking && (
              <>
                <div className="absolute w-52 h-52 rounded-full bg-purple-500/15 animate-pulse pointer-events-none" />
                <div className="absolute w-44 h-44 rounded-full border border-purple-400/40 animate-spin pointer-events-none" />
              </>
            )}

            {/* Main Interactive Button */}
            <button
              onClick={toggleListening}
              className={`relative z-10 w-32 h-32 md:w-36 md:h-36 rounded-full flex flex-col items-center justify-center shadow-2xl transition-all duration-300 transform active:scale-95 cursor-pointer ${
                isListening
                  ? 'bg-gradient-to-tr from-cyan-500 via-blue-500 to-cyan-300 text-black shadow-cyan-500/50 scale-105'
                  : isSpeaking
                  ? 'bg-gradient-to-tr from-emerald-500 via-teal-500 to-green-400 text-black shadow-emerald-500/50'
                  : isThinking
                  ? 'bg-gradient-to-tr from-purple-600 via-indigo-500 to-pink-500 text-white shadow-purple-500/50'
                  : 'bg-gradient-to-tr from-slate-800 to-slate-900 text-cyan-400 border border-cyan-500/30 hover:border-cyan-400/80 hover:shadow-cyan-500/20'
              }`}
              title={
                isListening
                  ? 'Click to stop listening'
                  : isSpeaking
                  ? 'Click to interrupt'
                  : 'Click to speak'
              }
            >
              {isSpeaking ? (
                <>
                  <Square size={38} className="animate-pulse" />
                  <span className="text-[11px] font-bold mt-1 tracking-wider uppercase">
                    Stop AI
                  </span>
                </>
              ) : isThinking ? (
                <>
                  <Sparkles size={38} className="animate-spin" />
                  <span className="text-[11px] font-bold mt-1 tracking-wider uppercase">
                    Thinking
                  </span>
                </>
              ) : isListening ? (
                <>
                  <Mic size={40} className="animate-bounce" />
                  <span className="text-[11px] font-bold mt-1 tracking-wider uppercase">
                    Listening
                  </span>
                </>
              ) : (
                <>
                  <Mic size={40} />
                  <span className="text-[11px] font-medium mt-1 tracking-wider uppercase text-cyan-300">
                    Tap to Speak
                  </span>
                </>
              )}
            </button>

            {/* Live Frequency Waveform Display */}
            <div className="w-full max-w-md mt-6">
              <AudioWaveform analyser={analyser} state={status} />
            </div>

            {/* Live Interim Transcript Bubble */}
            {interimText && (
              <div
                className="mt-4 px-4 py-2 rounded-xl text-xs max-w-md text-center border animate-in fade-in"
                style={{
                  background: 'rgba(0, 242, 254, 0.08)',
                  borderColor: 'rgba(0, 242, 254, 0.3)',
                  color: 'var(--color-accent)',
                }}
              >
                "{interimText}"
              </div>
            )}

            {/* Error Message Alert */}
            {error && (
              <div
                className="mt-4 px-4 py-2.5 rounded-xl text-xs max-w-md flex items-center gap-2 border bg-red-500/10 border-red-500/30 text-red-400 animate-in fade-in"
              >
                <AlertCircle size={15} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Control Bar Actions */}
          <div
            className="flex items-center gap-2 p-2 rounded-2xl border shadow-lg backdrop-blur-md"
            style={{
              borderColor: 'var(--color-border)',
              background: 'var(--color-bg-secondary)',
            }}
          >
            {/* Mute / Unmute */}
            <button
              onClick={toggleMute}
              className={`p-2.5 rounded-xl transition-colors cursor-pointer ${
                isMuted ? 'bg-amber-500/20 text-amber-400' : 'hover:bg-white/10 text-slate-300'
              }`}
              title={isMuted ? 'Unmute voice output' : 'Mute voice output'}
            >
              {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>

            {/* Interrupt AI Button */}
            <button
              onClick={stopSpeaking}
              disabled={!isSpeaking && !isThinking}
              className="p-2.5 rounded-xl hover:bg-white/10 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              title="Interrupt AI speech"
            >
              <Square size={18} />
            </button>

            {/* Repeat Last Response */}
            <button
              onClick={repeatLastResponse}
              disabled={messages.filter((m) => m.role === 'assistant').length === 0}
              className="p-2.5 rounded-xl hover:bg-white/10 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              title="Repeat last response"
            >
              <RotateCcw size={18} />
            </button>

            {/* Continuous Mode Toggle */}
            <button
              onClick={() => updateSettings({ voiceContinuous: !settings.voiceContinuous })}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                settings.voiceContinuous
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'hover:bg-white/10 text-slate-400'
              }`}
              title="Toggle continuous hands-free conversation"
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  settings.voiceContinuous ? 'bg-cyan-400 animate-pulse' : 'bg-slate-500'
                }`}
              />
              <span>Continuous</span>
            </button>

            {/* Clear Session */}
            <button
              onClick={clearSession}
              disabled={messages.length === 0}
              className="p-2.5 rounded-xl hover:bg-white/10 text-slate-400 hover:text-red-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              title="Clear conversation"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>

        {/* Right Conversation History Transcript Panel */}
        <div
          className="w-full md:w-96 border-t md:border-t-0 md:border-l flex flex-col max-h-[45vh] md:max-h-full"
          style={{
            borderColor: 'var(--color-border)',
            background: 'var(--color-bg-secondary)',
          }}
        >
          {/* Transcript Header */}
          <div
            className="flex items-center justify-between px-4 py-3 border-b"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <span className="text-xs font-semibold tracking-wider uppercase text-cyan-400 flex items-center gap-1.5">
              <Bot size={14} /> Voice Dialogue Transcript
            </span>
            <span className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
              {messages.length} messages
            </span>
          </div>

          {/* Transcript Content List */}
          <div
            ref={chatScrollRef}
            className="flex-1 p-4 overflow-y-auto space-y-3.5 text-xs"
          >
            {messages.length === 0 && !currentAssistantText && (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center"
                  style={{
                    background: 'rgba(0, 242, 254, 0.08)',
                    color: 'var(--color-accent)',
                  }}
                >
                  <Mic size={24} />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">Ready to Talk</h3>
                  <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                    Tap the microphone and speak. Try asking:
                  </p>
                </div>
                <div className="space-y-1.5 w-full text-left">
                  <div
                    className="p-2 rounded-lg border text-[11px] cursor-pointer hover:border-cyan-400/50 transition-colors"
                    style={{
                      borderColor: 'var(--color-border)',
                      background: 'var(--color-bg-tertiary)',
                    }}
                    onClick={() => toggleListening()}
                  >
                    "What can you do as Jarvis?"
                  </div>
                  <div
                    className="p-2 rounded-lg border text-[11px] cursor-pointer hover:border-cyan-400/50 transition-colors"
                    style={{
                      borderColor: 'var(--color-border)',
                      background: 'var(--color-bg-tertiary)',
                    }}
                    onClick={() => toggleListening()}
                  >
                    "آپ کیسے کام کرتے ہیں؟ (Urdu)"
                  </div>
                </div>
              </div>
            )}

            {/* Message Stream */}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex gap-2.5 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {m.role === 'assistant' && (
                  <div
                    className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 text-black font-bold text-[10px]"
                    style={{
                      background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)',
                    }}
                  >
                    J
                  </div>
                )}

                <div
                  className={`p-3 rounded-2xl max-w-[85%] leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-50 rounded-br-sm'
                      : 'border rounded-bl-sm'
                  }`}
                  style={{
                    background: m.role === 'assistant' ? 'var(--color-bg-tertiary)' : undefined,
                    borderColor: m.role === 'assistant' ? 'var(--color-border)' : undefined,
                  }}
                >
                  {m.role === 'user' ? (
                    <p className="whitespace-pre-wrap">{m.text}</p>
                  ) : (
                    <div className="prose prose-invert prose-xs max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {m.text}
                      </ReactMarkdown>
                    </div>
                  )}
                  <span
                    className="block text-[9px] mt-1 opacity-50"
                    style={{
                      textAlign: m.role === 'user' ? 'right' : 'left',
                    }}
                  >
                    {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                {m.role === 'user' && (
                  <div
                    className="w-6 h-6 rounded-lg bg-slate-700 flex items-center justify-center shrink-0 mt-0.5 text-slate-300"
                  >
                    <User size={12} />
                  </div>
                )}
              </div>
            ))}

            {/* Current In-flight Assistant Message */}
            {currentAssistantText && (
              <div className="flex gap-2.5 justify-start">
                <div
                  className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 text-black font-bold text-[10px]"
                  style={{
                    background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)',
                  }}
                >
                  J
                </div>
                <div
                  className="p-3 rounded-2xl max-w-[85%] leading-relaxed border rounded-bl-sm"
                  style={{
                    background: 'var(--color-bg-tertiary)',
                    borderColor: 'var(--color-accent)',
                  }}
                >
                  <div className="prose prose-invert prose-xs max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {currentAssistantText}
                    </ReactMarkdown>
                  </div>
                  <span className="inline-block w-1.5 h-3 bg-cyan-400 ml-1 animate-pulse" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Voice Settings Modal */}
      <VoiceSettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        availableVoices={availableVoices}
        sttAvailable={sttBackendAvailable}
        selectedModel={selectedModel}
      />
    </div>
  );
}

