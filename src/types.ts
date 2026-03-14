/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type WorkflowStage = 'landing' | 'conversation' | 'compose' | 'publish';

/** 单平台策略（是否改内容、调整预览等），仅当前会话不持久化 */
export interface PlatformStrategy {
  changeContent: boolean;
  adjustPreview: boolean;
}

/** 写作创意工作流共识维度（可跳过部分步骤） */
export interface Consensus {
  /** 1. 启发点：聊天中明确的灵感、动机 */
  inspirationPoints?: string[];
  /** 2. 主题 */
  topic?: string;
  /** 受众 */
  audience?: string;
  /** 平台 */
  platform?: string;
  /** 3. 核心观点 */
  corePoints?: string[];
  /** 3. 金句 / 关键句 */
  goldenSentences?: string[];
  /** 4. 爆款标题 */
  title?: string;
  /** 5. 文章结构 / 提纲 */
  outline?: string[];
  /** 6. 写作风格（用户设定 + AI 推荐） */
  style?: string;
}

/** 写作工作流步骤（用于展示与引导） */
export const WRITING_WORKFLOW_STEPS = [
  { key: 'inspirationPoints', label: '启发点' },
  { key: 'topic', label: '主题' },
  { key: 'corePoints', label: '核心观点' },
  { key: 'goldenSentences', label: '金句' },
  { key: 'title', label: '爆款标题' },
  { key: 'outline', label: '文章结构' },
  { key: 'style', label: '写作风格' },
  { key: 'draft', label: '初稿与润色' },
  { key: 'publish', label: '发布' },
] as const;

export interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
  thought?: string;
  type?: 'text' | 'options' | 'consensus' | 'draft';
  options?: string[];
  consensus?: Partial<Consensus>;
}

export interface ModelConfig {
  id: string;
  name: string;
  provider: 'gemini' | 'openai' | 'claude' | 'glm' | 'kimi' | 'deepseek' | 'custom';
  apiKey: string;
  baseUrl?: string;
  modelName: string;
}

/** 写作风格条目（作者定位、文风定位、惯用语等） */
export interface WritingStyleEntry {
  id: string;
  name: string;
  authorPositioning: string;
  stylePositioning: string;
  habitualPhrases: string;
}

export interface UserSettings {
  models: ModelConfig[];
  activeModelId: string;
  writingStyle: string;
}

export interface Article {
  id: string;
  title: string;
  content: string;
  category: string;
  platform: string;
  publishDate: string;
}

export interface Draft {
  id: string;
  title: string;
  stage: WorkflowStage;
  lastUpdated: string;
  /** 新建时间（时间戳或格式化字符串） */
  createdAt?: string;
  /** 分类，用于侧栏筛选与自定义系列 */
  category?: string;
  consensus: Consensus;
  messages: Message[];
  content: string;
}

/** 主题会话历史条目（最近 100 条） */
export interface SessionHistoryEntry {
  id: string;
  title: string;
  stage: WorkflowStage;
  consensus: Consensus;
  draft: string;
  messages: Message[];
  createdAt: string;
}

export interface AppState {
  stage: WorkflowStage;
  consensus: Consensus;
  messages: Message[];
  draft: string;
  draftBaseline: string;
  versions: { [key: string]: string };
  currentPlatform: string;
  userSettings: UserSettings;
  articles: Article[];
  drafts: Draft[];
  history: Partial<AppState>[];
  /** 写作风格列表（侧栏管理） */
  writingStyles: WritingStyleEntry[];
  /** 当前会话选中的风格 id，聊天生成时使用 */
  selectedStyleId: string | null;
  /** 当前润色/改稿对应的草稿 id，二次保存时复用，离开 compose 时清空 */
  currentDraftId?: string | null;
  /** 从草稿箱进入润色页为 true，不自动跑 AI；从聊天首次生成进入为 false */
  composeFromDraftList?: boolean;
}
