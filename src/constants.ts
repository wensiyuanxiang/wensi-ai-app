export const COLORS = {
  background: '#F6F4EF',
  surface: '#FBFAF7',
  text: '#181818',
  subtext: '#6F6A63',
  accent: '#4D6B57',
  line: '#E8E3DA',
};

export const PLATFORMS = [
  { id: 'wechat', name: '公众号' },
  { id: 'xiaohongshu', name: '小红书' },
  { id: 'zhihu', name: '知乎' },
  { id: 'markdown', name: 'Markdown' },
];

/** 发布/润色默认展示的 3 个平台 tab，仅公众号可用，其余暂锁「即将支持」 */
export const PUBLISH_DEFAULT_PLATFORMS = [
  { id: 'wechat', name: '公众号', available: true },
  { id: 'xiaohongshu', name: '小红书', available: false },
  { id: 'zhihu', name: '知乎', available: false },
];

/** 全部可配置平台（用于「更多」中勾选与策略设置） */
export const ALL_PUBLISH_PLATFORMS = [
  { id: 'wechat', name: '公众号', available: true },
  { id: 'xiaohongshu', name: '小红书', available: false },
  { id: 'zhihu', name: '知乎', available: false },
  { id: 'jianshu', name: '简书', available: false },
  { id: 'csdn', name: 'CSDN', available: false },
  { id: 'markdown', name: 'Markdown', available: false },
];

/** 默认在 tab 栏展示的平台 id 列表 */
export const DEFAULT_VISIBLE_PLATFORM_IDS = ['wechat', 'xiaohongshu', 'zhihu'];

/** 更多支持（不持久化）：格式、风格、API 等，仅当前会话 */
export const MORE_SUPPORT_OPTIONS = [
  { id: 'format', name: '格式调整' },
  { id: 'style', name: '风格' },
  { id: 'api', name: '官方接口 API' },
];

export const STYLES = [
  { id: 'professional', name: '轻专业' },
  { id: 'casual', name: '口语化' },
  { id: 'storytelling', name: '叙事感' },
  { id: 'opinionated', name: '犀利观点' },
];

export const AUDIENCES = [
  { id: 'entrepreneur', name: '创业者' },
  { id: 'developer', name: '开发者' },
  { id: 'creator', name: '自媒体人' },
  { id: 'general', name: '大众读者' },
];
