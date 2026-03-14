/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Send, 
  Sparkles, 
  ChevronRight, 
  CheckCircle2, 
  RotateCcw, 
  Copy, 
  Download, 
  Layout, 
  PenLine,
  ArrowLeft,
  Share2,
  User,
  X,
  Plus,
  Settings,
  BookOpen,
  FileText,
  Trash2,
  ExternalLink,
  Edit2,
  Check,
  Undo2,
  Square,
  Brain,
  ChevronDown,
  Lock,
  Upload,
  ImagePlus,
  Crop,
  Lightbulb,
  Search,
  Pencil,
  History
} from 'lucide-react';
import { WorkflowStage, Consensus, Message, AppState, ModelConfig, UserSettings, Article, Draft, SessionHistoryEntry, WritingStyleEntry, WRITING_WORKFLOW_STEPS, PlatformStrategy } from './types';
import {
  loadAppState,
  saveCurrentSession,
  saveDraftToDb,
  updateDraftTitleInDb,
  updateDraftCategoryInDb,
  deleteDraftInDb,
  addArticleToDb,
  deleteArticleInDb,
  setUserSettingsInDb,
  saveModelConfigInDb,
  deleteModelConfigInDb,
  getDraftWithMessages,
  generateResponseStream,
  generateOne,
  saveSessionHistoryToDb,
  getSessionHistoryFromDb,
  updateSessionHistoryTitleInDb,
  deleteSessionHistoryInDb,
  getWritingStylesFromDb,
  saveWritingStyleToDb,
  deleteWritingStyleInDb,
  isTauri,
} from './services/tauriApi';
import { COLORS, PLATFORMS, PUBLISH_DEFAULT_PLATFORMS, ALL_PUBLISH_PLATFORMS, DEFAULT_VISIBLE_PLATFORM_IDS, MORE_SUPPORT_OPTIONS } from './constants';
import { getPlatformExpert, getReviewChecklist, getCoverStyleHints, getCoverAspectRatio } from './platform-experts';
import { centerCropToAspect, cropImage, getCropSize } from './utils/coverCrop';
import { copyDraftToClipboard, markdownToHtmlSync } from './utils/markdown';
import * as Diff from 'diff';

function normalizeNewlines(s: string): string {
  return s.replace(/\\n/g, '\n');
}

/** 展示与上一版的差异（删除 / 新增） */
function DraftDiffView({ oldText, newText }: { oldText: string; newText: string }) {
  const oldN = normalizeNewlines(oldText || '');
  const newN = normalizeNewlines(newText || '');
  const changes = Diff.diffLines(oldN, newN);
  if (changes.every((c) => !c.added && !c.removed)) return null;
  return (
    <div className="rounded-2xl border border-line bg-background overflow-hidden">
      <div className="px-4 py-2 border-b border-line text-xs font-bold text-text-secondary uppercase tracking-wider">本次修改</div>
      <div className="p-4 text-sm leading-relaxed space-y-1 max-h-48 overflow-y-auto">
        {changes.map((part, i) => {
          if (part.added)
            return (
              <div key={i} className="bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 border-l-2 border-emerald-500 pl-2 py-0.5 whitespace-pre-wrap">
                {part.value}
              </div>
            );
          if (part.removed)
            return (
              <div key={i} className="bg-red-500/10 text-red-700 dark:text-red-300 border-l-2 border-red-400 pl-2 py-0.5 whitespace-pre-wrap line-through">
                {part.value}
              </div>
            );
          return null;
        })}
      </div>
    </div>
  );
}

/** 行内差异高亮：在当前稿上标出相对 baseline 的新增（下划线/绿）与删除（红/删除线） */
function DraftInlineDiffView({ baseline, current }: { baseline: string; current: string }) {
  const base = normalizeNewlines(baseline || '');
  const cur = normalizeNewlines(current || '');
  const changes = Diff.diffWords(base, cur);
  return (
    <div className="text-lg leading-relaxed whitespace-pre-wrap">
      {changes.map((part, i) => {
        if (part.removed)
          return (
            <span key={i} className="bg-red-500/15 text-red-700 dark:text-red-300 line-through decoration-2">
              {part.value}
            </span>
          );
        if (part.added)
          return (
            <span key={i} className="bg-red-500/15 text-red-700 dark:text-red-300 underline decoration-2 decoration-red-500">
              {part.value}
            </span>
          );
        return <span key={i}>{part.value}</span>;
      })}
    </div>
  );
}

function splitByParagraphs(text: string): string[] {
  const t = normalizeNewlines(text || '').trim();
  if (!t) return [];
  return t.split(/\n\n+/);
}

const BAILIAN_DEFAULT_ID = 'bailian-default';
const INITIAL_SETTINGS: UserSettings = {
  models: [
    {
      id: BAILIAN_DEFAULT_ID,
      name: '阿里百炼',
      provider: 'custom',
      apiKey: '',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      modelName: 'qwen-plus'
    }
  ],
  activeModelId: BAILIAN_DEFAULT_ID,
  writingStyle: '专业、简洁、富有启发性'
};

const INITIAL_STATE: AppState = {
  stage: 'landing',
  consensus: {},
  messages: [],
  draft: '',
  draftBaseline: '',
  versions: {},
  currentPlatform: 'wechat',
  userSettings: INITIAL_SETTINGS,
  articles: [],
  drafts: [],
  history: [],
  writingStyles: [],
  selectedStyleId: null,
  currentDraftId: null,
  composeFromDraftList: false,
};

const AutoTextArea = ({ value, onChange, onSend, placeholder, className, disabled, minHeight = 'auto', autoFocus = false }: any) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={className}
      disabled={disabled}
      autoFocus={autoFocus}
      rows={1}
      style={{ 
        overflowY: 'auto', 
        resize: 'none',
        minHeight: minHeight,
        maxHeight: '200px'
      }}
    />
  );
};

const ThoughtProcess = ({ thought, isLoading, isCurrentReply }: { thought: string; isLoading?: boolean; isCurrentReply?: boolean }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  useEffect(() => {
    if (isLoading) setIsExpanded(true);
  }, [isLoading]);

  const hasContent = !!(thought || isLoading);
  if (!hasContent && !isCurrentReply) return null;

  return (
    <div className="mb-4 bg-accent/5 border border-accent/10 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setIsExpanded((v) => !v)}
        className="w-full px-3 py-2 flex items-center justify-between text-[10px] text-accent font-medium hover:bg-accent/10 transition-colors cursor-pointer"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-2">
          <Brain size={12} className={isLoading ? "animate-pulse" : ""} />
          <span>{isLoading && !thought ? "正在思考..." : "思考过程"}</span>
        </div>
        <span className="text-[9px] text-text-secondary mr-1">{isExpanded ? "折叠" : "展开"}</span>
        <ChevronDown size={12} className={`shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
      </button>
      {isExpanded && (thought || isLoading) && (
        <div className="px-3 py-2 text-[10px] text-text-secondary leading-relaxed border-t border-accent/10 whitespace-pre-wrap font-mono max-h-32 overflow-y-auto">
          {thought ? normalizeNewlines(thought) : (isLoading ? <span className="animate-pulse">...</span> : null)}
        </div>
      )}
    </div>
  );
};

export default function App() {
  const [state, setState] = useState<AppState>(INITIAL_STATE);
  const [ready, setReady] = useState(!isTauri);

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'models' | 'style' | 'articles' | 'drafts' | 'history'>('history');
  const [sessionHistoryList, setSessionHistoryList] = useState<SessionHistoryEntry[]>([]);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [draftSaveFeedback, setDraftSaveFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [editingParagraphIndex, setEditingParagraphIndex] = useState<number | null>(null);
  const [editDraftValue, setEditDraftValue] = useState('');
  const [showDiffDetail, setShowDiffDetail] = useState(false);
  const [showConsensusPanel, setShowConsensusPanel] = useState(false);
  const [draftSearch, setDraftSearch] = useState('');
  const [articleSearch, setArticleSearch] = useState('');
  const [draftCategoryFilter, setDraftCategoryFilter] = useState<string>('全部');
  const [articleCategoryFilter, setArticleCategoryFilter] = useState<string>('全部');
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [editingDraftTitle, setEditingDraftTitle] = useState('');
  const [editingHistoryId, setEditingHistoryId] = useState<string | null>(null);
  const [editingHistoryTitle, setEditingHistoryTitle] = useState('');
  const [streamingThoughtBuffer, setStreamingThoughtBuffer] = useState('');
  const [editingStyle, setEditingStyle] = useState<WritingStyleEntry | null>(null);
  const [isGeneratingStyle, setIsGeneratingStyle] = useState(false);
  const [styleSelectOpen, setStyleSelectOpen] = useState(false);
  const [editingArticleId, setEditingArticleId] = useState<string | null>(null);
  const [editingArticleTitle, setEditingArticleTitle] = useState('');
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [savingModelId, setSavingModelId] = useState<string | null>(null);
  const [moreSupportOpen, setMoreSupportOpen] = useState(false);
  const [moreSupport, setMoreSupport] = useState<Record<string, boolean>>({ format: false, style: false, api: false });
  const [visibleTabPlatformIds, setVisibleTabPlatformIds] = useState<string[]>(DEFAULT_VISIBLE_PLATFORM_IDS);
  const [platformStrategies, setPlatformStrategies] = useState<Record<string, PlatformStrategy>>({});
  const [morePlatformPanelOpen, setMorePlatformPanelOpen] = useState(false);
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [originalCoverImageUrl, setOriginalCoverImageUrl] = useState<string | null>(null);
  const [coverConfigOpen, setCoverConfigOpen] = useState(false);
  const [coverCropModalOpen, setCoverCropModalOpen] = useState(false);
  const [confirmDeleteLanding, setConfirmDeleteLanding] = useState<{ type: 'draft' | 'chat' | 'article' | 'style'; id: string; title: string } | null>(null);
  const [cropSourceUrl, setCropSourceUrl] = useState<string | null>(null);
  const [cropImgSize, setCropImgSize] = useState<{ w: number; h: number } | null>(null);
  const [cropBoxOffset, setCropBoxOffset] = useState({ x: 0, y: 0 });
  const cropDragRef = useRef<{ startX: number; startY: number; startOffsetX: number; startOffsetY: number } | null>(null);
  const coverFileInputRef = useRef<HTMLInputElement>(null);
  const [reviewSuggestions, setReviewSuggestions] = useState<string[]>([]);
  const [statusBar, setStatusBarState] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const statusBarTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const editParagraphTextareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setStatusBar = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    if (statusBarTimeoutRef.current) clearTimeout(statusBarTimeoutRef.current);
    setStatusBarState({ text, type });
    statusBarTimeoutRef.current = setTimeout(() => {
      setStatusBarState(null);
      statusBarTimeoutRef.current = null;
    }, 3000);
  };

  useEffect(() => {
    if (!isTauri) return;
    loadAppState().then((loaded) => {
      if (loaded) {
        setState((prev) => ({
          ...prev,
          stage: loaded.stage as WorkflowStage,
          consensus: loaded.consensus,
          draft: loaded.draft,
          draftBaseline: loaded.draft ?? '',
          currentPlatform: loaded.currentPlatform,
          articles: loaded.articles,
          drafts: loaded.drafts,
          userSettings: loaded.userSettings,
          messages: loaded.messages ?? [],
          history: [],
          writingStyles: prev.writingStyles,
          selectedStyleId: prev.selectedStyleId,
        }));
      }
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!isTauri || !ready) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveCurrentSession(
        state.stage,
        state.consensus,
        state.draft,
        state.currentPlatform,
        state.messages.length,
        state.messages
      ).then(() => { saveTimeoutRef.current = null; });
    }, 500);
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [ready, state.stage, state.consensus, state.draft, state.currentPlatform, state.messages]);

  useEffect(() => {
    if (!isTauri || !ready) return;
    const t = setTimeout(() => {
      setUserSettingsInDb(state.userSettings.activeModelId, state.userSettings.writingStyle);
    }, 600);
    return () => clearTimeout(t);
  }, [ready, state.userSettings.activeModelId, state.userSettings.writingStyle]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (sidebarTab === 'history' && isSidebarOpen) {
      getSessionHistoryFromDb().then(setSessionHistoryList);
    }
  }, [sidebarTab, isSidebarOpen]);

  useEffect(() => {
    if (state.stage === 'landing' && isTauri) {
      getSessionHistoryFromDb().then(setSessionHistoryList);
    }
  }, [state.stage, isTauri]);

  useEffect(() => {
    if (isTauri && ready) {
      getWritingStylesFromDb().then((styles) => setState((prev) => ({ ...prev, writingStyles: styles })));
    }
  }, [ready]);

  useEffect(() => {
    if (state.stage !== 'conversation') return;
    const id = setTimeout(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      } else {
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
      }
    }, 150);
    return () => clearTimeout(id);
  }, [state.messages, state.stage]);

  useEffect(() => {
    const ta = editParagraphTextareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.max(ta.scrollHeight, 56)}px`;
  }, [editingParagraphIndex, editDraftValue]);

  const handleSend = async (text: string = input) => {
    if (!text.trim() || isLoading) return;

    if (text === '其他...') {
      setInput('关于这一点，我的想法是：');
      return;
    }

    // Save to history before sending
    const saveToHistory = () => {
      setState(prev => ({
        ...prev,
        history: [...prev.history, { 
          stage: prev.stage, 
          consensus: prev.consensus, 
          messages: prev.messages, 
          draft: prev.draft,
          currentPlatform: prev.currentPlatform
        }].slice(-15) // Keep last 15 steps for better undo
      }));
    };

    saveToHistory();

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      type: 'text'
    };

    const newMessages = [...state.messages, userMessage];
    const nextStage = state.stage === 'landing' ? 'conversation' : state.stage;
    setState(prev => ({ 
      ...prev, 
      messages: newMessages,
      stage: nextStage
    }));
    setInput('');
    setIsLoading(true);
    saveCurrentSession(nextStage, state.consensus, state.draft, state.currentPlatform, newMessages.length, newMessages);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const aiMessageId = (Date.now() + 1).toString();
    const history = newMessages.map(m => ({
      role: m.role === 'ai' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    try {
      setStreamingThoughtBuffer('');
      setState(prev => ({
        ...prev,
        messages: [...prev.messages, { id: aiMessageId, role: 'ai', content: '', thought: '' }]
      }));

      const activeModel = state.userSettings.models.find((m) => m.id === state.userSettings.activeModelId) ?? state.userSettings.models[0];
      if (!activeModel?.apiKey && isTauri) {
        setState(prev => {
          const nextMessages = prev.messages.map(m =>
            m.id === aiMessageId ? { ...m, content: '请在侧栏「模型配置」中添加模型并填写 API Key、Base URL（可选）和模型名。' } : m
          );
          queueMicrotask(() => saveCurrentSession(prev.stage, prev.consensus, prev.draft, prev.currentPlatform, nextMessages.length, nextMessages));
          return { ...prev, messages: nextMessages };
        });
        return;
      }
      const selectedStyle = state.selectedStyleId ? state.writingStyles.find((s) => s.id === state.selectedStyleId) : null;
      const writingStyleText = selectedStyle
        ? `【${selectedStyle.name}】作者定位：${selectedStyle.authorPositioning}。文风定位：${selectedStyle.stylePositioning}。惯用语：${selectedStyle.habitualPhrases}`
        : state.userSettings.writingStyle;
      await generateResponseStream(
        activeModel!,
        state.consensus,
        history,
        (chunk) => {
          if (!chunk.is_final && chunk.text) {
            setStreamingThoughtBuffer((prev) => prev + (chunk.text || ''));
            return;
          }
          if (chunk.is_final && chunk.full_response) {
            setStreamingThoughtBuffer('');
            const final = chunk.full_response;
            setState(prev => {
              const updatedConsensus = { ...prev.consensus, ...final.consensus };
              let nextStage = prev.stage;
              let nextDraft = prev.draft;
              if (final.draft) {
                nextDraft = final.draft;
                nextStage = 'compose';
              }
              const nextMessages = prev.messages.map(m =>
                m.id === aiMessageId
                  ? {
                      ...m,
                      content: final.content ?? '',
                      thought: final.thought ?? m.thought ?? '',
                      type: final.type as Message['type'],
                      options: final.options,
                      consensus: final.consensus,
                    }
                  : m
              );
              const nextState = {
                ...prev,
                messages: nextMessages,
                consensus: updatedConsensus,
                stage: nextStage as WorkflowStage,
                draft: nextDraft,
                draftBaseline: final.draft ? nextDraft : prev.draftBaseline,
                composeFromDraftList: false,
              };
              queueMicrotask(() => saveCurrentSession(nextState.stage, nextState.consensus, nextState.draft, nextState.currentPlatform, nextState.messages.length, nextState.messages));
              return nextState;
            });
          }
        },
        writingStyleText
      );
      
      if (controller.signal.aborted) return;
    } catch (error: unknown) {
      const err = error as { name?: string; message?: string };
      if (err?.name === 'AbortError') {
        console.log('AI Generation stopped by user');
      } else {
        const msg = err?.message ?? String(error);
        console.error('AI Error:', error);
        setState(prev => {
          const nextMessages = prev.messages.map(m =>
            m.id === aiMessageId ? { ...m, content: '请求失败：' + msg } : m
          );
          queueMicrotask(() => saveCurrentSession(prev.stage, prev.consensus, prev.draft, prev.currentPlatform, nextMessages.length, nextMessages));
          return { ...prev, messages: nextMessages };
        });
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
    }
  };

  const handleUndo = () => {
    if (state.history.length === 0) return;
    
    setState(prev => {
      const lastState = prev.history[prev.history.length - 1];
      const newHistory = prev.history.slice(0, -1);
      
      return {
        ...prev,
        ...lastState,
        history: newHistory
      } as AppState;
    });
  };

  const handlePolish = async (instruction: string) => {
    // Save to history
    setState(prev => ({
      ...prev,
      history: [...prev.history, { 
        stage: prev.stage, 
        consensus: prev.consensus, 
        messages: prev.messages, 
        draft: prev.draft,
        currentPlatform: prev.currentPlatform
      }].slice(-15)
    }));

    setIsLoading(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const activeModel = state.userSettings.models.find((m) => m.id === state.userSettings.activeModelId) ?? state.userSettings.models[0];
      if (!activeModel?.apiKey && isTauri) {
        console.error('请先配置模型 API Key');
        return;
      }
      const systemInstruction = `你是一个专业的文稿编辑。根据用户的修改指令修改稿件，保持风格一致。直接返回修改后的全文，不要其他解释。`;
      const messages: Array<{ role: string; content: string }> = [];
      const userContent = `当前稿件：\n${state.draft}\n\n修改指令：${instruction}\n\n当前共识：${JSON.stringify(state.consensus)}\n\n请根据指令修改稿件，保持风格一致。直接返回修改后的全文。`;
      const newDraft = await generateOne(activeModel!, systemInstruction, messages, userContent);
      if (controller.signal.aborted) return;
      setState(prev => ({
        ...prev,
        draft: newDraft,
        draftBaseline: newDraft,
        versions: { ...prev.versions, [Date.now()]: prev.draft }
      }));
    } catch (error: unknown) {
      const err = error as { name?: string; message?: string };
      if (err?.name === 'AbortError' || err?.message === 'AbortError') {
        console.log('Polish stopped by user');
      } else {
        console.error('Polish Error:', error);
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handlePlatformSwitch = async (platformId: string) => {
    if (platformId === state.currentPlatform) return;
    const available = ALL_PUBLISH_PLATFORMS.find(p => p.id === platformId)?.available ?? false;
    if (!available) return;

    // Save to history
    setState(prev => ({
      ...prev,
      history: [...prev.history, { 
        stage: prev.stage, 
        consensus: prev.consensus, 
        messages: prev.messages, 
        draft: prev.draft,
        currentPlatform: prev.currentPlatform
      }].slice(-15)
    }));

    setIsLoading(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const activeModel = state.userSettings.models.find((m) => m.id === state.userSettings.activeModelId) ?? state.userSettings.models[0];
      if (!activeModel?.apiKey && isTauri) {
        console.error('请先配置模型 API Key');
        return;
      }
      const platformName = PLATFORMS.find(p => p.id === platformId)?.name || platformId;
      const contentExpert = getPlatformExpert(platformId)?.content;
      const systemInstruction = contentExpert
        ? `${contentExpert.systemPrompt}\n\n改写时请遵循：\n${(contentExpert.rewriteGuidelines || []).map((g, i) => `${i + 1}. ${g}`).join('\n')}\n\n直接返回改写后的全文，不要其他解释。`
        : `你是一个专业的内容编辑。将稿件改写为适合目标平台「${platformName}」的风格和排版。直接返回改写后的全文，不要其他解释。`;
      const messages: Array<{ role: string; content: string }> = [];
      const userContent = `当前稿件：\n${state.draft}\n\n目标平台：${platformName}\n\n当前共识：${JSON.stringify(state.consensus)}\n\n请将稿件改写为适合该平台的风格和排版。直接返回改写后的全文。`;
      const rewrittenDraft = await generateOne(activeModel!, systemInstruction, messages, userContent);
      if (controller.signal.aborted) return;
      setState(prev => ({
        ...prev,
        currentPlatform: platformId,
        draft: rewrittenDraft,
        draftBaseline: rewrittenDraft,
        versions: { ...prev.versions, [Date.now()]: prev.draft }
      }));
    } catch (error: unknown) {
      const err = error as { name?: string; message?: string };
      if (err?.name === 'AbortError' || err?.message === 'AbortError') {
        console.log('Rewrite stopped by user');
      } else {
        console.error('Rewrite Error:', error);
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const nowLocale = () => new Date().toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });

  const saveDraft = async () => {
    const firstLine = (state.draft || '').trim().split(/\n/)[0]?.trim().slice(0, 40) || '';
    const title = (state.consensus.title || state.consensus.topic || firstLine || '未命名草稿').slice(0, 80);
    const now = nowLocale();
    const id = state.currentDraftId ?? `draft-${Date.now()}`;
    const newDraft: Draft = {
      id,
      title,
      stage: state.stage,
      lastUpdated: now,
      createdAt: state.currentDraftId ? (state.drafts.find(d => d.id === state.currentDraftId)?.createdAt ?? now) : now,
      category: '',
      consensus: state.consensus,
      messages: state.messages,
      content: state.draft
    };
    const result = await saveDraftToDb(newDraft);
    if (result.ok) {
      setState(prev => {
        const nextDrafts = prev.currentDraftId
          ? prev.drafts.map(d => d.id === prev.currentDraftId ? newDraft : d)
          : [newDraft, ...prev.drafts];
        return { ...prev, currentDraftId: id, drafts: nextDrafts };
      });
      setDraftSaveFeedback({ type: 'success', message: '已保存到草稿库' });
      setStatusBar('已保存到草稿库', 'success');
    } else {
      setDraftSaveFeedback({ type: 'error', message: result.error ?? '保存失败' });
      setStatusBar(result.error ?? '保存失败', 'error');
    }
    setTimeout(() => setDraftSaveFeedback(null), 3000);
  };

  const publishArticle = async () => {
    const newArticle: Article = {
      id: Date.now().toString(),
      title: state.consensus.title || '未命名文章',
      content: state.draft,
      category: '默认分类',
      platform: state.currentPlatform,
      publishDate: new Date().toLocaleString()
    };
    setState(prev => ({
      ...prev,
      articles: [newArticle, ...prev.articles]
    }));
    await addArticleToDb(newArticle);
    alert('已发布到文章库');
  };

  const loadDraft = async (draft: Draft) => {
    setState(prev => ({
      ...prev,
      history: [...prev.history, {
        stage: prev.stage,
        consensus: prev.consensus,
        messages: prev.messages,
        draft: prev.draft,
        currentPlatform: prev.currentPlatform
      }].slice(-15)
    }));
    if (isTauri) {
      const full = await getDraftWithMessages(draft.id);
      if (full) {
        setState(prev => ({
          ...prev,
          stage: full.stage,
          consensus: full.consensus,
          messages: full.messages,
          draft: full.content,
          draftBaseline: full.content,
          currentPlatform: 'wechat',
          currentDraftId: draft.id,
          composeFromDraftList: true
        }));
      } else {
        setState(prev => ({
          ...prev,
          stage: draft.stage,
          consensus: draft.consensus,
          messages: draft.messages,
          draft: draft.content,
          draftBaseline: draft.content,
          currentPlatform: 'wechat',
          currentDraftId: draft.id,
          composeFromDraftList: true
        }));
      }
    } else {
      setState(prev => ({
        ...prev,
        stage: draft.stage,
        consensus: draft.consensus,
        messages: draft.messages,
        draft: draft.content,
        draftBaseline: draft.content,
        currentDraftId: draft.id,
        currentPlatform: 'wechat',
        composeFromDraftList: true
      }));
    }
    setIsSidebarOpen(false);
  };

  const startEditing = (msg: Message) => {
    setEditingMessageId(msg.id);
    setEditingContent(msg.content);
  };

  const saveEdit = () => {
    if (!editingMessageId) return;
    
    // Save to history
    setState(prev => ({
      ...prev,
      history: [...prev.history, { 
        stage: prev.stage, 
        consensus: prev.consensus, 
        messages: prev.messages, 
        draft: prev.draft,
        currentPlatform: prev.currentPlatform
      }].slice(-15)
    }));

    setState(prev => ({
      ...prev,
      messages: prev.messages.map(m => 
        m.id === editingMessageId ? { ...m, content: editingContent } : m
      )
    }));
    setEditingMessageId(null);
    setEditingContent('');
  };

  const renderSidebar = () => (
    <AnimatePresence>
      {isSidebarOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 bottom-0 w-[400px] bg-surface shadow-2xl z-50 flex flex-col"
          >
            <div className="p-6 border-b border-line flex items-center justify-between">
              <h2 className="text-xl font-bold">个人中心</h2>
              <button onClick={() => setIsSidebarOpen(false)} className="p-2 hover:bg-background rounded-full">
                <X size={20} />
              </button>
            </div>

            <div className="flex border-b border-line">
              {[
                { id: 'history', icon: History, label: '历史' },
                { id: 'drafts', icon: FileText, label: '草稿' },
                { id: 'articles', icon: BookOpen, label: '文章' },
                { id: 'style', icon: PenLine, label: '写作风格' },
                { id: 'models', icon: Settings, label: '模型配置' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setSidebarTab(tab.id as any)}
                  className={`flex-1 py-4 flex flex-col items-center gap-1 transition-all border-b-2 ${
                    sidebarTab === tab.id ? 'border-accent text-accent' : 'border-transparent text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <tab.icon size={20} />
                  <span className="text-[10px] font-bold uppercase tracking-wider">{tab.label}</span>
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {sidebarTab === 'models' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold">模型列表</h3>
                    <button
                      className="p-1 text-accent hover:bg-accent/10 rounded"
                      onClick={() => {
                        const id = `model-${Date.now()}`;
                        const newModel: ModelConfig = { id, name: '新模型', provider: 'custom', apiKey: '', modelName: 'gpt-4o', baseUrl: undefined };
                        setState(prev => ({
                          ...prev,
                          userSettings: {
                            ...prev.userSettings,
                            models: [...prev.userSettings.models, newModel],
                            activeModelId: id,
                          },
                        }));
                        saveModelConfigInDb(newModel);
                        setEditingModelId(id);
                      }}
                    >
                      <Plus size={18} />
                    </button>
                  </div>
                  <div className="space-y-3">
                    {state.userSettings.models.map(model => (
                      <div key={model.id} className="p-4 rounded-xl border border-line bg-background relative group">
                        <div
                          className="flex items-center justify-between mb-2 cursor-pointer"
                          onClick={() => {
                            if (state.userSettings.activeModelId !== model.id) {
                              setState(prev => ({ ...prev, userSettings: { ...prev.userSettings, activeModelId: model.id } }));
                            } else {
                              setEditingModelId(editingModelId === model.id ? null : model.id);
                            }
                          }}
                        >
                          <span className="font-medium">{model.name}{state.userSettings.activeModelId === model.id ? ' (当前)' : ''}</span>
                          <span className="text-[10px] px-2 py-0.5 bg-accent/10 text-accent rounded-full uppercase font-bold">
                            {model.provider}
                          </span>
                        </div>
                        <div className="text-xs text-text-secondary truncate">{model.modelName}</div>
                        {editingModelId === model.id && (
                          <div className="mt-3 space-y-2 border-t border-line pt-3" onClick={e => e.stopPropagation()}>
                            <input
                              type="text"
                              placeholder="API Key"
                              value={model.apiKey}
                              onChange={e => setState(prev => ({
                                ...prev,
                                userSettings: {
                                  ...prev.userSettings,
                                  models: prev.userSettings.models.map(m => m.id === model.id ? { ...m, apiKey: e.target.value } : m),
                                },
                              }))}
                              className="w-full px-2 py-1 text-xs rounded border border-line bg-surface"
                            />
                            <input
                              type="text"
                              placeholder="Base URL (可选)"
                              value={model.baseUrl ?? ''}
                              onChange={e => setState(prev => ({
                                ...prev,
                                userSettings: {
                                  ...prev.userSettings,
                                  models: prev.userSettings.models.map(m => m.id === model.id ? { ...m, baseUrl: e.target.value || undefined } : m),
                                },
                              }))}
                              className="w-full px-2 py-1 text-xs rounded border border-line bg-surface"
                            />
                            <input
                              type="text"
                              placeholder="模型名"
                              value={model.modelName}
                              onChange={e => setState(prev => ({
                                ...prev,
                                userSettings: {
                                  ...prev.userSettings,
                                  models: prev.userSettings.models.map(m => m.id === model.id ? { ...m, modelName: e.target.value } : m),
                                },
                              }))}
                              className="w-full px-2 py-1 text-xs rounded border border-line bg-surface"
                            />
                            <button
                              type="button"
                              className="text-xs bg-accent text-white px-2 py-1 rounded disabled:opacity-60"
                              disabled={savingModelId === model.id}
                              onClick={async (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const cfg = state.userSettings.models.find(m => m.id === model.id);
                                if (!cfg) return;
                                setSavingModelId(model.id);
                                try {
                                  const res = await saveModelConfigInDb(cfg);
                                  if (res.ok) {
                                    setEditingModelId(null);
                                    alert('已保存');
                                  } else {
                                    alert('保存失败：' + (res.error ?? '未知错误'));
                                  }
                                } finally {
                                  setSavingModelId(null);
                                }
                              }}
                            >
                              {savingModelId === model.id ? '保存中...' : '保存'}
                            </button>
                          </div>
                        )}
                        <button
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 text-text-secondary hover:text-red-500"
                          onClick={e => { e.stopPropagation(); if (state.userSettings.models.length > 1) { setState(prev => ({ ...prev, userSettings: { ...prev.userSettings, models: prev.userSettings.models.filter(m => m.id !== model.id), activeModelId: prev.userSettings.activeModelId === model.id ? prev.userSettings.models[0]?.id ?? '' : prev.userSettings.activeModelId } })); deleteModelConfigInDb(model.id); } }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="p-4 rounded-xl bg-accent/5 border border-accent/20 text-xs text-accent">
                    默认已添加「阿里百炼」。点击卡片展开后填写 API Key（百炼控制台获取）、可修改 Base URL 和模型名（如 qwen-plus、qwen-max），保存即可。支持其他 OpenAI 兼容接口。
                  </div>
                </div>
              )}

              {sidebarTab === 'style' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold">写作风格管理</h3>
                    <button
                      type="button"
                      onClick={() => setEditingStyle({
                        id: `style-${Date.now()}`,
                        name: '',
                        authorPositioning: '',
                        stylePositioning: '',
                        habitualPhrases: '',
                      })}
                      className="p-1.5 rounded-lg border border-line hover:border-accent hover:text-accent text-text-secondary"
                      title="添加风格"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  <p className="text-xs text-text-secondary">支持作者定位、文风定位、惯用语等；聊天时可选择本次使用的风格。</p>
                  {editingStyle ? (
                    <div className="space-y-3 p-4 rounded-xl border border-line bg-background">
                      <input
                        value={editingStyle.name}
                        onChange={(e) => setEditingStyle((s) => s ? { ...s, name: e.target.value } : null)}
                        placeholder="风格名称，如：教程风格"
                        className="w-full px-3 py-2 rounded-lg border border-line bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-accent/20"
                      />
                      <div>
                        <label className="text-[10px] text-text-secondary uppercase tracking-wider">作者定位</label>
                        <textarea
                          value={editingStyle.authorPositioning}
                          onChange={(e) => setEditingStyle((s) => s ? { ...s, authorPositioning: e.target.value } : null)}
                          placeholder="如：知识分享者、步骤清晰、面向新手"
                          className="w-full mt-1 px-3 py-2 rounded-lg border border-line bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 min-h-[60px]"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-text-secondary uppercase tracking-wider">文风定位</label>
                        <textarea
                          value={editingStyle.stylePositioning}
                          onChange={(e) => setEditingStyle((s) => s ? { ...s, stylePositioning: e.target.value } : null)}
                          placeholder="如：条理分明、由浅入深、配示例与小结"
                          className="w-full mt-1 px-3 py-2 rounded-lg border border-line bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 min-h-[60px]"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-text-secondary uppercase tracking-wider">惯用语</label>
                        <input
                          value={editingStyle.habitualPhrases}
                          onChange={(e) => setEditingStyle((s) => s ? { ...s, habitualPhrases: e.target.value } : null)}
                          placeholder="逗号分隔，如：首先、其次、总结一下"
                          className="w-full mt-1 px-3 py-2 rounded-lg border border-line bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-accent/20"
                        />
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <button
                          type="button"
                          disabled={!editingStyle.name.trim() || isGeneratingStyle}
                          onClick={async () => {
                            if (!editingStyle?.name.trim()) return;
                            await saveWritingStyleToDb({ ...editingStyle, id: editingStyle.id || `style-${Date.now()}` });
                            setState((prev) => {
                              const list = prev.writingStyles.filter((s) => s.id !== editingStyle.id);
                              const entry = { ...editingStyle, id: editingStyle.id || `style-${Date.now()}` };
                              return { ...prev, writingStyles: [entry, ...list] };
                            });
                            setEditingStyle(null);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium disabled:opacity-50"
                        >
                          保存
                        </button>
                        <button
                          type="button"
                          disabled={isGeneratingStyle}
                          onClick={async () => {
                            if (!editingStyle?.name.trim()) return;
                            setIsGeneratingStyle(true);
                            try {
                              const activeModel = state.userSettings.models.find((m) => m.id === state.userSettings.activeModelId) ?? state.userSettings.models[0];
                              if (activeModel?.apiKey && isTauri) {
                                const sys = '你是一个写作风格顾问。根据风格名称，生成一段用于指导 AI 写作的配置。只返回合法 JSON，不要其他文字。格式：{"authorPositioning":"作者定位一句话","stylePositioning":"文风定位一句话","habitualPhrases":"惯用语，逗号分隔"}';
                                const user = `风格名称：${editingStyle.name.trim()}`;
                                const res = await generateOne(activeModel, sys, [], user);
                                try {
                                  const start = res.indexOf('{');
                                  const end = res.lastIndexOf('}') + 1;
                                  const jsonStr = start >= 0 && end > start ? res.slice(start, end) : res;
                                  const parsed = JSON.parse(jsonStr);
                                  if (parsed.authorPositioning != null) setEditingStyle((s) => s ? { ...s, authorPositioning: parsed.authorPositioning || s.authorPositioning } : null);
                                  if (parsed.stylePositioning != null) setEditingStyle((s) => s ? { ...s, stylePositioning: parsed.stylePositioning || s.stylePositioning } : null);
                                  if (parsed.habitualPhrases != null) setEditingStyle((s) => s ? { ...s, habitualPhrases: typeof parsed.habitualPhrases === 'string' ? parsed.habitualPhrases : (parsed.habitualPhrases || []).join('、') } : null);
                                } catch (_) {}
                              }
                            } finally {
                              setIsGeneratingStyle(false);
                            }
                          }}
                          className="px-3 py-1.5 rounded-lg border border-line text-text-secondary text-xs hover:border-accent hover:text-accent disabled:opacity-50"
                        >
                          {isGeneratingStyle ? '生成中...' : 'AI 生成'}
                        </button>
                        <button type="button" onClick={() => setEditingStyle(null)} className="px-3 py-1.5 rounded-lg border border-line text-text-secondary text-xs hover:bg-background">
                          取消
                        </button>
                      </div>
                    </div>
                  ) : null}
                  <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                    {state.writingStyles.map((s) => (
                      <div key={s.id} className="p-3 rounded-xl border border-line bg-background group">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-sm truncate">{s.name || '未命名'}</span>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button type="button" onClick={() => setEditingStyle({ ...s })} className="p-1.5 rounded-lg border border-line hover:border-accent hover:text-accent" title="编辑"><Pencil size={12} /></button>
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmDeleteLanding({ type: 'style', id: s.id, title: s.name || '未命名风格' });
                              }}
                              className="p-1.5 rounded-lg border border-line hover:border-red-500 hover:text-red-500"
                              title="删除"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                        <p className="text-[10px] text-text-secondary mt-1 line-clamp-2">{s.authorPositioning || '—'}</p>
                      </div>
                    ))}
                    {state.writingStyles.length === 0 && !editingStyle && <p className="text-center text-text-secondary text-xs py-6">暂无风格，点击 + 添加</p>}
                  </div>
                </div>
              )}

              {sidebarTab === 'history' && (
                <div className="space-y-4">
                  <h3 className="font-bold">主题会话历史</h3>
                  <p className="text-xs text-text-secondary">最近 100 条，点击标题恢复；支持编辑标题与删除</p>
                  {sessionHistoryList.length === 0 ? (
                    <div className="text-center py-12 text-text-secondary text-sm">暂无历史会话</div>
                  ) : (
                    <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                      {sessionHistoryList.map((entry) => (
                        <div
                          key={entry.id}
                          className="p-3 rounded-xl border border-line bg-background hover:border-accent transition-all group"
                        >
                          <div className="flex items-start justify-between gap-2">
                            {editingHistoryId === entry.id ? (
                              <input
                                type="text"
                                value={editingHistoryTitle}
                                onChange={(e) => setEditingHistoryTitle(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    const t = editingHistoryTitle.trim() || entry.title;
                                    updateSessionHistoryTitleInDb(entry.id, t);
                                    setSessionHistoryList((prev) => prev.map((x) => (x.id === entry.id ? { ...x, title: t } : x)));
                                    setEditingHistoryId(null);
                                  }
                                  if (e.key === 'Escape') setEditingHistoryId(null);
                                }}
                                className="flex-1 min-w-0 px-2 py-1 rounded border border-line bg-background text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent/20"
                                autoFocus
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : (
                              <div
                                className="flex-1 min-w-0 cursor-pointer font-medium text-sm truncate"
                                onClick={() => {
                                  setState(prev => ({
                                    ...prev,
                                    stage: entry.stage,
                                    consensus: entry.consensus,
                                    messages: entry.messages,
                                    draft: entry.draft,
                                    draftBaseline: entry.draft,
                                  }));
                                  setIsSidebarOpen(false);
                                }}
                              >
                                {entry.title}
                              </div>
                            )}
                            <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                              {editingHistoryId === entry.id ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const t = editingHistoryTitle.trim() || entry.title;
                                      updateSessionHistoryTitleInDb(entry.id, t);
                                      setSessionHistoryList((prev) => prev.map((x) => (x.id === entry.id ? { ...x, title: t } : x)));
                                      setEditingHistoryId(null);
                                    }}
                                    className="p-1.5 rounded-lg border border-line hover:border-accent hover:text-accent"
                                    title="保存"
                                  >
                                    <Check size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingHistoryId(null)}
                                    className="p-1.5 rounded-lg border border-line hover:border-accent"
                                    title="取消"
                                  >
                                    <X size={14} />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingHistoryId(entry.id);
                                      setEditingHistoryTitle(entry.title);
                                    }}
                                    className="p-1.5 rounded-lg border border-line hover:border-accent hover:text-accent"
                                    title="编辑标题"
                                  >
                                    <Pencil size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      e.preventDefault();
                                      setConfirmDeleteLanding({ type: 'chat', id: entry.id, title: entry.title || '未命名会话' });
                                    }}
                                    className="p-1.5 rounded-lg border border-line hover:border-red-500 hover:text-red-500"
                                    title="删除"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-text-secondary mt-1">
                            <span>阶段: {entry.stage}</span>
                            <span>{entry.createdAt}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {sidebarTab === 'articles' && (
                <div className="space-y-4">
                  <h3 className="font-bold">文章库</h3>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
                    <input
                      type="text"
                      value={articleSearch}
                      onChange={(e) => setArticleSearch(e.target.value)}
                      placeholder="按标题搜索"
                      className="w-full pl-9 pr-3 py-2 rounded-lg border border-line bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/20"
                    />
                  </div>
                  <select
                    value={articleCategoryFilter}
                    onChange={(e) => setArticleCategoryFilter(e.target.value)}
                    className="w-full py-2 rounded-lg border border-line bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/20"
                  >
                    <option value="全部">全部分类</option>
                    <option value="未分类">未分类</option>
                    {[...new Set(state.articles.map((a) => a.category).filter(Boolean))].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  {state.articles.filter((a) => {
                    const matchSearch = !articleSearch.trim() || a.title.includes(articleSearch.trim());
                    const matchCat = articleCategoryFilter === '全部' || (articleCategoryFilter === '未分类' ? !a.category : a.category === articleCategoryFilter);
                    return matchSearch && matchCat;
                  }).length === 0 ? (
                    <div className="text-center py-12 text-text-secondary text-sm">暂无已发布文章</div>
                  ) : (
                    <div className="space-y-3">
                      {state.articles
                        .filter((a) => {
                          const matchSearch = !articleSearch.trim() || a.title.includes(articleSearch.trim());
                          const matchCat = articleCategoryFilter === '全部' || (articleCategoryFilter === '未分类' ? !a.category : a.category === articleCategoryFilter);
                          return matchSearch && matchCat;
                        })
                        .map((article) => (
                        <div
                          key={article.id}
                          className="p-4 rounded-xl border border-line bg-background hover:border-accent transition-all group"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-medium mb-1 flex-1 min-w-0">{article.title}</div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                setConfirmDeleteLanding({ type: 'article', id: article.id, title: article.title || '未命名文章' });
                              }}
                              className="p-1.5 rounded-lg border border-line hover:bg-red-500/20 hover:border-red-500 text-red-600 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                              title="删除"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-text-secondary">
                            <span>{article.publishDate}</span>
                            <span className="px-2 py-0.5 bg-line rounded-full">{article.platform}</span>
                          </div>
                          {article.category && (
                            <div className="mt-1 text-[10px] text-text-secondary">分类: {article.category}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {sidebarTab === 'drafts' && (
                <div className="space-y-4">
                  <h3 className="font-bold">草稿库</h3>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
                    <input
                      type="text"
                      value={draftSearch}
                      onChange={(e) => setDraftSearch(e.target.value)}
                      placeholder="按标题搜索"
                      className="w-full pl-9 pr-3 py-2 rounded-lg border border-line bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/20"
                    />
                  </div>
                  <select
                    value={draftCategoryFilter}
                    onChange={(e) => setDraftCategoryFilter(e.target.value)}
                    className="w-full py-2 rounded-lg border border-line bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/20"
                  >
                    <option value="全部">全部分类</option>
                    <option value="未分类">未分类</option>
                    {[...new Set(state.drafts.map((d) => d.category).filter(Boolean))].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  {state.drafts.filter((d) => {
                    const matchSearch = !draftSearch.trim() || d.title.includes(draftSearch.trim());
                    const matchCat = draftCategoryFilter === '全部' || (draftCategoryFilter === '未分类' ? !d.category : d.category === draftCategoryFilter);
                    return matchSearch && matchCat;
                  }).length === 0 ? (
                    <div className="text-center py-12 text-text-secondary text-sm">暂无草稿</div>
                  ) : (
                    <div className="space-y-3">
                      {state.drafts
                        .filter((d) => {
                          const matchSearch = !draftSearch.trim() || d.title.includes(draftSearch.trim());
                          const matchCat = draftCategoryFilter === '全部' || (draftCategoryFilter === '未分类' ? !d.category : d.category === draftCategoryFilter);
                          return matchSearch && matchCat;
                        })
                        .map((draft) => (
                        <div
                          key={draft.id}
                          className="p-4 rounded-xl border border-line bg-background hover:border-accent transition-all group"
                        >
                          <div className="flex items-start justify-between gap-2">
                            {editingDraftId === draft.id ? (
                              <input
                                type="text"
                                value={editingDraftTitle}
                                onChange={(e) => setEditingDraftTitle(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    const t = editingDraftTitle.trim() || draft.title;
                                    setState(prev => ({
                                      ...prev,
                                      drafts: prev.drafts.map((x) => (x.id === draft.id ? { ...x, title: t, lastUpdated: nowLocale() } : x)),
                                    }));
                                    updateDraftTitleInDb(draft.id, t);
                                    setEditingDraftId(null);
                                  }
                                  if (e.key === 'Escape') setEditingDraftId(null);
                                }}
                                className="flex-1 min-w-0 px-2 py-1 rounded border border-line bg-background text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent/20"
                                autoFocus
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : (
                              <div
                                className="flex-1 min-w-0 cursor-pointer font-medium mb-1"
                                onClick={() => loadDraft(draft)}
                              >
                                {draft.title}
                              </div>
                            )}
                            <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                              {editingDraftId === draft.id ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const t = editingDraftTitle.trim() || draft.title;
                                    setState(prev => ({
                                      ...prev,
                                      drafts: prev.drafts.map((x) => (x.id === draft.id ? { ...x, title: t, lastUpdated: nowLocale() } : x)),
                                    }));
                                    updateDraftTitleInDb(draft.id, t);
                                    setEditingDraftId(null);
                                  }}
                                  className="p-1.5 rounded-lg hover:bg-accent/20 text-accent"
                                >
                                  <Check size={14} />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingDraftId(draft.id);
                                    setEditingDraftTitle(draft.title);
                                  }}
                                  className="p-1.5 rounded-lg hover:bg-background text-text-secondary"
                                  title="编辑标题"
                                >
                                  <Pencil size={14} />
                                </button>
                              )}
                              {editingDraftId !== draft.id && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    setConfirmDeleteLanding({ type: 'draft', id: draft.id, title: draft.title || '未命名草稿' });
                                  }}
                                  className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-600"
                                  title="删除"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-text-secondary mt-1">
                            <span className="flex items-center gap-1">
                              <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                              阶段: {draft.stage}
                            </span>
                            <span title={`新建: ${draft.createdAt ?? '-'}\n修改: ${draft.lastUpdated}`}>{draft.lastUpdated}</span>
                          </div>
                          {draft.createdAt && draft.createdAt !== draft.lastUpdated && (
                            <div className="text-[10px] text-text-secondary mt-0.5">新建: {draft.createdAt}</div>
                          )}
                          <div className="mt-1 flex items-center gap-1">
                              <span className="text-[10px] text-text-secondary shrink-0">分类:</span>
                              <input
                                type="text"
                                value={draft.category ?? ''}
                                onChange={(e) => {
                                  const v = e.target.value.trim();
                                  setState(prev => ({
                                    ...prev,
                                    drafts: prev.drafts.map((x) => (x.id === draft.id ? { ...x, category: v } : x)),
                                  }));
                                  updateDraftCategoryInDb(draft.id, v);
                                }}
                                placeholder="未分类"
                                className="flex-1 min-w-0 text-[10px] px-1.5 py-0.5 rounded border border-line/50 bg-background focus:outline-none focus:ring-1 focus:ring-accent/20"
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  const recentDrafts = state.drafts.slice(0, 5);
  const recentChats = sessionHistoryList.slice(0, 5);
  const hasRecentEntries = recentDrafts.length > 0 || recentChats.length > 0;

  const renderLanding = () => (
    <div className="flex flex-col min-h-screen pt-16">
      <section
        className="flex flex-col items-center justify-center px-4 text-center flex-shrink-0"
        style={{ minHeight: 'calc(100dvh - 64px)' }}
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-3xl mx-auto flex flex-col justify-center"
        >
          <div className="flex flex-col items-center mb-10">
            <div className="flex items-center justify-center gap-3 mb-3">
              <img src="/wensi-logo.svg" alt="文思如流 Logo" className="w-12 h-12 md:w-14 md:h-14 drop-shadow-sm" />
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-text-primary">文思AI写作</h1>
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-accent/20 bg-accent/5 text-accent text-xs font-medium mb-2">
              <Sparkles size={12} />
              <span>文思如流 · AI 心流写作</span>
            </div>
            <p className="text-sm text-text-secondary/90">用聊天梳理思路，用 AI 共创成文</p>
          </div>
          
          <div className="flex flex-wrap justify-center gap-4 mb-10">
            {['写感悟', '写干货', '写教程', '写推广', '随便聊聊'].map((tag) => (
              <button
                key={tag}
                onClick={() => handleSend(tag)}
                className="px-6 py-3 rounded-full bg-surface border border-line hover:border-accent hover:text-accent transition-all text-sm font-medium"
              >
                {tag}
              </button>
            ))}
          </div>

          <div className="w-full max-w-2xl mx-auto relative">
            <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex gap-2 z-10">
              {state.history.length > 0 && (
                <button
                  onClick={handleUndo}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface border border-line text-text-secondary hover:text-accent hover:border-accent transition-all text-xs"
                  title="回退到上一步"
                >
                  <Undo2 size={14} /> 回退
                </button>
              )}
            </div>
            <div className="relative rounded-2xl bg-surface border border-line shadow-sm focus-within:ring-2 focus-within:ring-accent/20 focus-within:border-accent transition-all min-h-[160px] flex flex-col">
              <AutoTextArea
                value={input}
                onChange={(e: any) => setInput(e.target.value)}
                onSend={() => handleSend()}
                placeholder="说一句你的想法，比如：“我想写 AI 如何帮助一人公司做内容”"
                className="w-full px-6 py-5 pr-16 rounded-2xl bg-transparent focus:outline-none text-lg placeholder:text-text-secondary/70 resize-none min-h-[140px]"
                disabled={isLoading}
                minHeight="140px"
              />
              <div className="absolute right-4 bottom-4 flex items-center gap-2">
                {isLoading ? (
                  <button
                    onClick={handleStop}
                    className="p-3 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-all"
                    title="停止生成"
                  >
                    <Square size={24} fill="currentColor" />
                  </button>
                ) : (
                  <button
                    onClick={() => handleSend()}
                    disabled={!input.trim()}
                    className="p-3 bg-accent text-white rounded-xl hover:opacity-90 disabled:opacity-50 transition-all"
                  >
                    <Send size={24} />
                  </button>
                )}
              </div>
            </div>
            <p className="mt-2 text-xs text-text-secondary text-center">输入想法或选择上方类型开始；支持多行输入</p>
          </div>
          {hasRecentEntries && (
            <p className="mt-8 text-xs text-text-secondary/80 text-center">下滑查看最近草稿与对话</p>
          )}
        </motion.div>
      </section>

      {hasRecentEntries && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 }}
            className="pt-8 pb-12 border-t border-line/60 w-full max-w-3xl mx-auto px-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 text-left">
              {recentDrafts.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <FileText size={16} className="text-accent shrink-0" />
                    <h3 className="text-sm font-semibold text-text-primary">最近草稿</h3>
                  </div>
                  <ul className="space-y-2">
                    {recentDrafts.map((draft) => (
                      <li key={draft.id}>
                        <div className="p-3 rounded-xl border border-line bg-background hover:border-accent transition-all group flex items-center gap-2">
                          {editingDraftId === draft.id ? (
                            <input
                              type="text"
                              value={editingDraftTitle}
                              onChange={(e) => setEditingDraftTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  const t = editingDraftTitle.trim() || draft.title;
                                  setState((prev) => ({
                                    ...prev,
                                    drafts: prev.drafts.map((x) => (x.id === draft.id ? { ...x, title: t, lastUpdated: nowLocale() } : x)),
                                  }));
                                  updateDraftTitleInDb(draft.id, t);
                                  setEditingDraftId(null);
                                }
                                if (e.key === 'Escape') setEditingDraftId(null);
                              }}
                              className="flex-1 min-w-0 px-2 py-1 rounded border border-line bg-background text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent/20"
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => loadDraft(draft)}
                              className="flex-1 min-w-0 text-left text-sm font-medium truncate hover:text-accent"
                              title={draft.title}
                            >
                              {draft.title || '未命名草稿'}
                            </button>
                          )}
                          <div className="flex items-center gap-1 shrink-0">
                            {editingDraftId === draft.id ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const t = editingDraftTitle.trim() || draft.title;
                                    setState((prev) => ({
                                      ...prev,
                                      drafts: prev.drafts.map((x) => (x.id === draft.id ? { ...x, title: t, lastUpdated: nowLocale() } : x)),
                                    }));
                                    updateDraftTitleInDb(draft.id, t);
                                    setEditingDraftId(null);
                                  }}
                                  className="p-1.5 rounded-lg border border-line hover:border-accent hover:text-accent"
                                  title="保存"
                                >
                                  <Check size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingDraftId(null)}
                                  className="p-1.5 rounded-lg border border-line hover:border-accent"
                                  title="取消"
                                >
                                  <X size={14} />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingDraftId(draft.id);
                                    setEditingDraftTitle(draft.title);
                                  }}
                                  className="p-1.5 rounded-lg border border-line hover:border-accent hover:text-accent"
                                  title="编辑标题"
                                >
                                  <Pencil size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirmDeleteLanding({ type: 'draft', id: draft.id, title: draft.title || '未命名草稿' });
                                  }}
                                  className="p-1.5 rounded-lg border border-line hover:border-red-500 hover:text-red-500"
                                  title="删除"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {recentChats.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <History size={16} className="text-accent shrink-0" />
                    <h3 className="text-sm font-semibold text-text-primary">最近聊天</h3>
                  </div>
                  <ul className="space-y-2">
                    {recentChats.map((entry) => (
                      <li key={entry.id}>
                        <div className="p-3 rounded-xl border border-line bg-background hover:border-accent transition-all group flex items-center gap-2">
                          {editingHistoryId === entry.id ? (
                            <input
                              type="text"
                              value={editingHistoryTitle}
                              onChange={(e) => setEditingHistoryTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  const t = editingHistoryTitle.trim() || entry.title;
                                  updateSessionHistoryTitleInDb(entry.id, t);
                                  setSessionHistoryList((prev) => prev.map((x) => (x.id === entry.id ? { ...x, title: t } : x)));
                                  setEditingHistoryId(null);
                                }
                                if (e.key === 'Escape') setEditingHistoryId(null);
                              }}
                              className="flex-1 min-w-0 px-2 py-1 rounded border border-line bg-background text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent/20"
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setState((prev) => ({
                                  ...prev,
                                  stage: entry.stage,
                                  consensus: entry.consensus,
                                  messages: entry.messages,
                                  draft: entry.draft,
                                  draftBaseline: entry.draft,
                                }));
                              }}
                              className="flex-1 min-w-0 text-left text-sm font-medium truncate hover:text-accent"
                              title={entry.title}
                            >
                              {entry.title || '未命名会话'}
                            </button>
                          )}
                          <div className="flex items-center gap-1 shrink-0">
                            {editingHistoryId === entry.id ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const t = editingHistoryTitle.trim() || entry.title;
                                    updateSessionHistoryTitleInDb(entry.id, t);
                                    setSessionHistoryList((prev) => prev.map((x) => (x.id === entry.id ? { ...x, title: t } : x)));
                                    setEditingHistoryId(null);
                                  }}
                                  className="p-1.5 rounded-lg border border-line hover:border-accent hover:text-accent"
                                  title="保存"
                                >
                                  <Check size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingHistoryId(null)}
                                  className="p-1.5 rounded-lg border border-line hover:border-accent"
                                  title="取消"
                                >
                                  <X size={14} />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingHistoryId(entry.id);
                                    setEditingHistoryTitle(entry.title);
                                  }}
                                  className="p-1.5 rounded-lg border border-line hover:border-accent hover:text-accent"
                                  title="编辑标题"
                                >
                                  <Pencil size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirmDeleteLanding({ type: 'chat', id: entry.id, title: entry.title || '未命名会话' });
                                  }}
                                  className="p-1.5 rounded-lg border border-line hover:border-red-500 hover:text-red-500"
                                  title="删除"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </motion.div>
        )}
    </div>
  );

  const renderConversation = () => (
    <div className="max-w-3xl mx-auto pt-20 pb-32 px-4">
      <div className="space-y-8">
        {state.messages.map((msg, index) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[85%] group relative ${msg.role === 'user' ? 'bg-accent text-white rounded-2xl p-4' : 'space-y-4'}`}>
              {msg.role === 'ai' && (
                <div className="relative">
                  <ThoughtProcess 
                    thought={isLoading && index === state.messages.length - 1 ? streamingThoughtBuffer : (msg.thought || '')} 
                    isLoading={isLoading && index === state.messages.length - 1}
                    isCurrentReply={index === state.messages.length - 1}
                  />
                  {editingMessageId === msg.id ? (
                    <div className="space-y-2">
                      <AutoTextArea
                        value={editingContent}
                        onChange={(e: any) => setEditingContent(e.target.value)}
                        onSend={saveEdit}
                        className="w-full p-3 rounded-xl bg-background border border-accent focus:outline-none text-text-primary text-lg leading-relaxed"
                        minHeight="100px"
                        autoFocus={true}
                      />
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setEditingMessageId(null)} className="px-3 py-1 text-xs text-text-secondary hover:text-text-primary">取消</button>
                        <button onClick={saveEdit} className="px-3 py-1 text-xs bg-accent text-white rounded-lg flex items-center gap-1">
                          <Check size={14} /> 保存
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="text-lg leading-relaxed text-text-primary whitespace-pre-wrap">
                        {isLoading && index === state.messages.length - 1 && !msg.content
                          ? <span className="text-text-secondary animate-pulse">正在生成...</span>
                          : normalizeNewlines(msg.content)}
                      </div>
                      <button 
                        onClick={() => startEditing(msg)}
                        className="absolute -right-8 top-0 p-1 opacity-0 group-hover:opacity-100 text-text-secondary hover:text-accent transition-all"
                        title="编辑回答"
                      >
                        <Edit2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              )}
              {msg.role === 'user' && (
                <div className="relative">
                  {editingMessageId === msg.id ? (
                    <div className="space-y-2">
                      <AutoTextArea
                        value={editingContent}
                        onChange={(e: any) => setEditingContent(e.target.value)}
                        onSend={saveEdit}
                        className="w-full p-2 rounded-lg bg-white/10 border border-white/20 focus:outline-none text-white text-sm"
                        minHeight="60px"
                        autoFocus={true}
                      />
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setEditingMessageId(null)} className="px-2 py-1 text-[10px] text-white/70 hover:text-white">取消</button>
                        <button onClick={saveEdit} className="px-2 py-1 text-[10px] bg-white text-accent rounded-md flex items-center gap-1">
                          <Check size={10} /> 保存
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {normalizeNewlines(msg.content)}
                      <button 
                        onClick={() => startEditing(msg)}
                        className="absolute -left-8 top-0 p-1 opacity-0 group-hover:opacity-100 text-white/50 hover:text-white transition-all"
                        title="编辑我的话"
                      >
                        <Edit2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              )}
              
              {msg.type === 'options' && msg.options && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {msg.options.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => handleSend(opt)}
                      className="px-4 py-2 rounded-xl bg-surface border border-line hover:border-accent hover:text-accent transition-all text-sm"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}

              {msg.consensus && (
                <div className="mt-6 p-4 rounded-2xl bg-surface border border-line border-l-4 border-l-accent">
                  <div className="text-xs font-bold text-accent uppercase tracking-wider mb-2">当前共识</div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {Object.entries(msg.consensus).map(([key, value]) => (
                      <div key={key}>
                        <div className="text-text-secondary text-xs mb-1">{key}</div>
                        <div className="font-medium">{Array.isArray(value) ? value.join(', ') : value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        ))}
        {state.draft.trim() && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-center mt-6"
          >
            <button
              onClick={() => setState(prev => ({ ...prev, stage: 'compose', composeFromDraftList: false }))}
              className="w-full max-w-md p-5 rounded-2xl border-2 border-accent/30 bg-surface hover:bg-accent/5 hover:border-accent transition-all text-left shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-accent/10">
                  <PenLine size={22} className="text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-text-primary">初稿已就绪</div>
                  <div className="text-sm text-text-secondary mt-0.5">进入润色与改稿，改写平台风格或保存为草稿</div>
                </div>
                <ChevronRight size={20} className="text-accent shrink-0" />
              </div>
            </button>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="fixed bottom-0 left-0 right-0 px-6 pt-6 pb-10 bg-gradient-to-t from-background via-background to-transparent">
        <div className="max-w-3xl mx-auto relative">
          <div className="absolute -top-10 left-0">
            {state.history.length > 0 && (
              <button
                onClick={handleUndo}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface border border-line text-text-secondary hover:text-accent hover:border-accent transition-all text-xs shadow-sm"
                title="回退到上一步"
              >
                <Undo2 size={14} /> 回退
              </button>
            )}
          </div>
          <AutoTextArea
            value={input}
            onChange={(e: any) => setInput(e.target.value)}
            onSend={() => handleSend()}
            placeholder="继续说你的想法..."
            className="w-full px-6 py-4 pr-16 rounded-2xl bg-surface border border-line shadow-lg focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
            disabled={isLoading}
          />
          <div className="absolute right-3 bottom-3 flex items-center gap-2">
            {isLoading ? (
              <button
                onClick={handleStop}
                className="p-2 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-all"
                title="停止生成"
              >
                <Square size={20} fill="currentColor" />
              </button>
            ) : (
              <button
                onClick={() => handleSend()}
                disabled={!input.trim()}
                className="p-2 bg-accent text-white rounded-xl hover:opacity-90 disabled:opacity-50 transition-all"
              >
                <Send size={20} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const renderCompose = () => (
    <div className="h-screen flex flex-col overflow-hidden pt-16">
      <div className="flex-1 min-h-0 flex flex-col max-w-6xl w-full mx-auto px-4 pb-4">
        <div className="flex-1 min-h-0 rounded-3xl border border-line bg-surface shadow-xl overflow-hidden flex flex-col">
          <div className="flex flex-1 min-h-0 flex-col md:flex-row">
      {/* Left Column: 不参与滚动，仅右侧预览区有滚动条 */}
      <div className="w-full md:w-1/3 md:max-w-sm border-b md:border-b-0 md:border-r border-line bg-surface flex flex-col shrink-0 overflow-hidden">
        <div className="p-4 border-b border-line flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <button onClick={() => setState(prev => ({ ...prev, stage: 'conversation', currentDraftId: null }))} className="p-2 hover:bg-background rounded-lg text-text-secondary" title="返回对话">
              <ArrowLeft size={20} />
            </button>
            {state.history.length > 0 && (
              <button
                onClick={handleUndo}
                className="p-2 hover:bg-background rounded-lg text-text-secondary"
                title="回退"
              >
                <Undo2 size={20} />
              </button>
            )}
          </div>
          <span className="font-medium">润色与改稿</span>
          <div className="w-10" />
        </div>

        <div className="flex-1 min-h-0 flex flex-col overflow-y-auto">
          <div className="p-4 flex flex-col h-full gap-4">
            <div className="p-4 rounded-2xl bg-background border border-line shrink-0">
              <p className="text-sm text-text-secondary mb-4">
                {state.composeFromDraftList
                  ? '从草稿箱打开，可点击下方按钮或选择平台进行改写。'
                  : 'AI 建议：初稿已生成，你可以尝试以下润色动作：'}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {['太官方了', '更短一点', '更有观点', '更像公众号'].map(action => (
                  <button
                    key={action}
                    onClick={() => handlePolish(action)}
                    className="px-3 py-2 text-xs rounded-lg border border-line hover:border-accent hover:text-accent transition-all text-left"
                  >
                    {action}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-background border border-line shrink-0">
              <div className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-3">快捷改写</div>
              <div className="flex flex-wrap gap-2 items-center">
                {(visibleTabPlatformIds
                  .map(id => ALL_PUBLISH_PLATFORMS.find(p => p.id === id))
                  .filter((p): p is typeof ALL_PUBLISH_PLATFORMS[0] => !!p)
                ).map(p => (
                  <button
                    key={p.id}
                    onClick={() => p.available && handlePlatformSwitch(p.id)}
                    disabled={!p.available}
                    title={p.available ? undefined : '即将支持'}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all flex items-center gap-1 ${
                      !p.available
                        ? 'bg-surface border-line text-text-secondary cursor-not-allowed'
                        : state.currentPlatform === p.id
                          ? 'bg-accent text-white border-accent'
                          : 'bg-white border-line hover:border-accent'
                    }`}
                  >
                    {!p.available && <Lock size={10} />}
                    {p.name}
                  </button>
                ))}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setMorePlatformPanelOpen(o => !o)}
                    className="px-3 py-1.5 rounded-full text-xs font-medium border border-line bg-white hover:border-accent hover:text-accent transition-all flex items-center gap-1"
                    title="平台与策略设置"
                  >
                    <Settings size={10} />
                    更多
                  </button>
                  {morePlatformPanelOpen && (
                    <>
                      <div className="fixed inset-0 z-40" aria-hidden onClick={() => setMorePlatformPanelOpen(false)} />
                      <div className="absolute left-0 top-full mt-1 z-50 w-[280px] max-h-[70vh] overflow-y-auto rounded-xl border border-line bg-surface shadow-xl p-4 space-y-4">
                        <div className="text-xs font-bold text-text-secondary uppercase tracking-wider">展示在 Tab 栏</div>
                        <div className="space-y-2">
                          {ALL_PUBLISH_PLATFORMS.map(p => (
                            <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={visibleTabPlatformIds.includes(p.id)}
                                onChange={() => setVisibleTabPlatformIds(prev => prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id].sort((a, b) => ALL_PUBLISH_PLATFORMS.findIndex(x => x.id === a) - ALL_PUBLISH_PLATFORMS.findIndex(x => x.id === b)))}
                                className="rounded border-line text-accent"
                              />
                              <span className="text-sm">{p.name}</span>
                              {!p.available && <Lock size={10} className="text-text-secondary" />}
                            </label>
                          ))}
                        </div>
                        <div className="border-t border-line pt-3">
                          <div className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-3">各平台策略</div>
                          <div className="space-y-3">
                            {ALL_PUBLISH_PLATFORMS.map(p => {
                              const strat = platformStrategies[p.id] ?? { changeContent: true, adjustPreview: false };
                              return (
                                <div key={p.id} className="rounded-lg border border-line/60 p-2 bg-background/50">
                                  <div className="text-xs font-medium text-text-primary mb-2">{p.name}</div>
                                  <label className="flex items-center gap-2 cursor-pointer text-xs mb-1">
                                    <input
                                      type="checkbox"
                                      checked={strat.changeContent}
                                      onChange={() => setPlatformStrategies(prev => ({ ...prev, [p.id]: { ...(prev[p.id] ?? { changeContent: true, adjustPreview: false }), changeContent: !strat.changeContent } }))}
                                      className="rounded border-line text-accent"
                                    />
                                    是否改内容
                                  </label>
                                  <label className="flex items-center gap-2 cursor-pointer text-xs">
                                    <input
                                      type="checkbox"
                                      checked={strat.adjustPreview}
                                      onChange={() => setPlatformStrategies(prev => ({ ...prev, [p.id]: { ...(prev[p.id] ?? { changeContent: true, adjustPreview: false }), adjustPreview: !strat.adjustPreview } }))}
                                      className="rounded border-line text-accent"
                                    />
                                    调整预览
                                  </label>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-background border border-line shrink-0">
              <div className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-3">修改意见</div>
              <div className="relative">
                <AutoTextArea
                  value={input}
                  onChange={(e: any) => setInput(e.target.value)}
                  onSend={() => handlePolish(input)}
                  placeholder="输入修改意见，如：'把第一段写得更吸引人一些'..."
                  className="w-full px-4 py-3 pr-14 rounded-xl bg-surface border border-line focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent text-sm"
                  disabled={isLoading}
                  minHeight="80px"
                />
                <div className="absolute right-3 bottom-3 flex items-center gap-2">
                  {isLoading ? (
                    <button
                      onClick={handleStop}
                      className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all"
                      title="停止生成"
                    >
                      <Square size={18} fill="currentColor" />
                    </button>
                  ) : (
                    <button
                      onClick={() => handlePolish(input)}
                      disabled={!input.trim()}
                      className="p-2 bg-accent text-white rounded-lg hover:opacity-90 disabled:opacity-50"
                    >
                      <Sparkles size={18} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex-1 min-h-4" aria-hidden />
            <div className="shrink-0 pt-4 border-t border-line/50 space-y-2">
              <button 
                onClick={saveDraft}
                className="w-full py-3 rounded-2xl border border-line bg-background hover:border-accent hover:text-accent transition-all text-sm font-medium flex items-center justify-center gap-2"
              >
                <FileText size={18} />
                保存当前为草稿
              </button>
              {draftSaveFeedback && (
                <p className={`text-xs text-center ${draftSaveFeedback.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                  {draftSaveFeedback.type === 'success' ? draftSaveFeedback.message : `保存失败：${draftSaveFeedback.message}`}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Preview */}
      <div className="flex-1 min-w-0 bg-background overflow-y-auto p-12">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* 仅在没有本地编辑时展示「上一版 AI」差异；有本地编辑时用下方「查看修改前后」 */}
          {state.draft === state.draftBaseline && (() => {
            const versionKeys = Object.keys(state.versions).sort();
            const lastVersionKey = versionKeys[versionKeys.length - 1];
            const previousDraft = lastVersionKey ? state.versions[lastVersionKey] : '';
            return previousDraft && state.draft ? (
              <DraftDiffView oldText={previousDraft} newText={state.draft} />
            ) : null;
          })()}
        {/* 操作栏：置于显示块上方，避免遮挡正文 */}
        <div className="flex items-center justify-end gap-2 mb-4">
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowConsensusPanel((v) => !v)}
              className="p-2 hover:bg-surface rounded-lg border border-line text-text-secondary flex items-center gap-1.5"
              title="灵感来源、主题与结构"
            >
              <Lightbulb size={18} />
              <span className="text-sm">灵感与共识</span>
            </button>
            {showConsensusPanel && (
              <div className="absolute right-0 top-full mt-1 w-[340px] max-h-[70vh] overflow-y-auto rounded-xl border border-line bg-surface shadow-xl z-50 p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-line pb-2">
                  <span className="font-medium text-text-primary">写作创意工作流 · 共识</span>
                  <button type="button" onClick={() => setShowConsensusPanel(false)} className="p-1 rounded hover:bg-background text-text-secondary">
                    <X size={16} />
                  </button>
                </div>
                <p className="text-[11px] text-text-secondary">按流程维度逐步形成，可跳过某步</p>
                <div className="space-y-3 text-sm">
                  {WRITING_WORKFLOW_STEPS.filter((s) => s.key !== 'draft' && s.key !== 'publish').map((step) => {
                    const key = step.key as keyof Consensus;
                    const val = state.consensus[key];
                    const label = step.label;
                    if (key === 'inspirationPoints') {
                      const pts = (state.consensus.inspirationPoints || []) as string[];
                      const fallback = state.messages.find((m) => m.role === 'user')?.content?.trim();
                      return (
                        <div key={key}>
                          <div className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1">{label}</div>
                          <div className="text-text-primary rounded-lg bg-background p-3 border border-line/50">
                            {pts.length > 0 ? pts.map((p, i) => <div key={i} className="mb-1 last:mb-0">· {p}</div>) : fallback ? <div>· {fallback}</div> : '—'}
                          </div>
                        </div>
                      );
                    }
                    if (key === 'topic') {
                      return (
                        <div key={key}>
                          <div className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1">{label}</div>
                          <div className="text-text-primary rounded-lg bg-background p-3 border border-line/50">{state.consensus.topic || '—'}</div>
                        </div>
                      );
                    }
                    if (key === 'corePoints') {
                      const arr = (state.consensus.corePoints || []) as string[];
                      return (
                        <div key={key}>
                          <div className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1">{label}</div>
                          <ul className="list-disc pl-5 space-y-0.5 text-text-primary rounded-lg bg-background p-3 border border-line/50">
                            {arr.length ? arr.map((s, i) => <li key={i}>{s}</li>) : <li className="text-text-secondary">—</li>}
                          </ul>
                        </div>
                      );
                    }
                    if (key === 'goldenSentences') {
                      const arr = (state.consensus.goldenSentences || state.consensus.corePoints || []) as string[];
                      return (
                        <div key={key}>
                          <div className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1">{label}</div>
                          <ul className="list-none space-y-1.5 text-text-primary rounded-lg bg-background p-3 border border-line/50">
                            {arr.length ? arr.map((s, i) => <li key={i} className="border-l-2 border-accent/50 pl-2 italic text-[12px]">"{s}"</li>) : <li className="text-text-secondary">—</li>}
                          </ul>
                        </div>
                      );
                    }
                    if (key === 'title') {
                      return (
                        <div key={key}>
                          <div className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1">{label}</div>
                          <div className="text-text-primary rounded-lg bg-background p-3 border border-line/50 font-medium">{state.consensus.title || '—'}</div>
                        </div>
                      );
                    }
                    if (key === 'outline') {
                      const arr = (state.consensus.outline || []) as string[];
                      return (
                        <div key={key}>
                          <div className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1">{label}</div>
                          <ul className="list-disc pl-5 space-y-0.5 text-text-primary rounded-lg bg-background p-3 border border-line/50">
                            {arr.length ? arr.map((item, i) => <li key={i}>{item}</li>) : <li className="text-text-secondary">—</li>}
                          </ul>
                        </div>
                      );
                    }
                    if (key === 'style') {
                      const style = state.consensus.style || state.userSettings?.writingStyle;
                      return (
                        <div key={key}>
                          <div className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1">{label}</div>
                          <div className="text-text-primary rounded-lg bg-background p-3 border border-line/50">{style || '—'}</div>
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
              </div>
            )}
          </div>
          <button
            onClick={async () => {
              const ok = await copyDraftToClipboard(state.draft);
              if (ok) {
                setCopyFeedback('已复制');
                setTimeout(() => setCopyFeedback(null), 2000);
              }
            }}
            className="p-2 hover:bg-surface rounded-lg border border-line text-text-secondary flex items-center gap-1.5"
            title="复制到剪贴板（富文本）"
          >
            <Copy size={18} />
            {copyFeedback && <span className="text-xs text-accent">{copyFeedback}</span>}
          </button>
          <button
            onClick={() => setState(prev => ({ ...prev, stage: 'publish' }))}
            className="p-2 bg-accent text-white rounded-lg hover:opacity-90 flex items-center gap-2 px-4"
          >
            <Share2 size={18} />
            <span className="text-sm font-medium">发布</span>
          </button>
        </div>

        <div className="bg-surface p-12 rounded-3xl shadow-sm border border-line min-h-[80vh] relative">
          <div className="markdown-body prose prose-stone max-w-none">
            {isLoading ? (
              <div className="flex items-center gap-2 py-8 text-[10px] text-text-secondary font-mono">
                <Brain size={14} className="animate-pulse shrink-0" />
                <span>正在根据您的修改意见生成新稿...</span>
              </div>
            ) : (() => {
              const draftParas = splitByParagraphs(state.draft).length ? splitByParagraphs(state.draft) : [''];
              const baselineParas = splitByParagraphs(state.draftBaseline ?? '');
              return (
                <div className="space-y-2">
                  {state.draft !== (state.draftBaseline ?? '') && (
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-background border border-line">
                      <span className="text-sm text-text-secondary">已修改</span>
                      <button type="button" onClick={() => setShowDiffDetail((v) => !v)} className="text-sm text-accent hover:underline">
                        {showDiffDetail ? '收起' : '查看全文差异'}
                      </button>
                      <button type="button" onClick={() => setState(prev => ({ ...prev, draftBaseline: prev.draft }))} className="text-sm text-accent hover:underline">
                        采纳为当前版本
                      </button>
                    </div>
                  )}
                  {showDiffDetail && state.draft !== (state.draftBaseline ?? '') && (
                    <div className="mb-6">
                      <DraftDiffView oldText={state.draftBaseline} newText={state.draft} />
                    </div>
                  )}
                  {!showDiffDetail && draftParas.map((para, i) => (
                    <div key={i} className="group relative rounded-xl border border-transparent hover:border-line/50 transition-colors">
                      {editingParagraphIndex === i ? (
                        <div className="space-y-2">
                          <textarea
                            ref={editParagraphTextareaRef}
                            value={editDraftValue}
                            onChange={(e) => setEditDraftValue(e.target.value)}
                            className="w-full min-h-0 p-3 rounded-lg border border-line bg-background text-text-primary text-base leading-relaxed focus:outline-none focus:ring-2 focus:ring-accent/20 resize-none overflow-hidden"
                            style={{ minHeight: '4em' }}
                            placeholder="本段内容..."
                            spellCheck
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                const next = [...draftParas];
                                next[i] = editDraftValue;
                                setState(prev => ({ ...prev, draft: next.join('\n\n').trimEnd() }));
                                setEditingParagraphIndex(null);
                              }}
                              className="px-3 py-1.5 rounded-lg bg-accent text-white text-sm"
                            >
                              完成
                            </button>
                            <button onClick={() => setEditingParagraphIndex(null)} className="px-3 py-1.5 rounded-lg border border-line text-text-secondary text-sm">
                              取消
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="text-lg leading-relaxed py-1 pr-8 min-h-[1.5em]">
                            {para.trim() ? (
                              (baselineParas[i] ?? '') !== para ? (
                                <DraftInlineDiffView baseline={baselineParas[i] ?? ''} current={para} />
                              ) : (
                                <div className="prose prose-stone max-w-none" dangerouslySetInnerHTML={{ __html: markdownToHtmlSync(normalizeNewlines(para)) }} />
                              )
                            ) : (
                              <span className="text-text-secondary">（空段）</span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => { setEditDraftValue(para); setEditingParagraphIndex(i); }}
                            className="absolute top-1 right-2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-background text-text-secondary transition-opacity"
                            title="编辑本段"
                          >
                            <Pencil size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                  {editingParagraphIndex === null && (
                    <button
                      type="button"
                      onClick={() => {
                        const base = (state.draft || '').trimEnd();
                        const newDraft = base ? base + '\n\n' : '';
                        setState(prev => ({ ...prev, draft: newDraft }));
                        const paras = splitByParagraphs(newDraft);
                        setEditingParagraphIndex(paras.length - 1);
                        setEditDraftValue('');
                      }}
                      className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-accent border border-dashed border-line hover:border-accent rounded-xl px-4 py-2 transition-colors"
                    >
                      <Plus size={16} /> 添加段落
                    </button>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
        </div>
      </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderPublish = () => (
    <div className="max-w-4xl mx-auto pt-16 px-4 pb-32">
      <div className="flex items-center space-x-4 mb-12">
        <button onClick={() => setState(prev => ({ ...prev, stage: 'compose' }))} className="p-2 hover:bg-surface rounded-lg text-text-secondary">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-3xl font-bold">发布准备</h1>
      </div>

      <div className="grid grid-cols-3 gap-8">
        <div className="col-span-2 flex flex-col min-h-0">
          <div className="bg-surface rounded-3xl border border-line overflow-hidden flex flex-col min-h-[60vh]">
            <div className="p-4 border-b border-line bg-background flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2 items-center">
                {(visibleTabPlatformIds
                  .map(id => ALL_PUBLISH_PLATFORMS.find(p => p.id === id))
                  .filter((p): p is typeof ALL_PUBLISH_PLATFORMS[0] => !!p)
                ).map(p => (
                  <button
                    key={p.id}
                    onClick={() => p.available && handlePlatformSwitch(p.id)}
                    disabled={!p.available}
                    title={p.available ? undefined : '即将支持'}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-1.5 ${
                      !p.available
                        ? 'bg-surface text-text-secondary cursor-not-allowed border border-line'
                        : state.currentPlatform === p.id
                          ? 'bg-accent text-white'
                          : 'hover:bg-surface border border-transparent'
                    }`}
                  >
                    {!p.available && <Lock size={14} />}
                    {p.name}
                  </button>
                ))}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setMorePlatformPanelOpen(o => !o)}
                    className="px-4 py-2 rounded-xl text-sm font-medium border border-line bg-surface hover:border-accent hover:text-accent transition-all flex items-center gap-1.5"
                    title="平台与策略设置"
                  >
                    <Settings size={14} />
                    更多
                  </button>
                  {morePlatformPanelOpen && (
                    <>
                      <div className="fixed inset-0 z-40" aria-hidden onClick={() => setMorePlatformPanelOpen(false)} />
                      <div className="absolute left-0 top-full mt-1 z-50 w-[300px] max-h-[70vh] overflow-y-auto rounded-xl border border-line bg-surface shadow-xl p-4 space-y-4">
                        <div className="text-xs font-bold text-text-secondary uppercase tracking-wider">展示在 Tab 栏</div>
                        <div className="space-y-2">
                          {ALL_PUBLISH_PLATFORMS.map(p => (
                            <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={visibleTabPlatformIds.includes(p.id)}
                                onChange={() => setVisibleTabPlatformIds(prev => prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id].sort((a, b) => ALL_PUBLISH_PLATFORMS.findIndex(x => x.id === a) - ALL_PUBLISH_PLATFORMS.findIndex(x => x.id === b)))}
                                className="rounded border-line text-accent"
                              />
                              <span className="text-sm">{p.name}</span>
                              {!p.available && <Lock size={10} className="text-text-secondary" />}
                            </label>
                          ))}
                        </div>
                        <div className="border-t border-line pt-3">
                          <div className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-3">各平台策略</div>
                          <div className="space-y-3">
                            {ALL_PUBLISH_PLATFORMS.map(p => {
                              const strat = platformStrategies[p.id] ?? { changeContent: true, adjustPreview: false };
                              return (
                                <div key={p.id} className="rounded-lg border border-line/60 p-2 bg-background/50">
                                  <div className="text-xs font-medium text-text-primary mb-2">{p.name}</div>
                                  <label className="flex items-center gap-2 cursor-pointer text-xs mb-1">
                                    <input type="checkbox" checked={strat.changeContent} onChange={() => setPlatformStrategies(prev => ({ ...prev, [p.id]: { ...(prev[p.id] ?? { changeContent: true, adjustPreview: false }), changeContent: !strat.changeContent } }))} className="rounded border-line text-accent" />
                                    是否改内容
                                  </label>
                                  <label className="flex items-center gap-2 cursor-pointer text-xs">
                                    <input type="checkbox" checked={strat.adjustPreview} onChange={() => setPlatformStrategies(prev => ({ ...prev, [p.id]: { ...(prev[p.id] ?? { changeContent: true, adjustPreview: false }), adjustPreview: !strat.adjustPreview } }))} className="rounded border-line text-accent" />
                                    调整预览
                                  </label>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={async () => {
                    const ok = await copyDraftToClipboard(state.draft);
                    if (ok) {
                      setCopyFeedback('已复制');
                      setTimeout(() => setCopyFeedback(null), 2000);
                    }
                  }}
                  className="text-accent text-sm font-medium flex items-center gap-1 p-2 rounded-lg hover:bg-surface"
                  title="复制到剪贴板（富文本）"
                >
                  <Copy size={16} />
                  <span>复制</span>
                  {copyFeedback && <span className="text-xs">({copyFeedback})</span>}
                </button>
                <button className="text-accent text-sm font-medium flex items-center space-x-1">
                  <Download size={16} />
                  <span>导出</span>
                </button>
              </div>
            </div>
            <div 
              className="markdown-body prose prose-stone max-w-none p-8 pb-16 flex-1 min-h-0 overflow-y-auto leading-relaxed"
              dangerouslySetInnerHTML={{ __html: markdownToHtmlSync(normalizeNewlines(state.draft)) || '<p class="text-text-secondary">暂无内容</p>' }}
            />
          </div>
        </div>

        <div className="space-y-6">
          <div className="p-6 rounded-3xl bg-surface border border-line">
            <button
              type="button"
              onClick={() => setMoreSupportOpen(o => !o)}
              className="w-full flex items-center justify-between font-bold mb-2"
            >
              <span>更多支持</span>
              <ChevronDown size={18} className={`text-text-secondary transition-transform ${moreSupportOpen ? 'rotate-180' : ''}`} />
            </button>
            <p className="text-xs text-text-secondary mb-3">勾选与参数仅本次有效，不保存</p>
            {moreSupportOpen && (
              <div className="space-y-3 pt-2 border-t border-line">
                {MORE_SUPPORT_OPTIONS.map(opt => (
                  <label key={opt.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!moreSupport[opt.id]}
                      onChange={() => setMoreSupport(prev => ({ ...prev, [opt.id]: !prev[opt.id] }))}
                      className="rounded border-line text-accent focus:ring-accent/20"
                    />
                    <span className="text-sm">{opt.name}</span>
                  </label>
                ))}
                {moreSupport.api && (
                  <div className="pl-6 text-xs text-text-secondary">
                    <p>官方接口 API 等参数后续开放</p>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="p-6 rounded-3xl bg-surface border border-line">
            <h3 className="font-bold mb-4 flex items-center space-x-2">
              <Layout size={18} className="text-accent" />
              <span>配图建议</span>
            </h3>
            <div className="space-y-3">
              <div className="relative p-3 rounded-xl bg-background border border-line text-xs">
                <div className="absolute top-2 right-2 flex items-center gap-1">
                  <button type="button" onClick={() => coverFileInputRef.current?.click()} className="p-1.5 rounded-lg border border-line hover:border-accent hover:text-accent transition-colors" title="上传封面">
                    <Upload size={14} />
                  </button>
                  <button type="button" onClick={() => {}} className="p-1.5 rounded-lg border border-line hover:border-accent hover:text-accent transition-colors" title="AI 生成封面">
                    <ImagePlus size={14} />
                  </button>
                  <button type="button" onClick={() => { setCropSourceUrl(originalCoverImageUrl || coverImageUrl); setCropImgSize(null); setCropBoxOffset({ x: 0, y: 0 }); setCoverCropModalOpen(true); }} disabled={!coverImageUrl} className="p-1.5 rounded-lg border border-line hover:border-accent hover:text-accent transition-colors disabled:opacity-50" title="裁剪封面">
                    <Crop size={14} />
                  </button>
                  <button type="button" onClick={() => setCoverConfigOpen(o => !o)} className="p-1.5 rounded-lg border border-line hover:border-accent hover:text-accent transition-colors" title="封面配置">
                    <Settings size={14} />
                  </button>
                </div>
                <input
                  ref={coverFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const dataUrl = await new Promise<string>((res, rej) => {
                      const r = new FileReader();
                      r.onload = () => res(r.result as string);
                      r.onerror = rej;
                      r.readAsDataURL(f);
                    });
                    setOriginalCoverImageUrl(dataUrl);
                    const { w, h } = getCoverAspectRatio(state.currentPlatform);
                    try {
                      const cropped = await centerCropToAspect(dataUrl, w, h);
                      setCoverImageUrl(cropped);
                    } catch {
                      setCoverImageUrl(dataUrl);
                    }
                    e.target.value = '';
                  }}
                />
                <div className="font-bold mb-1">封面图</div>
                {coverImageUrl ? <img src={coverImageUrl} alt="封面" className="mt-2 w-full max-h-32 object-cover rounded-lg" /> : <div className="text-text-secondary mt-1">{(getCoverStyleHints(state.currentPlatform) || ['极简风格'])[0]}：一张俯拍的干净桌面，放着一台笔记本电脑和一杯咖啡，色调偏暖。</div>}
                {coverConfigOpen && <div className="mt-3 pt-3 border-t border-line text-text-secondary text-[11px]">比例、风格等配置后续开放</div>}
              </div>
              <div className="p-3 rounded-xl bg-background border border-line text-xs">
                <div className="font-bold mb-1">内文插图</div>
                <div className="text-text-secondary">用简单的线条插画表现“一人公司”的自由感。</div>
              </div>
            </div>
          </div>

          <div className="p-6 rounded-3xl bg-surface border border-line">
            <h3 className="font-bold mb-4 flex items-center space-x-2">
              <CheckCircle2 size={18} className="text-accent" />
              <span>审核建议</span>
              {getPlatformExpert(state.currentPlatform) && <span className="text-xs font-normal text-text-secondary">（{getPlatformExpert(state.currentPlatform)!.platformName} 审核专家）</span>}
            </h3>
            <ul className="space-y-4 text-sm">
              {(reviewSuggestions.length ? reviewSuggestions : getReviewChecklist(state.currentPlatform) || ['表达风险：待评估', '事实待确认：待评估', '建议：根据正文修改']).map((line, i) => (
                <li key={i} className="flex items-start space-x-2">
                  <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${i === 0 ? 'bg-emerald-500' : i === 1 ? 'bg-amber-500' : 'bg-accent'}`} />
                  <span className="text-text-secondary">{line}</span>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => setState(prev => ({ ...prev, stage: 'compose' }))} className="mt-4 text-sm text-accent hover:underline">
              返回上一步进行修改指正
            </button>
          </div>

          <button 
            onClick={publishArticle}
            className="w-full py-4 bg-accent text-white rounded-2xl font-bold text-lg shadow-lg hover:opacity-90 transition-all"
          >
            立即发布
          </button>
          <p className="text-center text-xs text-text-secondary">
            点击发布将同步至个人文章库
          </p>
        </div>
      </div>

      {coverCropModalOpen && cropSourceUrl && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60" onClick={(e) => e.target === e.currentTarget && setCoverCropModalOpen(false)}>
          <div className="bg-surface rounded-2xl border border-line shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-line flex items-center justify-between">
              <span className="font-medium">裁剪封面（{getPlatformExpert(state.currentPlatform)?.platformName ?? state.currentPlatform} 比例）</span>
              <button type="button" onClick={() => setCoverCropModalOpen(false)} className="p-1 rounded hover:bg-background"><X size={18} /></button>
            </div>
            <div className="p-4 flex-1 min-h-0 overflow-auto flex justify-center">
              <div
                className="relative bg-background rounded-lg overflow-hidden"
                style={cropImgSize ? (() => {
                  const scale = Math.min(400 / cropImgSize.w, 400 / cropImgSize.h);
                  return { width: cropImgSize.w * scale, height: cropImgSize.h * scale };
                })() : { maxWidth: 400, maxHeight: 400 }}
                onMouseMove={(e) => {
                  if (!cropDragRef.current || !cropImgSize) return;
                  const scale = Math.min(400 / cropImgSize.w, 400 / cropImgSize.h);
                  const dx = (e.clientX - cropDragRef.current.startX) / scale;
                  const dy = (e.clientY - cropDragRef.current.startY) / scale;
                  const { w, h } = getCoverAspectRatio(state.currentPlatform);
                  const { w: cw, h: ch } = getCropSize(cropImgSize.w, cropImgSize.h, w, h);
                  const maxX = Math.max(0, cropImgSize.w - cw);
                  const maxY = Math.max(0, cropImgSize.h - ch);
                  setCropBoxOffset({
                    x: Math.max(0, Math.min(maxX, cropDragRef.current.startOffsetX + dx)),
                    y: Math.max(0, Math.min(maxY, cropDragRef.current.startOffsetY + dy)),
                  });
                }}
                onMouseUp={() => { cropDragRef.current = null; }}
                onMouseLeave={() => { cropDragRef.current = null; }}
              >
                <img
                  src={cropSourceUrl}
                  alt="裁剪"
                  className="block w-full h-full object-contain"
                  style={cropImgSize ? undefined : { maxWidth: 400, maxHeight: 360 }}
                  onLoad={(e) => {
                    const img = e.target as HTMLImageElement;
                    const nw = img.naturalWidth;
                    const nh = img.naturalHeight;
                    setCropImgSize({ w: nw, h: nh });
                    const { w, h } = getCoverAspectRatio(state.currentPlatform);
                    const { w: cw, h: ch } = getCropSize(nw, nh, w, h);
                    setCropBoxOffset({ x: (nw - cw) / 2, y: (nh - ch) / 2 });
                  }}
                />
                {cropImgSize && (
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      clipPath: (() => {
                        const { w, h } = getCoverAspectRatio(state.currentPlatform);
                        const { w: cw, h: ch } = getCropSize(cropImgSize.w, cropImgSize.h, w, h);
                        const scale = Math.min(400 / cropImgSize.w, 400 / cropImgSize.h);
                        const displayW = cropImgSize.w * scale;
                        const displayH = cropImgSize.h * scale;
                        const x = (cropBoxOffset.x / cropImgSize.w) * 100;
                        const y = (cropBoxOffset.y / cropImgSize.h) * 100;
                        const ww = (cw / cropImgSize.w) * 100;
                        const hh = (ch / cropImgSize.h) * 100;
                        return `polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ${x}% ${y}%, ${x + ww}% ${y}%, ${x + ww}% ${y + hh}%, ${x}% ${y + hh}%, ${x}% ${y}%)`;
                      })(),
                      background: 'rgba(0,0,0,0.5)',
                    }}
                  />
                )}
                {cropImgSize && (
                  <div
                    className="absolute border-2 border-white border-dashed pointer-events-auto cursor-move"
                    style={(() => {
                      const { w, h } = getCoverAspectRatio(state.currentPlatform);
                      const { w: cw, h: ch } = getCropSize(cropImgSize.w, cropImgSize.h, w, h);
                      const scale = Math.min(400 / cropImgSize.w, 400 / cropImgSize.h);
                      const displayW = cropImgSize.w * scale;
                      const displayH = cropImgSize.h * scale;
                      return {
                        left: (cropBoxOffset.x / cropImgSize.w) * displayW,
                        top: (cropBoxOffset.y / cropImgSize.h) * displayH,
                        width: (cw / cropImgSize.w) * displayW,
                        height: (ch / cropImgSize.h) * displayH,
                      };
                    })()}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      if (!cropImgSize) return;
                      cropDragRef.current = { startX: e.clientX, startY: e.clientY, startOffsetX: cropBoxOffset.x, startOffsetY: cropBoxOffset.y };
                    }}
                  />
                )}
              </div>
            </div>
            <div className="p-4 border-t border-line flex justify-end gap-2">
              <button type="button" onClick={() => setCoverCropModalOpen(false)} className="px-4 py-2 rounded-xl border border-line text-text-secondary hover:bg-background">取消</button>
              <button
                type="button"
                onClick={async () => {
                  if (!cropSourceUrl || !cropImgSize) return;
                  const { w, h } = getCoverAspectRatio(state.currentPlatform);
                  const { w: cw, h: ch } = getCropSize(cropImgSize.w, cropImgSize.h, w, h);
                  const x = Math.round(cropBoxOffset.x);
                  const y = Math.round(cropBoxOffset.y);
                  try {
                    const cropped = await cropImage(cropSourceUrl, x, y, cw, ch);
                    setCoverImageUrl(cropped);
                    setCoverCropModalOpen(false);
                  } catch (err) {
                    console.error(err);
                  }
                }}
                className="px-4 py-2 rounded-xl bg-accent text-white hover:opacity-90"
              >
                确定裁剪
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-text-primary selection:bg-accent/20">
      {/* Header: WENSI | 风格+工作流状态(对话时) | 个人中心 */}
      <header className="fixed top-0 left-0 right-0 h-16 flex items-center justify-between px-6 z-30 pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-4 min-w-0">
          {state.stage !== 'landing' && (
            <button 
              onClick={() => {
                const hasContent = state.messages.length > 0 || (state.draft || '').trim().length > 0;
                if (hasContent && isTauri) {
                  const title = state.consensus?.title || state.consensus?.topic || (state.messages.find(m => m.role === 'user')?.content?.trim().slice(0, 40)) || '未命名会话';
                  saveSessionHistoryToDb(Date.now().toString(), title, state.stage, state.consensus, state.draft, state.messages);
                }
                if (isTauri) {
                  saveCurrentSession('landing', {}, '', state.currentPlatform, 0, []);
                }
                setState(prev => ({ ...prev, stage: 'landing', messages: [], consensus: {}, draft: '', draftBaseline: '', history: [] }));
              }}
              className="text-xl font-bold tracking-tighter hover:opacity-70 transition-all shrink-0"
            >
              WENSI
            </button>
          )}
          {state.stage === 'conversation' && (
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="relative shrink-0" title="所选风格会带入写作提示词">
                <button
                  type="button"
                  onClick={() => setStyleSelectOpen((o) => !o)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-line/80 bg-surface/80 text-[11px] text-text-primary hover:border-accent/40 hover:bg-surface transition-colors"
                >
                  <span className="text-text-secondary">风格</span>
                  <span className="font-medium max-w-[72px] truncate">
                    {state.selectedStyleId ? (state.writingStyles.find((s) => s.id === state.selectedStyleId)?.name ?? '默认') : '默认'}
                  </span>
                  <ChevronDown size={11} className={`text-text-secondary transition-transform shrink-0 ${styleSelectOpen ? 'rotate-180' : ''}`} />
                </button>
                {styleSelectOpen && (
                  <>
                    <div className="fixed inset-0 z-40" aria-hidden onClick={() => setStyleSelectOpen(false)} />
                    <div
                      className="absolute left-0 top-full mt-1 z-50 min-w-[130px] max-h-[200px] overflow-y-auto overscroll-contain py-1 rounded-xl border border-line bg-surface shadow-lg [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-line/80 [&::-webkit-scrollbar-track]:bg-transparent"
                      style={{ WebkitOverflowScrolling: 'touch' }}
                      onWheel={(e) => e.stopPropagation()}
                    >
                      <button type="button" onClick={() => { setState((prev) => ({ ...prev, selectedStyleId: null })); setStyleSelectOpen(false); }} className={`w-full px-3 py-2 text-left text-[11px] transition-colors ${state.selectedStyleId === null ? 'bg-accent/10 text-accent font-medium' : 'text-text-primary hover:bg-background'}`}>默认</button>
                      {state.writingStyles.map((s) => (
                        <button key={s.id} type="button" onClick={() => { setState((prev) => ({ ...prev, selectedStyleId: s.id })); setStyleSelectOpen(false); }} className={`w-full px-3 py-2 text-left text-[11px] transition-colors truncate ${state.selectedStyleId === s.id ? 'bg-accent/10 text-accent font-medium' : 'text-text-primary hover:bg-background'}`}>{s.name}</button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-text-secondary overflow-x-auto max-w-[50vw] [&::-webkit-scrollbar]:h-0.5" title="写作工作流共识进度">
                {WRITING_WORKFLOW_STEPS.filter((s) => s.key !== 'draft' && s.key !== 'publish').map((step) => {
                  const key = step.key as keyof Consensus;
                  const filled = key === 'inspirationPoints' ? (state.consensus.inspirationPoints?.length ?? 0) > 0 || !!state.messages.find((m) => m.role === 'user')?.content?.trim() : key === 'topic' ? !!state.consensus.topic : key === 'corePoints' ? (state.consensus.corePoints?.length ?? 0) > 0 : key === 'goldenSentences' ? (state.consensus.goldenSentences?.length ?? state.consensus.corePoints?.length ?? 0) > 0 : key === 'title' ? !!state.consensus.title : key === 'outline' ? (state.consensus.outline?.length ?? 0) > 0 : key === 'style' ? !!(state.consensus.style || state.userSettings?.writingStyle) : false;
                  return <span key={key} className={`shrink-0 ${filled ? 'text-accent' : 'text-text-secondary/60'}`}>{filled ? '●' : '○'} {step.label}</span>;
                })}
              </div>
            </div>
          )}
        </div>
        <div className="pointer-events-auto shrink-0">
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 bg-surface border border-line rounded-full shadow-sm hover:border-accent hover:text-accent transition-all"
            title="个人中心"
          >
            <User size={20} />
          </button>
        </div>
      </header>

      {renderSidebar()}

      <AnimatePresence mode="wait">
        {state.stage === 'landing' && (
          <motion.div key="landing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {renderLanding()}
          </motion.div>
        )}
        {state.stage === 'conversation' && (
          <motion.div key="conversation" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {renderConversation()}
          </motion.div>
        )}
        {state.stage === 'compose' && (
          <motion.div key="compose" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {renderCompose()}
          </motion.div>
        )}
        {state.stage === 'publish' && (
          <motion.div key="publish" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {renderPublish()}
          </motion.div>
        )}
      </AnimatePresence>

      {confirmDeleteLanding && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60" onClick={(e) => e.target === e.currentTarget && setConfirmDeleteLanding(null)}>
          <div className="bg-surface rounded-2xl border border-line shadow-xl max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
            <p className="text-text-primary mb-1 font-medium">
              {confirmDeleteLanding.type === 'draft'
                ? '确定删除该草稿？'
                : confirmDeleteLanding.type === 'chat'
                  ? '确定删除这条历史会话？'
                  : confirmDeleteLanding.type === 'article'
                    ? '确定删除该文章？'
                    : '确定删除该风格？'}
            </p>
            <p className="text-sm text-text-secondary truncate mb-5" title={confirmDeleteLanding.title}>{confirmDeleteLanding.title}</p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmDeleteLanding(null)}
                className="px-4 py-2 rounded-xl border border-line text-text-secondary hover:bg-background"
              >
                取消
              </button>
              <button
                type="button"
                onClick={async () => {
                  const { type, id } = confirmDeleteLanding;
                  setConfirmDeleteLanding(null);
                  try {
                    if (type === 'draft') {
                      await deleteDraftInDb(id);
                      setState((prev) => ({ ...prev, drafts: prev.drafts.filter((x) => x.id !== id) }));
                    } else if (type === 'chat') {
                      await deleteSessionHistoryInDb(id);
                      setSessionHistoryList((prev) => prev.filter((x) => x.id !== id));
                    } else if (type === 'article') {
                      await deleteArticleInDb(id);
                      setState((prev) => ({ ...prev, articles: prev.articles.filter((x) => x.id !== id) }));
                    } else {
                      await deleteWritingStyleInDb(id);
                      setState((prev) => ({
                        ...prev,
                        writingStyles: prev.writingStyles.filter((x) => x.id !== id),
                        selectedStyleId: prev.selectedStyleId === id ? null : prev.selectedStyleId,
                      }));
                    }
                    setStatusBar('删除成功', 'success');
                  } catch (err) {
                    console.error(
                      type === 'draft'
                        ? 'deleteDraftInDb'
                        : type === 'chat'
                          ? 'deleteSessionHistoryInDb'
                          : type === 'article'
                            ? 'deleteArticleInDb'
                            : 'deleteWritingStyleInDb',
                      err
                    );
                    setStatusBar('删除失败', 'error');
                  }
                }}
                className="px-4 py-2 rounded-xl bg-red-500 text-white hover:bg-red-600"
              >
                确定删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 右下角透明状态栏：操作状态 + 字数等 */}
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 px-3 py-2 rounded-lg border border-line/60 bg-surface/80 backdrop-blur-sm text-xs text-text-secondary shadow-sm pointer-events-none">
        {(state.draft ?? '').trim() && (
          <span className="text-text-primary">
            字数 <span className="font-medium tabular-nums">{(state.draft || '').replace(/\s/g, '').length}</span>
          </span>
        )}
        {state.messages.length > 0 && (
          <span>会话 {state.messages.length} 条</span>
        )}
        {statusBar && (
          <span
            className={
              statusBar.type === 'success'
                ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                : statusBar.type === 'error'
                  ? 'text-red-600 dark:text-red-400 font-medium'
                  : 'text-text-primary'
            }
          >
            {statusBar.text}
          </span>
        )}
      </div>
    </div>
  );
}
