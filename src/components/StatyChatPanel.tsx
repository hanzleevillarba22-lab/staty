import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Database,
  FileText,
  Image as ImageIcon,
  Loader2,
  Mic,
  Paperclip,
  RotateCcw,
  Send,
  Square,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { assistantApi } from '../lib/api.ts';
import { playDrawerClose, playDrawerOpen } from '../lib/soundEffects.ts';
import type {
  DatasetSummaryItem,
  NavRoute,
  StatisticalComputationResult,
  StatyActionEvent,
  StatyExpression,
  StatyGesture,
} from '../types/index.ts';
import { StatyMascot } from './StatyMascot.tsx';

interface PendingAttachment {
  filename: string;
  mimeType: string;
  fileSize: number;
  storedName: string;
  kind: 'dataset' | 'document' | 'image';
  extractedText: string;
  uncertainties: string[];
  requiresConfirmation: boolean;
  confirmed: boolean;
  previewUrl?: string;
}

export interface ChatMessageItem {
  id: number | string;
  role: 'user' | 'assistant';
  content: string;
  context?: {
    datasetName?: string;
    verifiedAnalysis?: StatisticalComputationResult;
    actions?: StatyActionEvent[];
    emotion?: StatyExpression;
    gesture?: StatyGesture;
  } | null;
  attachments?: Array<{ id: number; filename: string; mime_type: string; file_size: number }>;
}

interface StatyChatPanelProps {
  compact?: boolean;
  currentAppRoute: NavRoute;
  activeConvId: number | null;
  onConvReady: (convId: number) => void;
  datasets: DatasetSummaryItem[];
  selectedDatasetId: number | '';
  onSelectDataset: (id: number | '') => void;
  aiConfigured: boolean | null;
  statusMessage: string;
  onWorkspaceChanged?: () => void;
  onNavigate?: (route: NavRoute, contextLabel?: string) => void;
  onConversationsRefresh?: () => Promise<void>;
  onCloseDrawer?: () => void;
}

export const StatyChatPanel: React.FC<StatyChatPanelProps> = ({
  compact = false,
  currentAppRoute,
  activeConvId,
  onConvReady,
  datasets,
  selectedDatasetId,
  onSelectDataset,
  aiConfigured,
  statusMessage,
  onWorkspaceChanged,
  onNavigate,
  onConversationsRefresh,
  onCloseDrawer,
}) => {
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [statyExpr, setStatyExpr] = useState<StatyExpression>('greeting');
  const [statyGesture, setStatyGesture] = useState<StatyGesture>('wave-wink');
  const [liveStatus, setLiveStatus] = useState<string>('STATY AI Assistant');

  const [inputText, setInputText] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [streamingActions, setStreamingActions] = useState<StatyActionEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [failedRetryDraft, setFailedRetryDraft] = useState<{
    text: string;
    attachments: PendingAttachment[];
  } | null>(null);

  const [recording, setRecording] = useState(false);
  const [recordingSec, setRecordingSec] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [speakingMsgId, setSpeakingMsgId] = useState<number | string | null>(null);
  const [loadingSpeechId, setLoadingSpeechId] = useState<number | string | null>(null);
  const [showMicPrompt, setShowMicPrompt] = useState(false);
  const [micPermissionConfirmed, setMicPermissionConfirmed] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);
  const playbackAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setStatyExpr('idle');
      setStatyGesture('none');
    }, 1800);
    return () => {
      window.clearTimeout(t);
      if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // ignore
        }
      }
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (playbackAudioRef.current) {
        playbackAudioRef.current.pause();
        playbackAudioRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!activeConvId) {
      setMessages([]);
      return;
    }
    assistantApi
      .getConversation(activeConvId)
      .then((res) => {
        setMessages(
          res.messages.map((m) => ({
            ...m,
            context: m.context
              ? {
                  ...m.context,
                  actions: m.context.actions as StatyActionEvent[] | undefined,
                  emotion: (m.context.emotion as StatyExpression) || 'happy',
                  gesture: (m.context.gesture as StatyGesture) || 'none',
                }
              : null,
          })),
        );
      })
      .catch(() => {
        // ignore load glitch
      });
  }, [activeConvId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText, sending]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setError(null);
    setExtracting(true);
    setStatyExpr('thinking');
    setStatyGesture('tilt');
    setLiveStatus('Inspecting attached files...');

    try {
      const res = await assistantApi.extractAttachments(files);
      const mapped: PendingAttachment[] = res.attachments.map((att, idx) => ({
        ...att,
        confirmed: !att.requiresConfirmation,
        previewUrl: files[idx]?.type.startsWith('image/')
          ? URL.createObjectURL(files[idx])
          : undefined,
      }));
      setPendingAttachments((prev) => [...prev, ...mapped]);
      setStatyExpr('explaining');
      setStatyGesture('nod');
      setLiveStatus('Files ready — confirm or send');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Attachment processing failed.');
      setStatyExpr('error');
      setStatyGesture('shake');
      setLiveStatus('Attachment error');
    } finally {
      setExtracting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const startMicRecording = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Microphone recording is not supported in this browser. Please type your message instead.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const preferredTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
        'audio/ogg',
      ];
      const mimeType = preferredTypes.find((t) => MediaRecorder.isTypeSupported(t)) || '';
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      audioChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          audioChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        if (recordTimerRef.current) {
          window.clearInterval(recordTimerRef.current);
          recordTimerRef.current = null;
        }

        const recordedType = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: recordedType });
        audioChunksRef.current = [];

        if (blob.size < 256) {
          setStatyExpr('confused');
          setStatyGesture('tilt');
          setLiveStatus('STATY AI Assistant');
          setError('Recording was too short. Hold or speak clearly for at least a second.');
          return;
        }

        setTranscribing(true);
        setStatyExpr('processing');
        setStatyGesture('ear-perk');
        setLiveStatus('Transcribing voice prompt...');

        try {
          const ext = recordedType.includes('mp4')
            ? 'm4a'
            : recordedType.includes('ogg')
              ? 'ogg'
              : 'webm';
          const res = await assistantApi.transcribeAudio(blob, `staty-voice.${ext}`);
          if (res.text) {
            setInputText((prev) => (prev.trim() ? `${prev.trim()} ${res.text}` : res.text));
            setStatyExpr('explaining');
            setStatyGesture('nod');
            setLiveStatus('Voice transcribed — review & send');
          } else {
            setStatyExpr('confused');
            setStatyGesture('tilt');
            setLiveStatus('No speech detected');
          }
        } catch (txErr) {
          setError(txErr instanceof Error ? txErr.message : 'Unable to transcribe audio.');
          setStatyExpr('error');
          setStatyGesture('shake');
          setLiveStatus('Voice transcription notice');
        } finally {
          setTranscribing(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setRecordingSec(0);
      setStatyExpr('listening');
      setStatyGesture('ear-perk');
      setLiveStatus('Listening to your voice...');
      recordTimerRef.current = window.setInterval(() => {
        setRecordingSec((s) => s + 1);
      }, 1000);
    } catch (micErr) {
      const errName = micErr instanceof Error ? micErr.name : '';
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        setError(
          'Microphone permission was denied. If you are viewing inside an embedded preview, allow microphone access in Chrome site settings or open the app URL directly in a browser tab.',
        );
      } else {
        setError('Microphone is unavailable on this device or browser.');
      }
      setStatyExpr('confused');
      setStatyGesture('tilt');
    }
  };

  const toggleMicRecording = async () => {
    setError(null);
    if (aiConfigured === false) {
      setError(
        'STATY AI is not configured yet. Please add your API credentials in the application environment settings.',
      );
      return;
    }

    if (recording && mediaRecorderRef.current) {
      if (recordTimerRef.current) {
        window.clearInterval(recordTimerRef.current);
        recordTimerRef.current = null;
      }
      mediaRecorderRef.current.stop();
      setRecording(false);
      playDrawerClose();
      return;
    }

    if (!micPermissionConfirmed) {
      playDrawerOpen();
      setStatyExpr('listening');
      setStatyGesture('ear-perk');
      setShowMicPrompt(true);
      return;
    }

    playDrawerOpen();
    await startMicRecording();
  };

  const handleAllowMicrophone = async () => {
    setShowMicPrompt(false);
    setMicPermissionConfirmed(true);
    playDrawerOpen();
    await startMicRecording();
  };

  const handleToggleSpeak = async (msgId: number | string, text: string) => {
    if (speakingMsgId === msgId && playbackAudioRef.current) {
      playbackAudioRef.current.pause();
      playbackAudioRef.current = null;
      setSpeakingMsgId(null);
      setStatyExpr('idle');
      setStatyGesture('none');
      setLiveStatus('STATY AI Assistant');
      return;
    }

    if (playbackAudioRef.current) {
      playbackAudioRef.current.pause();
      playbackAudioRef.current = null;
      setSpeakingMsgId(null);
    }

    setError(null);
    setLoadingSpeechId(msgId);
    setStatyExpr('processing');
    setStatyGesture('ear-perk');
    setLiveStatus('Preparing STATY voice...');

    try {
      const res = await assistantApi.speakText(text);
      const audio = new Audio(`data:${res.mimeType};base64,${res.audioBase64}`);
      playbackAudioRef.current = audio;
      audio.onended = () => {
        setSpeakingMsgId(null);
        playbackAudioRef.current = null;
        setStatyExpr('idle');
        setStatyGesture('none');
        setLiveStatus('STATY AI Assistant');
      };
      audio.onerror = () => {
        setSpeakingMsgId(null);
        playbackAudioRef.current = null;
        setError('Audio playback failed on this device.');
      };
      setSpeakingMsgId(msgId);
      setStatyExpr('explaining');
      setStatyGesture('nod');
      setLiveStatus('STATY is speaking...');
      await audio.play();
    } catch (ttsErr) {
      setError(ttsErr instanceof Error ? ttsErr.message : 'Unable to generate voice playback.');
      setStatyExpr('error');
      setStatyGesture('shake');
      setLiveStatus('STATY AI Assistant');
    } finally {
      setLoadingSpeechId(null);
    }
  };

  const executeSend = async (
    draftText: string,
    draftAttachments: PendingAttachment[],
  ) => {
    setError(null);
    setFailedRetryDraft(null);

    if (aiConfigured === false) {
      setError(
        'STATY AI is not configured yet. Please add your API credentials in the application environment settings.',
      );
      setStatyExpr('error');
      setStatyGesture('shake');
      return;
    }

    const unconfirmed = draftAttachments.some((a) => !a.confirmed);
    if (unconfirmed) {
      setError('Please review and confirm the extracted content for your attached image/document first.');
      setStatyExpr('confused');
      setStatyGesture('tilt');
      setLiveStatus('Waiting for attachment check');
      return;
    }

    if (!draftText.trim() && draftAttachments.length === 0) return;

    let convId = activeConvId;
    if (!convId) {
      const created = await assistantApi.createConversation('New Research Chat');
      convId = created.conversation.id;
      onConvReady(convId);
    }

    const userDraft = draftText.trim() || 'Please analyze the attached research files.';
    const sentAttachments = draftAttachments.map((a) => ({
      filename: a.filename,
      mimeType: a.mimeType,
      fileSize: a.fileSize,
      storedName: a.storedName,
      extractedText: a.extractedText,
    }));

    setInputText('');
    setPendingAttachments([]);
    setSending(true);
    setStreamingText('');
    setStreamingActions([]);
    setStatyExpr('thinking');
    setStatyGesture('tilt');
    setLiveStatus('STATY is thinking...');

    const optimisticId = `temp-u-${Date.now()}`;
    const optimisticUserMsg: ChatMessageItem = {
      id: optimisticId,
      role: 'user',
      content: userDraft,
    };
    setMessages((prev) => [...prev, optimisticUserMsg]);

    let accumulated = '';
    const collectedActions: StatyActionEvent[] = [];

    try {
      await assistantApi.streamMessage(
        convId,
        {
          message: userDraft,
          currentAppRoute,
          datasetId: selectedDatasetId ? Number(selectedDatasetId) : null,
          attachments: sentAttachments,
        },
        {
          onStatus: (st) => {
            setStatyExpr((st.emotion as StatyExpression) || 'processing');
            setStatyGesture((st.gesture as StatyGesture) || 'ear-perk');
            setLiveStatus(st.label || 'STATY is working...');
          },
          onDelta: ({ text }) => {
            accumulated += text;
            setStreamingText(accumulated);
          },
          onAction: (action) => {
            const typedAction = action as StatyActionEvent;
            collectedActions.push(typedAction);
            setStreamingActions([...collectedActions]);
            if (typedAction.type === 'navigate' && typedAction.route) {
              onNavigate?.(typedAction.route, typedAction.contextLabel);
            } else {
              onWorkspaceChanged?.();
            }
          },
          onDone: async (donePayload) => {
            const finalExpr =
              (donePayload.assistantMessage.emotion as StatyExpression) ||
              (donePayload.assistantMessage.verifiedAnalysis ? 'success' : 'happy');
            const finalGest =
              (donePayload.assistantMessage.gesture as StatyGesture) || 'bounce';
            setStatyExpr(finalExpr);
            setStatyGesture(finalGest);
            setLiveStatus('STATY AI Assistant');
            setStreamingText('');
            setStreamingActions([]);

            const refreshed = await assistantApi.getConversation(convId!);
            setMessages(
              refreshed.messages.map((m) => ({
                ...m,
                context: m.context
                  ? {
                      ...m.context,
                      actions: m.context.actions as StatyActionEvent[] | undefined,
                      emotion: (m.context.emotion as StatyExpression) || 'happy',
                      gesture: (m.context.gesture as StatyGesture) || 'none',
                    }
                  : null,
              })),
            );
            await onConversationsRefresh?.();
            onWorkspaceChanged?.();

            window.setTimeout(() => {
              setStatyExpr('idle');
              setStatyGesture('none');
            }, 2600);
          },
        },
      );
    } catch (err) {
      // Remove optimistic message to match server rollback and offer instant Retry
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setFailedRetryDraft({ text: userDraft, attachments: draftAttachments });
      setError(err instanceof Error ? err.message : 'Unable to reach STATY.');
      setStatyExpr('error');
      setStatyGesture('shake');
      setLiveStatus('STATY AI Assistant');
      setStreamingText('');
    } finally {
      setSending(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeSend(inputText, pendingAttachments);
  };

  const quickCommands = [
    'Summarize my workspace projects, datasets & analyses',
    'Create a dataset from pasted scores & run a test',
    'Recommend the right statistical test for my study',
    'Save my analysis and generate a PDF report',
  ];

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* STATY AI Assistant Header */}
      <div className="px-3.5 sm:px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 bg-white dark:bg-slate-900">
        <div className="flex items-center gap-2.5 min-w-0">
          <StatyMascot
            variant="head"
            expression={statyExpr}
            gesture={statyGesture}
            size="sm"
            onMascotClick={() => {
              setStatyExpr('excited');
              setStatyGesture('bounce');
              setLiveStatus('STATY is ready to help!');
              window.setTimeout(() => {
                setStatyExpr('idle');
                setStatyGesture('none');
                setLiveStatus('STATY AI Assistant');
              }, 1400);
            }}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="font-display text-sm sm:text-base font-bold text-[#173B75] dark:text-white truncate">
                STATY AI
              </h2>
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  aiConfigured === false
                    ? 'bg-amber-500'
                    : recording
                      ? 'bg-red-500 animate-pulse'
                      : sending || transcribing
                        ? 'bg-[#2563EB] animate-pulse'
                        : 'bg-emerald-500'
                }`}
              />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {liveStatus}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <div className="relative max-w-[138px] sm:max-w-[190px]">
            <Database className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={selectedDatasetId}
              onChange={(e) => onSelectDataset(e.target.value ? Number(e.target.value) : '')}
              aria-label="Active dataset context"
              className="w-full min-h-[36px] pl-7 pr-2 py-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200 truncate"
            >
              <option value="">All Workspace</option>
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.row_count})
                </option>
              ))}
            </select>
          </div>
          {onCloseDrawer && (
            <button
              type="button"
              onClick={onCloseDrawer}
              className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white cursor-pointer"
              aria-label="Close STATY drawer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {aiConfigured === false && (
        <div className="m-3 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{statusMessage}</span>
        </div>
      )}

      {error && (
        <div className="mx-3 mt-3 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 px-3.5 py-2.5 text-xs text-red-700 dark:text-red-300 flex items-start justify-between gap-2.5">
          <div className="flex items-start gap-2 min-w-0">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="leading-relaxed">{error}</p>
              {failedRetryDraft && (
                <p className="text-[11px] opacity-80 truncate">
                  Prompt: &ldquo;{failedRetryDraft.text}&rdquo;
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {failedRetryDraft && (
              <button
                type="button"
                disabled={sending}
                onClick={() => executeSend(failedRetryDraft.text, failedRetryDraft.attachments)}
                className="min-h-[30px] px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold inline-flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Retry</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setError(null);
                if (failedRetryDraft && !inputText) {
                  setInputText(failedRetryDraft.text);
                }
                setFailedRetryDraft(null);
                setStatyExpr('idle');
                setStatyGesture('none');
              }}
              aria-label="Dismiss error"
              className="p-1 text-red-500 hover:text-red-800 dark:hover:text-red-200 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Real-Time Message Feed with Head-Only STATY Avatars */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !sending ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-6 max-w-md mx-auto">
            <StatyMascot
              variant="head"
              expression={statyExpr}
              gesture={statyGesture}
              size={compact ? 'md' : 'lg'}
            />
            <h3 className="mt-3 font-display text-base sm:text-lg font-bold text-[#173B75] dark:text-white">
              Ask STATY to do anything
            </h3>
            <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              Create projects or datasets, clean messy tables, run verified statistical tests, save analyses, generate PDF/Excel reports, or navigate STATLYTICS in real time.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {quickCommands.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => {
                    setInputText(prompt);
                    setStatyExpr('listening');
                    setStatyGesture('ear-perk');
                  }}
                  className="px-3 py-2 rounded-xl bg-[#F8FAFC] dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-200 hover:border-[#2563EB] cursor-pointer text-left"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex items-start gap-2.5 ${
                  m.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {m.role === 'assistant' && (
                  <div className="shrink-0 mt-0.5">
                    <StatyMascot
                      variant="head"
                      expression={m.context?.emotion || 'happy'}
                      gesture="none"
                      size="xs"
                      interactive={false}
                    />
                  </div>
                )}

                <div
                  className={`max-w-[85%] sm:max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-[#2563EB] text-white'
                      : 'bg-[#F8FAFC] dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100'
                  }`}
                >
                  {m.attachments && m.attachments.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-2 text-xs opacity-90">
                      {m.attachments.map((att) => (
                        <span key={att.id} className="inline-flex items-center gap-1 underline">
                          <FileText className="w-3 h-3" />
                          {att.filename}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="whitespace-pre-wrap">{m.content}</div>

                  {m.context?.verifiedAnalysis && (
                    <div className="mt-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 text-xs space-y-1 text-slate-700 dark:text-slate-200">
                      <p className="font-bold text-[#173B75] dark:text-blue-300">
                        Verified Backend Computation: {m.context.verifiedAnalysis.procedure}
                      </p>
                      <p className="font-mono tabular-nums">
                        {m.context.verifiedAnalysis.testResults.statisticName} ={' '}
                        {m.context.verifiedAnalysis.testResults.statisticValue} (df ={' '}
                        {m.context.verifiedAnalysis.testResults.df}), p ={' '}
                        {m.context.verifiedAnalysis.testResults.pValue} ·{' '}
                        {m.context.verifiedAnalysis.effectSize.name} ={' '}
                        {m.context.verifiedAnalysis.effectSize.value}
                      </p>
                      <p>{m.context.verifiedAnalysis.testResults.decision}</p>
                    </div>
                  )}

                  {m.context?.actions && m.context.actions.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {m.context.actions.map((act, i) => (
                        <button
                          key={`${act.type}-${i}`}
                          type="button"
                          onClick={() => {
                            if (act.route) onNavigate?.(act.route, act.contextLabel);
                          }}
                          className="min-h-[32px] px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-[#2563EB] dark:text-blue-400 inline-flex items-center gap-1 hover:border-[#2563EB] cursor-pointer"
                        >
                          <span>{act.label}</span>
                          {act.route && <ArrowUpRight className="w-3 h-3" />}
                        </button>
                      ))}
                    </div>
                  )}

                  {m.role === 'assistant' && m.content && (
                    <div className="mt-2 flex items-center justify-end">
                      <button
                        type="button"
                        disabled={loadingSpeechId === m.id}
                        onClick={() => handleToggleSpeak(m.id, m.content)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-[#2563EB] dark:hover:text-blue-400 hover:bg-white/70 dark:hover:bg-slate-900/60 cursor-pointer"
                        aria-label={speakingMsgId === m.id ? 'Stop reading aloud' : 'Read reply aloud'}
                      >
                        {loadingSpeechId === m.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : speakingMsgId === m.id ? (
                          <VolumeX className="w-3.5 h-3.5 text-[#2563EB]" />
                        ) : (
                          <Volume2 className="w-3.5 h-3.5" />
                        )}
                        <span>{speakingMsgId === m.id ? 'Stop' : 'Listen'}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Live Real-Time Streaming Assistant Bubble */}
            {sending && (
              <div className="flex items-start gap-2.5 justify-start">
                <div className="shrink-0 mt-0.5">
                  <StatyMascot
                    variant="head"
                    expression={statyExpr}
                    gesture={statyGesture}
                    size="xs"
                    interactive={false}
                  />
                </div>
                <div className="max-w-[85%] sm:max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed bg-[#F8FAFC] dark:bg-slate-800 border border-blue-200 dark:border-blue-900/60 text-slate-800 dark:text-slate-100">
                  {streamingText ? (
                    <div className="whitespace-pre-wrap">
                      {streamingText}
                      <span className="inline-block w-1.5 h-4 ml-0.5 bg-[#2563EB] align-middle animate-pulse" />
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#2563EB]" />
                      <span>{liveStatus}</span>
                    </div>
                  )}

                  {streamingActions.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {streamingActions.map((act, i) => (
                        <span
                          key={`${act.type}-s-${i}`}
                          className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          {act.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Pending Attachments Confirmation */}
      {pendingAttachments.length > 0 && (
        <div className="border-t border-slate-200 dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-800/40 p-3 space-y-2.5 max-h-56 overflow-y-auto">
          {pendingAttachments.map((att, idx) => (
            <div
              key={`${att.storedName}-${idx}`}
              className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2.5 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {att.previewUrl ? (
                    <img
                      src={att.previewUrl}
                      alt={att.filename}
                      className="w-9 h-9 rounded-lg object-cover border border-slate-200"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950 text-[#2563EB] flex items-center justify-center">
                      {att.kind === 'image' ? <ImageIcon className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                      {att.filename}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {att.kind} · {(att.fileSize / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setPendingAttachments((prev) => prev.filter((_, i) => i !== idx))
                  }
                  className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                  aria-label="Remove attachment"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {att.requiresConfirmation && (
                <div className="space-y-1.5 pt-1">
                  <textarea
                    rows={2}
                    value={att.extractedText}
                    onChange={(e) => {
                      const val = e.target.value;
                      setPendingAttachments((prev) =>
                        prev.map((item, i) =>
                          i === idx ? { ...item, extractedText: val } : item,
                        ),
                      );
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setPendingAttachments((prev) =>
                        prev.map((item, i) =>
                          i === idx ? { ...item, confirmed: true } : item,
                        ),
                      )
                    }
                    className={`min-h-[32px] px-3 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
                      att.confirmed ? 'bg-emerald-600 text-white' : 'bg-[#2563EB] text-white'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{att.confirmed ? 'Confirmed' : 'Confirm Extracted Content'}</span>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Voice Recording Status Bar */}
      {(recording || transcribing) && (
        <div className="border-t border-blue-200 dark:border-blue-900/60 bg-blue-50/80 dark:bg-blue-950/30 px-4 py-2 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-[#173B75] dark:text-blue-200 font-semibold">
            {recording ? (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                <span className="tabular-nums">
                  Recording voice · {Math.floor(recordingSec / 60)}:
                  {String(recordingSec % 60).padStart(2, '0')}
                </span>
              </>
            ) : (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#2563EB]" />
                <span>Transcribing with STATY AI...</span>
              </>
            )}
          </div>
          {recording && (
            <button
              type="button"
              onClick={toggleMicRecording}
              className="px-2.5 py-1 rounded-lg bg-red-600 text-white font-semibold inline-flex items-center gap-1 cursor-pointer"
            >
              <Square className="w-3 h-3 fill-current" />
              <span>Stop & Transcribe</span>
            </button>
          )}
        </div>
      )}

      {/* Composer */}
      <form
        onSubmit={handleSend}
        className="border-t border-slate-200 dark:border-slate-800 p-3 flex items-end gap-2 bg-white dark:bg-slate-900"
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.csv,.xlsx,.xls,.png,.jpg,.jpeg"
          onChange={handleFileSelect}
          className="sr-only"
        />
        <button
          type="button"
          disabled={extracting || recording}
          onClick={() => fileInputRef.current?.click()}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer shrink-0"
          aria-label="Attach research document, dataset, or image"
        >
          {extracting ? (
            <Loader2 className="w-4 h-4 animate-spin text-[#2563EB]" />
          ) : (
            <Paperclip className="w-4 h-4" />
          )}
        </button>

        <button
          type="button"
          disabled={transcribing || sending}
          onClick={toggleMicRecording}
          className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border transition-colors cursor-pointer shrink-0 ${
            recording
              ? 'border-red-500 bg-red-600 text-white animate-pulse'
              : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50'
          }`}
          aria-label={recording ? 'Stop voice recording' : 'Record voice prompt'}
          title={recording ? 'Stop recording' : 'Speak to STATY'}
        >
          {transcribing ? (
            <Loader2 className="w-4 h-4 animate-spin text-[#2563EB]" />
          ) : recording ? (
            <Square className="w-4 h-4 fill-current" />
          ) : (
            <Mic className="w-4 h-4" />
          )}
        </button>

        <textarea
          rows={1}
          value={inputText}
          onChange={(e) => {
            setInputText(e.target.value);
            if (!sending && !recording) {
              if (e.target.value.trim()) {
                setStatyExpr('listening');
                setStatyGesture('ear-perk');
                setLiveStatus('STATY is listening...');
              } else {
                setStatyExpr('idle');
                setStatyGesture('none');
                setLiveStatus('STATY AI Assistant');
              }
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend(e);
            }
          }}
          placeholder="Ask STATY anything..."
          className="flex-1 min-h-[44px] max-h-28 px-3.5 py-2.5 leading-5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
        />

        <button
          type="submit"
          disabled={sending || extracting || transcribing || recording}
          className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-60 text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer shrink-0"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          <span className="hidden sm:inline">Send</span>
        </button>
      </form>

      {/* STATY In-App Microphone Permission Confirmation Modal (only triggered when clicking Mic in AI Chat) */}
      <AnimatePresence>
        {showMicPrompt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 14 }}
              transition={{ type: 'spring', stiffness: 380, damping: 26 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="mic-allow-title"
              className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl text-center"
            >
              <div className="flex justify-center mb-3">
                <StatyMascot
                  variant="head"
                  expression="listening"
                  gesture="ear-perk"
                  size="md"
                  interactive={false}
                />
              </div>
              <h3
                id="mic-allow-title"
                className="font-display text-lg font-bold text-[#173B75] dark:text-white"
              >
                Allow Microphone Access?
              </h3>
              <p className="mt-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                STATY would like to use your microphone so you can speak your research questions. Audio is recorded only while you tap record.
              </p>
              <div className="mt-5 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    playDrawerClose();
                    setShowMicPrompt(false);
                    setStatyExpr('idle');
                    setStatyGesture('none');
                  }}
                  className="min-h-[44px] flex-1 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Not Now
                </button>
                <button
                  type="button"
                  onClick={handleAllowMicrophone}
                  className="min-h-[44px] flex-1 px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Mic className="w-4 h-4" />
                  <span>Allow</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
