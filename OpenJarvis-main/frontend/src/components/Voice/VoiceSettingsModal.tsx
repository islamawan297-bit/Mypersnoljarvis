import { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
  Volume2,
  Mic,
  Settings,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Play,
  Square,
  Activity,
  Globe,
  Sliders,
} from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { VoiceOption } from '../../hooks/useVoiceAssistant';

interface VoiceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableVoices: VoiceOption[];
  sttAvailable: boolean;
  selectedModel: string;
}

export function VoiceSettingsModal({
  isOpen,
  onClose,
  availableVoices,
  sttAvailable,
  selectedModel,
}: VoiceSettingsModalProps) {
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);

  // Test microphone state
  const [isTestingMic, setIsTestingMic] = useState(false);
  const [micVolumeLevel, setMicVolumeLevel] = useState(0);
  const testMicStreamRef = useRef<MediaStream | null>(null);
  const testMicAnimRef = useRef<number | null>(null);

  // Test speaker state
  const [isTestingSpeaker, setIsTestingSpeaker] = useState(false);

  const stopMicTest = useCallback(() => {
    if (testMicAnimRef.current) {
      cancelAnimationFrame(testMicAnimRef.current);
      testMicAnimRef.current = null;
    }
    if (testMicStreamRef.current) {
      testMicStreamRef.current.getTracks().forEach((t) => t.stop());
      testMicStreamRef.current = null;
    }
    setIsTestingMic(false);
    setMicVolumeLevel(0);
  }, []);

  const startMicTest = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      testMicStreamRef.current = stream;
      setIsTestingMic(true);

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const checkLevel = () => {
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          setMicVolumeLevel(Math.min(100, Math.round((avg / 128) * 100)));
          testMicAnimRef.current = requestAnimationFrame(checkLevel);
        };
        checkLevel();
      }
    } catch {
      setIsTestingMic(false);
      setMicVolumeLevel(0);
    }
  }, []);

  const handleTestSpeaker = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (isTestingSpeaker) {
      window.speechSynthesis.cancel();
      setIsTestingSpeaker(false);
      return;
    }

    window.speechSynthesis.cancel();
    const isUrdu = settings.voiceLanguage === 'ur';
    const text = isUrdu
      ? 'السلام علیکم! میں جاروس ہوں، آپ کا ذاتی آواز کا اسسٹنٹ۔'
      : 'Hello! I am Jarvis, your personal AI voice assistant. All systems are operational.';

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = settings.voiceSpeed;
    utterance.volume = settings.voiceVolume;

    const voices = window.speechSynthesis.getVoices();
    let voiceToUse: SpeechSynthesisVoice | undefined;

    if (settings.voiceVoiceId) {
      voiceToUse = voices.find((v) => v.name === settings.voiceVoiceId || v.voiceURI === settings.voiceVoiceId);
    }
    if (!voiceToUse && isUrdu) {
      voiceToUse = voices.find((v) => v.lang.toLowerCase().startsWith('ur'));
    }
    if (!voiceToUse) {
      voiceToUse = voices.find((v) => v.lang.toLowerCase().startsWith('en')) || voices[0];
    }

    if (voiceToUse) {
      utterance.voice = voiceToUse;
      utterance.lang = voiceToUse.lang;
    }

    utterance.onend = () => setIsTestingSpeaker(false);
    utterance.onerror = () => setIsTestingSpeaker(false);

    setIsTestingSpeaker(true);
    window.speechSynthesis.speak(utterance);
  }, [isTestingSpeaker, settings.voiceLanguage, settings.voiceSpeed, settings.voiceVolume, settings.voiceVoiceId]);

  useEffect(() => {
    return () => {
      // Stop mic test if modal unmounts
      stopMicTest();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [stopMicTest]);

  if (!isOpen) return null;

  const urduVoices = availableVoices.filter((v) => v.isUrdu);
  const englishVoices = availableVoices.filter((v) => v.isEnglish);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="voice-settings-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border shadow-2xl flex flex-col"
        style={{
          background: 'var(--color-bg-secondary)',
          borderColor: 'var(--color-border)',
          color: 'var(--color-text-primary)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="p-2 rounded-xl"
              style={{
                background: 'rgba(0, 242, 254, 0.1)',
                color: 'var(--color-accent)',
              }}
            >
              <Settings size={20} />
            </div>
            <div>
              <h2 id="voice-settings-title" className="text-lg font-semibold tracking-tight">
                Voice Assistant Settings
              </h2>
              <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                Configure Speech-to-Text, Voice Synthesis, and Local Audio Hardware
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              stopMicTest();
              onClose();
            }}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            style={{ color: 'var(--color-text-tertiary)' }}
            aria-label="Close settings"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Status Overview Card */}
          <div
            className="p-4 rounded-xl border grid grid-cols-1 sm:grid-cols-3 gap-3"
            style={{
              background: 'var(--color-bg-tertiary)',
              borderColor: 'var(--color-border)',
            }}
          >
            <div className="space-y-1">
              <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                STT Engine
              </span>
              <div className="flex items-center gap-1.5 text-xs font-medium">
                {sttAvailable ? (
                  <CheckCircle2 size={14} className="text-emerald-400" />
                ) : (
                  <AlertCircle size={14} className="text-amber-400" />
                )}
                <span>Faster-Whisper (Local)</span>
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                TTS Engine
              </span>
              <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                <CheckCircle2 size={14} />
                <span>Speech Synthesis (Ready)</span>
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                Active AI Model
              </span>
              <div className="flex items-center gap-1.5 text-xs font-medium text-cyan-400 truncate">
                <Sparkles size={14} />
                <span className="truncate">{selectedModel}</span>
              </div>
            </div>
          </div>

          {/* Section 1: Engine Selection */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-cyan-400 flex items-center gap-2">
              <Sliders size={14} /> Speech Recognition (STT) & Synthesis (TTS)
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* STT Engine */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                  Speech-to-Text Engine
                </label>
                <select
                  value={settings.voiceSttEngine}
                  onChange={(e) => updateSettings({ voiceSttEngine: e.target.value as any })}
                  className="w-full text-xs px-3 py-2 rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-cyan-400"
                  style={{
                    borderColor: 'var(--color-border)',
                    background: 'var(--color-bg-primary)',
                  }}
                >
                  <option value="faster-whisper">Faster-Whisper (Local Server - GPU/CPU)</option>
                  <option value="web-speech">Web Speech API (Browser Native - Fast)</option>
                </select>
                <p className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  Faster-Whisper runs locally on your laptop with multi-language detection.
                </p>
              </div>

              {/* TTS Engine */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                  Text-to-Speech Engine
                </label>
                <select
                  value={settings.voiceTtsEngine}
                  onChange={(e) => updateSettings({ voiceTtsEngine: e.target.value as any })}
                  className="w-full text-xs px-3 py-2 rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-cyan-400"
                  style={{
                    borderColor: 'var(--color-border)',
                    background: 'var(--color-bg-primary)',
                  }}
                >
                  <option value="browser">Browser Natural Voice (Instant & Zero Extra RAM)</option>
                  <option value="server">Server TTS (Kokoro / Configured)</option>
                </select>
                <p className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  Uses your system's built-in neural speech synthesis voices.
                </p>
              </div>
            </div>
          </div>

          {/* Section 2: Language & Voice Selection */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-cyan-400 flex items-center gap-2">
              <Globe size={14} /> Language & Voice Selection
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Language */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                  Assistant Language
                </label>
                <select
                  value={settings.voiceLanguage}
                  onChange={(e) => updateSettings({ voiceLanguage: e.target.value as any })}
                  className="w-full text-xs px-3 py-2 rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-cyan-400"
                  style={{
                    borderColor: 'var(--color-border)',
                    background: 'var(--color-bg-primary)',
                  }}
                >
                  <option value="auto">Auto-Detect Language</option>
                  <option value="en">English (US / UK / Global)</option>
                  <option value="ur">Urdu (اردو)</option>
                </select>
                {settings.voiceLanguage === 'ur' && urduVoices.length === 0 && (
                  <p className="text-[11px] text-amber-400 flex items-center gap-1">
                    <AlertCircle size={12} /> No native Urdu voice installed on OS (will use English default).
                  </p>
                )}
              </div>

              {/* Specific Voice */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                  Preferred Voice ({availableVoices.length} detected)
                </label>
                <select
                  value={settings.voiceVoiceId}
                  onChange={(e) => updateSettings({ voiceVoiceId: e.target.value })}
                  className="w-full text-xs px-3 py-2 rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-cyan-400"
                  style={{
                    borderColor: 'var(--color-border)',
                    background: 'var(--color-bg-primary)',
                  }}
                >
                  <option value="">Default Recommended Voice</option>
                  {englishVoices.length > 0 && (
                    <optgroup label="English Voices">
                      {englishVoices.map((v) => (
                        <option key={v.voice.name} value={v.voice.name}>
                          {v.voice.name} ({v.voice.lang})
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {urduVoices.length > 0 && (
                    <optgroup label="Urdu Voices">
                      {urduVoices.map((v) => (
                        <option key={v.voice.name} value={v.voice.name}>
                          {v.voice.name} ({v.voice.lang})
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
            </div>
          </div>

          {/* Section 3: Speech Sliders (Speed & Volume) */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-cyan-400 flex items-center gap-2">
              <Activity size={14} /> Speech Tuning & Behavior
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Speed Slider */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span style={{ color: 'var(--color-text-secondary)' }}>Speaking Speed</span>
                  <span className="font-mono text-cyan-400">{settings.voiceSpeed.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="0.6"
                  max="1.6"
                  step="0.05"
                  value={settings.voiceSpeed}
                  onChange={(e) => updateSettings({ voiceSpeed: parseFloat(e.target.value) })}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
                <div className="flex justify-between text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  <span>Slower (0.6x)</span>
                  <span>Normal (1.0x)</span>
                  <span>Faster (1.6x)</span>
                </div>
              </div>

              {/* Volume Slider */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span style={{ color: 'var(--color-text-secondary)' }}>Audio Volume</span>
                  <span className="font-mono text-cyan-400">{Math.round(settings.voiceVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={settings.voiceVolume}
                  onChange={(e) => updateSettings({ voiceVolume: parseFloat(e.target.value) })}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
                <div className="flex justify-between text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  <span>0%</span>
                  <span>50%</span>
                  <span>100%</span>
                </div>
              </div>
            </div>

            {/* Continuous Conversation Toggle */}
            <div
              className="p-3 rounded-xl border flex items-center justify-between"
              style={{
                borderColor: 'var(--color-border)',
                background: 'var(--color-bg-primary)',
              }}
            >
              <div className="space-y-0.5">
                <span className="text-xs font-medium">Continuous Conversation Mode</span>
                <p className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  Jarvis keeps listening automatically after speaking, so you can converse hands-free.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.voiceContinuous}
                onClick={() => updateSettings({ voiceContinuous: !settings.voiceContinuous })}
                className="w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-200"
                style={{
                  background: settings.voiceContinuous ? 'var(--color-accent)' : 'var(--color-bg-tertiary)',
                }}
              >
                <div
                  className="w-4 h-4 rounded-full bg-white transition-transform duration-200"
                  style={{
                    transform: settings.voiceContinuous ? 'translateX(20px)' : 'translateX(0)',
                  }}
                />
              </button>
            </div>
          </div>

          {/* Section 4: Hardware Diagnostic & Test Buttons */}
          <div className="space-y-3 pt-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
              Hardware Testing & Calibration
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Test Mic Button */}
              <div
                className="p-3 rounded-xl border flex flex-col gap-2"
                style={{
                  borderColor: 'var(--color-border)',
                  background: 'var(--color-bg-primary)',
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium flex items-center gap-1.5">
                    <Mic size={14} className="text-cyan-400" /> Test Microphone
                  </span>
                  <button
                    onClick={isTestingMic ? stopMicTest : startMicTest}
                    className="text-xs px-2.5 py-1 rounded-md font-medium transition-colors"
                    style={{
                      background: isTestingMic ? 'rgba(239, 68, 68, 0.2)' : 'rgba(0, 242, 254, 0.15)',
                      color: isTestingMic ? '#ef4444' : 'var(--color-accent)',
                    }}
                  >
                    {isTestingMic ? 'Stop Test' : 'Start Mic Test'}
                  </button>
                </div>

                {/* Level Meter */}
                <div className="w-full bg-black/20 h-2 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all duration-75"
                    style={{ width: `${micVolumeLevel}%` }}
                  />
                </div>
                <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  {isTestingMic ? `Mic level: ${micVolumeLevel}% (Speak into mic)` : 'Click to test microphone level'}
                </span>
              </div>

              {/* Test Speaker Button */}
              <div
                className="p-3 rounded-xl border flex flex-col justify-between"
                style={{
                  borderColor: 'var(--color-border)',
                  background: 'var(--color-bg-primary)',
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium flex items-center gap-1.5">
                    <Volume2 size={14} className="text-emerald-400" /> Test Speaker Voice
                  </span>
                  <button
                    onClick={handleTestSpeaker}
                    className="text-xs px-2.5 py-1 rounded-md font-medium flex items-center gap-1.5 transition-colors"
                    style={{
                      background: isTestingSpeaker ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.15)',
                      color: isTestingSpeaker ? '#ef4444' : '#10b981',
                    }}
                  >
                    {isTestingSpeaker ? (
                      <>
                        <Square size={12} /> Stop Voice
                      </>
                    ) : (
                      <>
                        <Play size={12} /> Speak Sample
                      </>
                    )}
                  </button>
                </div>
                <span className="text-[10px] mt-2" style={{ color: 'var(--color-text-tertiary)' }}>
                  Plays sample greeting using current voice and speed settings.
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end px-6 py-4 border-t"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <button
            onClick={() => {
              stopMicTest();
              onClose();
            }}
            className="px-5 py-2 text-xs font-semibold rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

