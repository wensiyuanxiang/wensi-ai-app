/**
 * 平台专家角色：审核、配图、内容生成
 * 每个平台一套专家配置，用于发布准备页的审核建议、封面建议与改写逻辑
 */
export interface ReviewExpertConfig {
  role: string;
  systemPrompt: string;
  checklist: string[];
  outputFormat: string;
}

export interface CoverExpertConfig {
  role: string;
  systemPrompt: string;
  styleHints: string[];
  defaultAspectRatio: string;
}

export interface ContentExpertConfig {
  role: string;
  systemPrompt: string;
  rewriteGuidelines: string[];
}

export interface PlatformExpertConfig {
  platformId: string;
  platformName: string;
  review: ReviewExpertConfig;
  cover: CoverExpertConfig;
  content: ContentExpertConfig;
}
