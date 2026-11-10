import { useState, useRef, useEffect, useCallback } from 'react';
import { useAppStore } from '../lib/store';
import { transcribeAudio, synthesizeSpeech, fetchSpeechStatus } from '../lib/api';
import { streamChat } from '../lib/sse';
import { sanitizeTextForSpeech } from '../lib/speechSanitizer';

export type VoiceStatus = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking' | 'error';

export interface VoiceMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

export interface VoiceOption {
  voice: SpeechSynthesisVoice;
  isUrdu: boolean;
  isEnglish: boolean;
}

interface SpeechRecognitionResultItem {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionAlternativeList {
  [index: number]: SpeechRecognitionResultItem;
  length: number;
  isFinal?: boolean;
}

interface SpeechRecognitionResultEvent {
  resultIndex: number;
  results: {
    [index: number]: SpeechRecognitionAlternativeList;
    length: number;
  };
}

interface SpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface BrowserSpeechRecognitionConstructor {
  new(): BrowserSpeechRecognition;
}

interface WebkitAudioContextConstructor {
  new(): AudioContext;
}

interface SpeechRecognitionWindow extends Window {
  SpeechRecognition?: BrowserSpeechRecognitionConstructor;
  webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  webkitAudioContext?: WebkitAudioContextConstructor;
}

function getSupportedAudioFormat(): { mimeType: string; extension: string } {
  if (typeof MediaRecorder === 'undefined') {
    return { mimeType: '', extension: 'webm' };
  }
  const candidates = [
    { mimeType: 'audio/webm;codecs=opus', extension: 'webm' },
    { mimeType: 'audio/webm', extension: 'webm' },
    { mimeType: 'audio/ogg;codecs=opus', extension: 'ogg' },
    { mimeType: 'audio/mp4', extension: 'm4a' },
    { mimeType: 'audio/wav', extension: 'wav' },
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c.mimeType)) {
      return c;
    }
  }
  return { mimeType: '', extension: 'webm' };
}

export function useVoiceAssistant() {
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [messages, setMessages] = useState<VoiceMessage[]>([]);
  const [interimText, setInterimText] = useState<string>('');
  const [currentAssistantText, setCurrentAssistantText] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [availableVoices, setAvailableVoices] = useState<VoiceOption[]>([]);
  const [sttBackendAvailable, setSttBackendAvailable] = useState<boolean>(true);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const selectedModel = useAppStore((s) => s.selectedModel) || 'qwen2.5:1.5b';

  // Refs for audio hardware and streaming
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasSpokenRef = useRef<boolean>(false);
  const audioSourceRef = useRef<HTMLAudioElement | null>(null);
  const isContinuousRef = useRef<boolean>(settings.voiceContinuous);
  const isSpeakingRef = useRef<boolean>(false);

  useEffect(() => {
    isContinuousRef.current = settings.voiceContinuous;
  }, [settings.voiceContinuous]);

  // Load available browser speech synthesis voices
  const refreshVoices = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const voices = window.speechSynthesis.getVoices();
    const options: VoiceOption[] = voices.map((v) => {
      const langLower = v.lang.toLowerCase();
      const isUrdu = langLower.startsWith('ur') || v.name.toLowerCase().includes('urdu');
      const isEnglish = langLower.startsWith('en');
      return { voice: v, isUrdu, isEnglish };
    });
    setAvailableVoices(options);
  }, []);

  useEffect(() => {
    refreshVoices();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = refreshVoices;
    }
    // Check backend speech engines status
    fetchSpeechStatus()
      .then((res) => {
        setSttBackendAvailable(res.stt.available);
      })
      .catch(() => setSttBackendAvailable(false));

    return () => {
      // Teardown speech and audio context on unmount
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      if (silenceIntervalRef.current) {
        clearInterval(silenceIntervalRef.current);
        silenceIntervalRef.current = null;
      }
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => { });
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [refreshVoices]);

  // Clean stop of microphone & audio recording
  const releaseMicrophone = useCallback(() => {
    if (silenceIntervalRef.current) {
      clearInterval(silenceIntervalRef.current);
      silenceIntervalRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    hasSpokenRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch { }
      recognitionRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch { }
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    setAnalyser(null);
  }, []);

  // Stop / interrupt speech output immediately
  const stopSpeaking = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (audioSourceRef.current) {
      audioSourceRef.current.pause();
      audioSourceRef.current.currentTime = 0;
      audioSourceRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    isSpeakingRef.current = false;
    if (status === 'speaking' || status === 'thinking' || status === 'transcribing') {
      setStatus('idle');
    }
  }, [status]);

  // Speak response through TTS
  const speakText = useCallback(
    async (rawText: string, onFinish?: () => void) => {
      const sanitized = sanitizeTextForSpeech(rawText);
      if (!sanitized) {
        onFinish?.();
        return;
      }

      if (isMuted) {
        onFinish?.();
        return;
      }

      setStatus('speaking');
      isSpeakingRef.current = true;

      // Check if user selected server TTS and server TTS is available
      if (settings.voiceTtsEngine === 'server') {
        try {
          const blob = await synthesizeSpeech(sanitized, {
            speed: settings.voiceSpeed,
          });
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audioSourceRef.current = audio;
          audio.volume = settings.voiceVolume;

          audio.onended = () => {
            URL.revokeObjectURL(url);
            audioSourceRef.current = null;
            isSpeakingRef.current = false;
            setStatus('idle');
            onFinish?.();
          };
          audio.onerror = () => {
            URL.revokeObjectURL(url);
            audioSourceRef.current = null;
            isSpeakingRef.current = false;
            // Fallback to browser synthesis
            fallbackBrowserSpeak(sanitized, onFinish);
          };
          await audio.play();
          return;
        } catch (err) {
          // Fall back gracefully to browser synthesis
          fallbackBrowserSpeak(sanitized, onFinish);
          return;
        }
      }

      // Default: Browser SpeechSynthesis (local, instant, zero download)
      fallbackBrowserSpeak(sanitized, onFinish);
    },
    [isMuted, settings.voiceTtsEngine, settings.voiceSpeed, settings.voiceVolume]
  );

  const fallbackBrowserSpeak = useCallback(
    (textToSpeak: string, onFinish?: () => void) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        setStatus('idle');
        isSpeakingRef.current = false;
        onFinish?.();
        return;
      }

      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.rate = Math.max(0.6, Math.min(2.0, settings.voiceSpeed));
      utterance.volume = Math.max(0, Math.min(1.0, isMuted ? 0 : settings.voiceVolume));

      // Resolve preferred voice
      const voices = window.speechSynthesis.getVoices();
      let selectedVoice: SpeechSynthesisVoice | undefined;

      if (settings.voiceVoiceId) {
        selectedVoice = voices.find((v) => v.name === settings.voiceVoiceId || v.voiceURI === settings.voiceVoiceId);
      }

      if (!selectedVoice) {
        if (settings.voiceLanguage === 'ur') {
          // Look for native Urdu voice
          selectedVoice = voices.find((v) => v.lang.toLowerCase().startsWith('ur'));
        }
        if (!selectedVoice) {
          // Look for English natural/default voice
          selectedVoice = voices.find((v) => v.lang.toLowerCase().startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('David') || v.name.includes('Samantha')));
        }
        if (!selectedVoice) {
          selectedVoice = voices.find((v) => v.default) || voices[0];
        }
      }

      if (selectedVoice) {
        utterance.voice = selectedVoice;
        utterance.lang = selectedVoice.lang;
      }

      utterance.onend = () => {
        isSpeakingRef.current = false;
        setStatus('idle');
        onFinish?.();
      };

      utterance.onerror = (e) => {
        if (e.error === 'interrupted' || e.error === 'canceled') {
          isSpeakingRef.current = false;
          setStatus('idle');
          return;
        }
        setError(`Speech synthesis notice: ${e.error || 'Playback error'}`);
        isSpeakingRef.current = false;
        setStatus('idle');
        onFinish?.();
      };

      window.speechSynthesis.speak(utterance);
    },
    [settings.voiceSpeed, settings.voiceVolume, isMuted, settings.voiceVoiceId, settings.voiceLanguage]
  );

  // Send recognized user text to the Jarvis AI Agent
  const processUserQuery = useCallback(
    async (queryText: string) => {
      const trimmed = queryText.trim();
      if (!trimmed) {
        setStatus('idle');
        return;
      }

      const userMsg: VoiceMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        text: trimmed,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInterimText('');
      setCurrentAssistantText('');
      setStatus('thinking');
      setError(null);

      const ac = new AbortController();
      abortControllerRef.current = ac;

      // Build message context from conversation history
      const historyPayload = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.text,
      }));

      let accumulated = '';

      try {
        for await (const event of streamChat(
          {
            model: selectedModel,
            messages: historyPayload,
            stream: true,
            temperature: 0.7,
            max_tokens: 1024,
          },
          ac.signal
        )) {
          try {
            const data = JSON.parse(event.data);
            const delta = data.choices?.[0]?.delta?.content;
            if (delta) {
              accumulated += delta;
              setCurrentAssistantText(accumulated);
            }
          } catch {
            // Ignore parse errors on raw tokens / events
          }
        }

        const assistantMsg: VoiceMessage = {
          id: `asst-${Date.now()}`,
          role: 'assistant',
          text: accumulated,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
        setCurrentAssistantText('');

        // Speak response out loud
        await speakText(accumulated, () => {
          // If continuous conversation is on, automatically resume listening after speaking
          if (isContinuousRef.current) {
            setTimeout(() => {
              if (isContinuousRef.current && !isSpeakingRef.current) {
                startListening();
              }
            }, 600);
          }
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          setStatus('idle');
          return;
        }
        const errorMsg = err instanceof Error ? err.message : String(err);
        setError(errorMsg);
        setStatus('error');
      }
    },
    [messages, selectedModel, speakText]
  );

  // Start listening to the microphone
  const startListening = useCallback(async () => {
    stopSpeaking();
    setError(null);
    setInterimText('');

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('Microphone access is not supported in this browser.');
      setStatus('error');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      // Setup Web Audio API Analyser for live frequency visualization
      const speechWin = typeof window !== 'undefined' ? (window as unknown as SpeechRecognitionWindow) : undefined;
      const AudioCtx = (typeof window !== 'undefined' ? window.AudioContext : undefined) || speechWin?.webkitAudioContext;
      let liveAnalyser: AnalyserNode | null = null;
      if (AudioCtx) {
        const audioCtx = new AudioCtx();
        audioContextRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const node = audioCtx.createAnalyser();
        node.fftSize = 128;
        source.connect(node);
        setAnalyser(node);
        liveAnalyser = node;
      }

      // Check whether to use Web Speech API or Server Faster-Whisper
      const hasWebSpeech =
        typeof window !== 'undefined' &&
        Boolean(speechWin?.SpeechRecognition || speechWin?.webkitSpeechRecognition);

      if (settings.voiceSttEngine === 'web-speech' && hasWebSpeech && speechWin) {
        // Mode 1: Browser Web Speech API
        const SpeechRec = speechWin.SpeechRecognition || speechWin.webkitSpeechRecognition;
        if (!SpeechRec) throw new Error('Speech recognition constructor unavailable');
        const recognition = new SpeechRec();
        recognitionRef.current = recognition;
        recognition.continuous = true;
        recognition.interimResults = true;

        if (settings.voiceLanguage === 'ur') {
          recognition.lang = 'ur-PK';
        } else if (settings.voiceLanguage === 'en') {
          recognition.lang = 'en-US';
        }

        let finalTranscript = '';

        recognition.onresult = (event: SpeechRecognitionResultEvent) => {
          let interim = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const item = event.results[i];
            if (item && item.isFinal) {
              finalTranscript += (item[0]?.transcript || '') + ' ';
            } else if (item) {
              interim += item[0]?.transcript || '';
            }
          }
          setInterimText(finalTranscript + interim);

          // Reset silence auto-completion timer
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = setTimeout(() => {
            const captured = (finalTranscript + interim).trim();
            if (captured) {
              releaseMicrophone();
              processUserQuery(captured);
            }
          }, 1800);
        };

        recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
          if (e.error !== 'no-speech') {
            setError(`Speech recognition: ${e.error}`);
          }
        };

        recognition.onend = () => {
          const text = finalTranscript.trim();
          if (text) {
            releaseMicrophone();
            processUserQuery(text);
          }
        };

        recognition.start();
        setStatus('listening');
      } else {
        // Mode 2: Server-side Faster-Whisper
        const selectedFormat = getSupportedAudioFormat();
        const recorder = selectedFormat.mimeType
          ? new MediaRecorder(stream, { mimeType: selectedFormat.mimeType })
          : new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;
        audioChunksRef.current = [];
        hasSpokenRef.current = false;

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };

        recorder.onstop = async () => {
          // Clean up audio tracks now that recorder has finished flushing
          if (silenceIntervalRef.current) {
            clearInterval(silenceIntervalRef.current);
            silenceIntervalRef.current = null;
          }
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
          if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach((track) => track.stop());
            mediaStreamRef.current = null;
          }
          setAnalyser(null);

          const chunks = audioChunksRef.current;
          audioChunksRef.current = [];
          if (!chunks.length) {
            setStatus('idle');
            return;
          }

          const blob = new Blob(chunks, { type: selectedFormat.mimeType || 'audio/webm' });
          if (blob.size < 800) {
            // Less than 800 bytes contains no speech payload (empty/interrupted click)
            setStatus('idle');
            return;
          }

          setStatus('transcribing');
          try {
            const langCode = settings.voiceLanguage === 'ur' ? 'ur' : settings.voiceLanguage === 'en' ? 'en' : undefined;
            const filename = `voice_input.${selectedFormat.extension}`;
            const res = await transcribeAudio(blob, filename, langCode);
            if (res.text && res.text.trim()) {
              await processUserQuery(res.text.trim());
            } else {
              setStatus('idle');
            }
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            setError(message || 'Speech transcription failed');
            setStatus('error');
          }
        };

        recorder.start(250); // Flush chunks every 250ms
        setStatus('listening');

        // Dynamic silence auto-detection for hands-free voice experience
        const activeAnalyser = liveAnalyser || analyser;
        if (activeAnalyser) {
          const sampleBuffer = new Uint8Array(activeAnalyser.fftSize);
          silenceIntervalRef.current = setInterval(() => {
            if (recorder.state !== 'recording') return;
            activeAnalyser.getByteTimeDomainData(sampleBuffer);
            let sumSquares = 0;
            for (let i = 0; i < sampleBuffer.length; i++) {
              const norm = (sampleBuffer[i] - 128) / 128;
              sumSquares += norm * norm;
            }
            const rms = Math.sqrt(sumSquares / sampleBuffer.length);

            // Speech threshold
            if (rms > 0.04) {
              hasSpokenRef.current = true;
              if (silenceTimerRef.current) {
                clearTimeout(silenceTimerRef.current);
                silenceTimerRef.current = null;
              }
            } else if (hasSpokenRef.current && rms < 0.02) {
              // Silence after speech detected - start timer if not already running
              if (!silenceTimerRef.current) {
                silenceTimerRef.current = setTimeout(() => {
                  if (recorder.state === 'recording') {
                    try {
                      recorder.requestData();
                      recorder.stop();
                    } catch { }
                  }
                }, 1800);
              }
            }
          }, 100);
        }
      }
    } catch (err) {
      releaseMicrophone();
      setError('Microphone permission denied or audio device unavailable.');
      setStatus('error');
    }
  }, [stopSpeaking, settings.voiceSttEngine, settings.voiceLanguage, sttBackendAvailable, releaseMicrophone, processUserQuery, analyser]);

  // Stop listening manually (e.g., user clicked mic button while listening)
  const stopListening = useCallback(() => {
    if (status !== 'listening') return;

    if (silenceIntervalRef.current) {
      clearInterval(silenceIntervalRef.current);
      silenceIntervalRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch { }
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.requestData();
        mediaRecorderRef.current.stop();
      } catch { }
    }
  }, [status]);

  // Toggle listening button
  const toggleListening = useCallback(() => {
    if (status === 'listening') {
      stopListening();
    } else if (status === 'speaking' || status === 'thinking' || status === 'transcribing') {
      stopSpeaking();
    } else {
      startListening();
    }
  }, [status, stopListening, stopSpeaking, startListening]);

  // Repeat the last assistant response
  const repeatLastResponse = useCallback(() => {
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    if (lastAssistant && lastAssistant.text) {
      speakText(lastAssistant.text);
    }
  }, [messages, speakText]);

  // Clear session
  const clearSession = useCallback(() => {
    stopSpeaking();
    releaseMicrophone();
    setMessages([]);
    setInterimText('');
    setCurrentAssistantText('');
    setError(null);
    setStatus('idle');
  }, [stopSpeaking, releaseMicrophone]);

  return {
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
    startListening,
    stopListening,
    toggleListening,
    stopSpeaking,
    repeatLastResponse,
    clearSession,
    processUserQuery,
    toggleMute: () => setIsMuted((m) => !m),
    isListening: status === 'listening',
    isThinking: status === 'thinking',
    isSpeaking: status === 'speaking',
  };
}
