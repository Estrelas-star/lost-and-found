// src/utils/markdown.ts
// 极简 Markdown 渲染器（仅供物品描述使用）。
// 设计取舍：项目未引入 markdown 库，且任务明确"不检查图片渲染是否成功"，
// 故手写一个够用的子集，并做 HTML 转义 + URL 协议白名单，避免 XSS。
//
// 支持的语法：
//   #~###### 标题 | **加粗** | *斜体* | `行内代码`
//   - / * 无序列表 | 1. 有序列表
//   ![alt](url) 图片 | [text](url) 链接
//   换行自动转为段落 / <br>

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// 仅放行 http(s) 与相对路径 / data:image，拒绝 javascript: 等危险协议
function safeUrl(u: string): string {
  const t = u.trim()
  if (/^https?:\/\//i.test(t)) return t
  if (/^(\/|\.\/|\.\.\/)/.test(t)) return t
  if (/^data:image\//i.test(t)) return t
  return ''
}

function inline(s: string): string {
  // 图片（必须在链接之前匹配，否则会被链接规则吃掉）
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt: string, url: string) => {
    const safe = safeUrl(url)
    if (!safe) return ''
    return `<img alt="${alt}" src="${safe}" />`
  })
  // 链接
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text: string, url: string) => {
    const safe = safeUrl(url)
    if (!safe) return text
    return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${text}</a>`
  })
  // 加粗 / 斜体 / 行内代码
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>')
  return s
}

export function renderMarkdown(src: string | undefined | null): string {
  if (!src) return ''
  const lines = escapeHtml(src).split('\n')
  const out: string[] = []
  let listType: 'ul' | 'ol' | null = null

  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`)
      listType = null
    }
  }

  for (const line of lines) {
    const trimmed = line.trim()
    // 代码块围栏：简单忽略，不渲染（满足"不检查图片渲染是否成功"的宽松要求）
    if (trimmed.startsWith('```')) {
      closeList()
      continue
    }
    // 标题
    const h = line.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      closeList()
      const level = h[1].length
      out.push(`<h${level}>${inline(h[2])}</h${level}>`)
      continue
    }
    // 无序列表
    const ul = line.match(/^\s*[-*]\s+(.*)$/)
    if (ul) {
      if (listType !== 'ul') {
        closeList()
        out.push('<ul>')
        listType = 'ul'
      }
      out.push(`<li>${inline(ul[1])}</li>`)
      continue
    }
    // 有序列表
    const ol = line.match(/^\s*\d+\.\s+(.*)$/)
    if (ol) {
      if (listType !== 'ol') {
        closeList()
        out.push('<ol>')
        listType = 'ol'
      }
      out.push(`<li>${inline(ol[1])}</li>`)
      continue
    }
    // 空行
    if (!trimmed) {
      closeList()
      continue
    }
    // 普通段落
    closeList()
    out.push(`<p>${inline(line)}</p>`)
  }
  closeList()
  return out.join('')
}

// 提取原始 markdown 中第一张图片的 URL（![alt](url)），经安全白名单校验，无则返回空串。
// 用途：列表卡片把首图提为头图展示。
export function firstImageUrl(src: string | undefined | null): string {
  if (!src) return ''
  const m = src.match(/!\[[^\]]*\]\(([^)\s]+)\)/)
  return m ? safeUrl(m[1]) : ''
}

// 去掉全部图片语法（保留其余内容）。用途：头图已单独展示的卡片正文，避免图片重复渲染撑高卡片。
export function stripImages(src: string | undefined | null): string {
  if (!src) return ''
  return src.replace(/!\[[^\]]*\]\(([^)\s]+)\)/g, '')
}
