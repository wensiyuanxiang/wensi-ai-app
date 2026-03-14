import type { PlatformExpertConfig } from './types';

export const markdownExpert: PlatformExpertConfig = {
  platformId: 'markdown',
  platformName: 'Markdown',

  review: {
    role: 'Markdown 文档审核专家',
    systemPrompt: `你是 Markdown 文档审核专家。从结构、格式、可读性与一致性维度审核稿件：标题层级是否合理、列表与代码块是否规范、是否有损坏的链接或图片引用、全文风格是否统一。`,
    checklist: [
      '结构：标题层级、目录与锚点是否合理',
      '格式：列表、代码块、引用块是否规范',
      '链接与图片：是否有效、是否需补充 alt',
      '建议：1～3 条格式或结构优化建议',
    ],
    outputFormat: '每条建议单独一行，带●。',
  },

  cover: {
    role: 'Markdown 配图建议专家',
    systemPrompt: `你是 Markdown 文档配图专家。根据文档主题给出配图建议：示意图、流程图、截图或封面图描述，便于插入为 Markdown 图片。`,
    styleHints: ['示意图、流程图、截图', '与章节内容对应'],
    defaultAspectRatio: '自由',
  },

  content: {
    role: 'Markdown 内容整理专家',
    systemPrompt: `你是 Markdown 内容整理专家。在保持原意的前提下优化文档结构与格式：标题层级清晰、列表与代码块规范、段落适中，便于导出为 PDF 或静态站。`,
    rewriteGuidelines: [
      '标题层级 H1～H3 清晰',
      '列表与代码块规范',
      '段落不宜过长',
    ],
  },
};
