/**
 * Tauri backend API: SQLite + LLM (OpenAI-compatible).
 * Uses invoke and event when running inside Tauri; no-op when not.
 */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { Consensus, Message, ModelConfig, UserSettings, Article, Draft, SessionHistoryEntry, WritingStyleEntry } from '../types';

const isTauri = typeof window !== 'undefined' && (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;

function formatDraftTime(unixSec: number): string {
  try {
    return new Date(unixSec * 1000).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).replace(/\//g, '/');
  } catch {
    return String(unixSec);
  }
}

export interface StreamChunk {
  text?: string;
  thought?: string;
  is_final: boolean;
  full_response?: {
    thought?: string;
    content?: string;
    type?: string;
    options?: string[];
    consensus?: Partial<Consensus>;
    draft?: string;
  };
}

export async function loadAppState(): Promise<{
  stage: string;
  consensus: Consensus;
  draft: string;
  currentPlatform: string;
  messagesCount: number;
  messages: Message[];
  articles: Article[];
  drafts: Draft[];
  userSettings: UserSettings;
} | null> {
  if (!isTauri) return null;
  try {
    const [sessionRaw, articles, drafts, settings, modelConfigs] = await Promise.all([
      invoke<[string, string, string, string, number, string] | null>('db_get_current_session'),
      invoke<Array<{ id: string; title: string; content: string; category: string; platform: string; publish_date: string }>>('db_get_articles'),
      invoke<Array<{ id: string; title: string; stage: string; last_updated: string; consensus: string; content: string; created_at: number; category?: string }>>('db_get_drafts'),
      invoke<{ active_model_id: string; writing_style: string }>('db_get_user_settings'),
      invoke<Array<{ id: string; name: string; provider: string; api_key: string; base_url: string | null; model_name: string }>>('db_get_model_configs'),
    ]);
    const models: ModelConfig[] = (modelConfigs || []).map((m) => ({
      id: m.id,
      name: m.name,
      provider: m.provider as ModelConfig['provider'],
      apiKey: m.api_key,
      baseUrl: m.base_url ?? undefined,
      modelName: m.model_name,
    }));
    const userSettings: UserSettings = {
      activeModelId: (settings?.active_model_id?.trim() ?? '') || 'bailian-default',
      writingStyle: settings?.writing_style ?? '专业、简洁、富有启发性',
      models: models.length > 0 ? models : [{ id: 'bailian-default', name: '阿里百炼', provider: 'custom', apiKey: '', modelName: 'qwen-plus', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' }],
    };
    const art: Article[] = (articles || []).map((a) => ({
      id: a.id,
      title: a.title,
      content: a.content,
      category: a.category,
      platform: a.platform,
      publishDate: a.publish_date,
    }));
    const dr: Draft[] = (drafts || []).map((d) => ({
      id: d.id,
      title: d.title,
      stage: d.stage as Draft['stage'],
      lastUpdated: d.last_updated,
      createdAt: d.created_at != null ? formatDraftTime(d.created_at) : undefined,
      category: d.category ?? '',
      consensus: (() => {
        try {
          return JSON.parse(d.consensus || '{}') as Consensus;
        } catch {
          return {};
        }
      })(),
      messages: [],
      content: d.content,
    }));
    if (!sessionRaw || !Array.isArray(sessionRaw)) {
      return {
        stage: 'landing',
        consensus: {},
        draft: '',
        currentPlatform: 'wechat',
        messagesCount: 0,
        messages: [],
        articles: art,
        drafts: dr,
        userSettings,
      };
    }
    const [stage, consensusStr, draft, currentPlatform, messagesCount, messagesStr] = sessionRaw;
    let consensus: Consensus = {};
    try {
      consensus = JSON.parse(consensusStr || '{}');
    } catch {
      /* ignore */
    }
    let messages: Message[] = [];
    try {
      const parsed = JSON.parse(messagesStr || '[]');
      if (Array.isArray(parsed)) {
        messages = parsed.map((m: { id?: string; role?: string; content?: string; thought?: string; type?: string; options?: string[]; consensus?: unknown }) => ({
          id: String(m.id ?? ''),
          role: (m.role === 'ai' ? 'ai' : 'user') as 'user' | 'ai',
          content: String(m.content ?? ''),
          thought: m.thought,
          type: m.type as Message['type'],
          options: m.options,
          consensus: m.consensus as Partial<Consensus> | undefined,
        }));
      }
    } catch {
      /* ignore */
    }
    return {
      stage,
      consensus,
      draft,
      currentPlatform,
      messagesCount: Number(messagesCount),
      messages,
      articles: art,
      drafts: dr,
      userSettings,
    };
  } catch (e) {
    console.error('loadAppState', e);
    return null;
  }
}

export async function getDraftWithMessages(draftId: string): Promise<Draft | null> {
  if (!isTauri) return null;
  try {
    const raw = await invoke<[
      { id: string; title: string; stage: string; last_updated: string; consensus: string; content: string; created_at?: number; category?: string },
      Array<{ id: string; role: string; content: string; thought: string | null; type_: string | null; options: string | null; consensus: string | null; sort_order: number }>
    ] | null>('db_get_draft_with_messages', { draftId });
    if (!raw || !Array.isArray(raw)) return null;
    const [draft, messages] = raw;
    const msgs: Message[] = messages.map((m) => ({
      id: m.id,
      role: m.role as 'user' | 'ai',
      content: m.content,
      thought: m.thought ?? undefined,
      type: (m.type_ as Message['type']) ?? undefined,
      options: m.options ? JSON.parse(m.options) : undefined,
      consensus: m.consensus ? (JSON.parse(m.consensus) as Partial<Consensus>) : undefined,
    }));
    let consensus: Consensus = {};
    try {
      consensus = JSON.parse(draft.consensus || '{}');
    } catch {
      /* ignore */
    }
    return {
      id: draft.id,
      title: draft.title,
      stage: draft.stage as Draft['stage'],
      lastUpdated: draft.last_updated,
      createdAt: draft.created_at != null ? formatDraftTime(draft.created_at) : undefined,
      category: draft.category ?? '',
      consensus,
      messages: msgs,
      content: draft.content,
    };
  } catch (e) {
    console.error('getDraftWithMessages', e);
    return null;
  }
}

export async function saveCurrentSession(
  stage: string,
  consensus: Consensus,
  draft: string,
  currentPlatform: string,
  messagesCount: number,
  messages: Message[]
): Promise<void> {
  if (!isTauri) return;
  try {
    await invoke('db_save_current_session', {
      stage,
      consensus: JSON.stringify(consensus),
      draft,
      currentPlatform,
      messagesCount,
      messages: JSON.stringify(messages),
    });
  } catch (e) {
    console.error('saveCurrentSession', e);
  }
}

export async function saveDraftToDb(draft: Draft): Promise<{ ok: boolean; error?: string }> {
  if (!isTauri) return { ok: false, error: '非 Tauri 环境' };
  try {
    const messages = draft.messages.map((m, i) => [
      m.id,
      m.role,
      m.content,
      m.thought ?? null,
      m.type ?? null,
      m.options ? JSON.stringify(m.options) : null,
      m.consensus ? JSON.stringify(m.consensus) : null,
      i,
    ]);
    await invoke('db_save_draft', {
      id: draft.id,
      title: draft.title,
      stage: draft.stage,
      lastUpdated: draft.lastUpdated,
      consensus: JSON.stringify(draft.consensus),
      content: draft.content,
      category: draft.category ?? '',
      messages,
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('saveDraftToDb', e);
    return { ok: false, error: msg };
  }
}

export async function updateDraftTitleInDb(draftId: string, title: string): Promise<void> {
  if (!isTauri) return;
  try {
    const lastUpdated = new Date().toLocaleString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
    await invoke('db_update_draft_title', { id: draftId, title, lastUpdated });
  } catch (e) {
    console.error('updateDraftTitleInDb', e);
  }
}

export async function updateDraftCategoryInDb(draftId: string, category: string): Promise<void> {
  if (!isTauri) return;
  try {
    await invoke('db_update_draft_category', { id: draftId, category });
  } catch (e) {
    console.error('updateDraftCategoryInDb', e);
  }
}

export async function deleteDraftInDb(draftId: string): Promise<void> {
  if (!isTauri) return;
  try {
    await invoke('db_delete_draft', { id: draftId });
  } catch (e) {
    console.error('deleteDraftInDb', e);
  }
}

export async function saveSessionHistoryToDb(
  id: string,
  title: string,
  stage: string,
  consensus: Consensus,
  draft: string,
  messages: Message[],
): Promise<void> {
  if (!isTauri) return;
  try {
    await invoke('db_save_session_history', {
      id,
      title,
      stage,
      consensus: JSON.stringify(consensus),
      draft,
      messages: JSON.stringify(messages),
    });
  } catch (e) {
    console.error('saveSessionHistoryToDb', e);
  }
}

export async function getSessionHistoryFromDb(): Promise<SessionHistoryEntry[]> {
  if (!isTauri) return [];
  try {
    const rows = await invoke<Array<{
      id: string;
      title: string;
      stage: string;
      consensus: string;
      draft: string;
      messages: string;
      created_at: number;
    }>>('db_get_session_history');
    return (rows || []).map((r) => {
      let consensus: Consensus = {};
      let messages: Message[] = [];
      try {
        consensus = JSON.parse(r.consensus || '{}');
      } catch {
        /* ignore */
      }
      try {
        messages = JSON.parse(r.messages || '[]');
      } catch {
        /* ignore */
      }
      return {
        id: r.id,
        title: r.title,
        stage: r.stage as SessionHistoryEntry['stage'],
        consensus,
        draft: r.draft,
        messages,
        createdAt: formatDraftTime(r.created_at),
      };
    });
  } catch (e) {
    console.error('getSessionHistoryFromDb', e);
    return [];
  }
}

export async function updateSessionHistoryTitleInDb(id: string, title: string): Promise<void> {
  if (!isTauri) return;
  try {
    await invoke('db_update_session_history_title', { id, title });
  } catch (e) {
    console.error('updateSessionHistoryTitleInDb', e);
  }
}

export async function deleteSessionHistoryInDb(id: string): Promise<void> {
  if (!isTauri) return;
  try {
    await invoke('db_delete_session_history', { id });
  } catch (e) {
    console.error('deleteSessionHistoryInDb', e);
  }
}

export async function getWritingStylesFromDb(): Promise<WritingStyleEntry[]> {
  if (!isTauri) return [];
  try {
    const rows = await invoke<Array<{
      id: string;
      name: string;
      author_positioning: string;
      style_positioning: string;
      habitual_phrases: string;
    }>>('db_get_writing_styles');
    return (rows || []).map((r) => ({
      id: r.id,
      name: r.name,
      authorPositioning: r.author_positioning ?? '',
      stylePositioning: r.style_positioning ?? '',
      habitualPhrases: r.habitual_phrases ?? '',
    }));
  } catch (e) {
    console.error('getWritingStylesFromDb', e);
    return [];
  }
}

export async function saveWritingStyleToDb(style: WritingStyleEntry): Promise<void> {
  if (!isTauri) return;
  try {
    await invoke('db_save_writing_style', {
      id: style.id,
      name: style.name,
      author_positioning: style.authorPositioning,
      style_positioning: style.stylePositioning,
      habitual_phrases: style.habitualPhrases,
    });
  } catch (e) {
    console.error('saveWritingStyleToDb', e);
  }
}

export async function deleteWritingStyleInDb(id: string): Promise<void> {
  if (!isTauri) return;
  try {
    await invoke('db_delete_writing_style', { id });
  } catch (e) {
    console.error('deleteWritingStyleInDb', e);
  }
}

export async function addArticleToDb(article: Article): Promise<void> {
  if (!isTauri) return;
  try {
    await invoke('db_add_article', {
      id: article.id,
      title: article.title,
      content: article.content,
      category: article.category,
      platform: article.platform,
      publishDate: article.publishDate,
    });
  } catch (e) {
    console.error('addArticleToDb', e);
  }
}

export async function deleteArticleInDb(articleId: string): Promise<void> {
  if (!isTauri) return;
  try {
    await invoke('db_delete_article', { id: articleId });
  } catch (e) {
    console.error('deleteArticleInDb', e);
  }
}

export async function setUserSettingsInDb(activeModelId: string, writingStyle: string): Promise<void> {
  if (!isTauri) return;
  try {
    await invoke('db_set_user_settings', { activeModelId, writingStyle });
  } catch (e) {
    console.error('setUserSettingsInDb', e);
  }
}

export async function saveModelConfigInDb(config: ModelConfig): Promise<{ ok: boolean; error?: string }> {
  if (!isTauri) return { ok: false, error: '非 Tauri 环境' };
  try {
    await invoke('db_save_model_config', {
      id: config.id,
      name: config.name,
      provider: config.provider,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl ?? null,
      modelName: config.modelName,
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('saveModelConfigInDb', e);
    return { ok: false, error: msg };
  }
}

export async function deleteModelConfigInDb(id: string): Promise<void> {
  if (!isTauri) return;
  try {
    await invoke('db_delete_model_config', { id });
  } catch (e) {
    console.error('deleteModelConfigInDb', e);
  }
}

const WENSI_SYSTEM = `你是一个名为"文思"的 AI 写作合伙人。你按「写作创意工作流」引导用户，从启发点到可发布文章，逐步形成共识。用户可随时跳过某步或先填后面的维度。

写作工作流（共识维度，顺序建议但可跳过）：
1. 启发点：先聊天，明确灵感、动机、想写什么（consensus.inspirationPoints）。
2. 主题：确定一个主题（consensus.topic）。
3. 核心观点与金句：确定核心观点（consensus.corePoints）和要用的金句（consensus.goldenSentences）。
4. 爆款标题：一起探讨标题（consensus.title），可多轮打磨。
5. 文章结构：确定提纲/结构（consensus.outline）。
6. 写作风格：结合用户设定与你的推荐，确定风格（consensus.style），可选受众、平台（consensus.audience, consensus.platform）。
7. 初稿与润色：生成初稿（type: 'draft', 字段 draft），之后支持润色、改稿。
8. 发布：由用户在前台操作，你无需产出。

你的原则：
- 边问边产出，不要只提问；尽量提供选项减少打字。**提供选项（options）时必须在数组最后加"其他..."。**
- 根据当前共识状态，建议「下一步可填的维度」；若用户跳过某步或先填后面的，顺其自然，不强行拉回。
- 共识用 consensus 对象更新，可只更新本步相关字段（如只更新 title、或只更新 outline）。

当前用户选择的写作风格（请严格参考）：{{WRITING_STYLE}}

当前共识状态：{{CONSENSUS}}

请以 JSON 格式返回，包含：
- thought: 可选。1～3 句话推理，用于前台「思考过程」展示。
- content: 你对用户说的话。
- type: 'text' | 'options' | 'consensus' | 'draft'。
- options: 可选选项数组；若有则**必须包含"其他..."为最后一项**。
- consensus: 本步要写入的共识字段（可与现有共识合并，如 inspirationPoints, topic, corePoints, goldenSentences, title, outline, style, audience, platform）。
- draft: 仅当生成初稿时返回全文。`;

export async function generateResponseStream(
  config: ModelConfig,
  consensus: Consensus,
  history: Array<{ role: string; parts: Array<{ text: string }> }>,
  onChunk: (chunk: StreamChunk) => void,
  writingStyleText?: string
): Promise<StreamChunk['full_response']> {
  if (!isTauri) {
    onChunk({ is_final: true, full_response: { content: '请在 Tauri 桌面应用中配置模型后使用。', type: 'text' } });
    return { content: '请在 Tauri 桌面应用中配置模型后使用。', type: 'text' };
  }
  const eventName = `llm-stream-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const writingStyle = (writingStyleText || '').trim() || '无（按通用写作建议即可）';
  const systemInstruction = WENSI_SYSTEM.replace('{{WRITING_STYLE}}', writingStyle).replace('{{CONSENSUS}}', JSON.stringify(consensus));
  const messages = history.map((h) => ({ role: h.role === 'model' ? 'assistant' : h.role, content: h.parts[0]?.text ?? '' }));
  const unlisten = await listen<StreamChunk>(eventName, (ev) => {
    onChunk(ev.payload);
  });
  try {
    const result = await invoke<StreamChunk['full_response']>('llm_generate_stream', {
      config: {
        id: config.id,
        name: config.name,
        provider: config.provider,
        api_key: config.apiKey,
        base_url: config.baseUrl ?? null,
        model_name: config.modelName,
      },
      systemInstruction,
      messages,
      eventName,
    });
    return result ?? undefined;
  } finally {
    unlisten();
  }
}

export async function generateOne(
  config: ModelConfig,
  systemInstruction: string,
  messages: Array<{ role: string; content: string }>,
  userContent: string
): Promise<string> {
  if (!isTauri) return '';
  return invoke<string>('llm_generate_one', {
    config: {
      id: config.id,
      name: config.name,
      provider: config.provider,
      api_key: config.apiKey,
      base_url: config.baseUrl ?? null,
      model_name: config.modelName,
    },
    systemInstruction,
    messages,
    userContent,
  });
}

export { isTauri };
