/**
 * Markdown 展示与复制（富文本/纯文本）
 */

import { marked } from 'marked';

marked.setOptions({
  gfm: true,
  breaks: true,
});

export async function markdownToHtmlAsync(md: string): Promise<string> {
  if (!md?.trim()) return '';
  return (await marked.parse(md.trim())) as string;
}

/** 同步渲染用：简单替换，展示排版；复制时用 markdownToHtmlAsync 生成富文本 */
export function markdownToHtmlSync(md: string): string {
  if (!md?.trim()) return '';
  const escaped = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const withBlocks = escaped
    .replace(/^### (.+)$/gm, '<h3 class="text-lg font-bold mt-4 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold mt-6 mb-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold mb-4">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code class="bg-line/50 px-1 rounded">$1</code>');
  const withParas = withBlocks
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p class="mb-4 leading-relaxed">${p.replace(/\n/g, '<br/>')}</p>`)
    .join('');
  return withParas || escaped.replace(/\n/g, '<br/>');
}

/** 将 Markdown 转为可读纯文本（去语法，保留换行与段落） */
export function markdownToPlainText(md: string): string {
  if (!md?.trim()) return '';
  let s = md
    .replace(/\r\n/g, '\n')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/^[-*+]\s+/gm, '• ')
    .replace(/^\d+\.\s+/gm, '')
    .trim();
  return s;
}

/** 复制稿件：优先写入 text/html（公众号等富文本粘贴），回退为纯文本 */
export async function copyDraftToClipboard(draft: string): Promise<boolean> {
  const html = await markdownToHtmlAsync(draft);
  const plain = markdownToPlainText(draft);
  try {
    if (typeof navigator?.clipboard?.write === 'function') {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html;charset=utf-8' }),
          'text/plain': new Blob([plain], { type: 'text/plain;charset=utf-8' }),
        }),
      ]);
      return true;
    }
  } catch {
    /* ignore */
  }
  try {
    await navigator.clipboard.writeText(plain);
    return true;
  } catch {
    return false;
  }
}
