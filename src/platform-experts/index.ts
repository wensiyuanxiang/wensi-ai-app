import type { PlatformExpertConfig } from './types';
import { wechatExpert } from './wechat';
import { xiaohongshuExpert } from './xiaohongshu';
import { zhihuExpert } from './zhihu';
import { jianshuExpert } from './jianshu';
import { csdnExpert } from './csdn';
import { markdownExpert } from './markdown';

const registry: Record<string, PlatformExpertConfig> = {
  wechat: wechatExpert,
  xiaohongshu: xiaohongshuExpert,
  zhihu: zhihuExpert,
  jianshu: jianshuExpert,
  csdn: csdnExpert,
  markdown: markdownExpert,
};

export type { PlatformExpertConfig, ReviewExpertConfig, CoverExpertConfig, ContentExpertConfig } from './types';

export function getPlatformExpert(platformId: string): PlatformExpertConfig | null {
  return registry[platformId] ?? null;
}

export function getReviewChecklist(platformId: string): string[] {
  return getPlatformExpert(platformId)?.review.checklist ?? [];
}

export function getCoverStyleHints(platformId: string): string[] {
  return getPlatformExpert(platformId)?.cover.styleHints ?? [];
}

/** 解析封面比例，返回宽高比 (w, h)，如 2.35:1 -> { w: 2.35, h: 1 }，3:4 竖版 -> { w: 3, h: 4 } */
export function getCoverAspectRatio(platformId: string): { w: number; h: number } {
  const raw = getPlatformExpert(platformId)?.cover.defaultAspectRatio ?? '2.35:1';
  const match = raw.match(/(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/);
  if (match) {
    const w = parseFloat(match[1]);
    const h = parseFloat(match[2]);
    if (w > 0 && h > 0) return { w, h };
  }
  return { w: 2.35, h: 1 };
}
