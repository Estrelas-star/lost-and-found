// src/utils/clipboard.ts
// 复制文本到剪贴板（目前用于「账号设置 → 绑定 QQ」里一键复制 QQ 群号）。
//
// 为什么不用 navigator.clipboard 一把梭：
//   navigator.clipboard 只在**安全上下文**（https / localhost）下存在，
//   本项目生产环境可能以 http + IP 访问（这时 navigator.clipboard 为 undefined），
//   故保留 textarea + document.execCommand('copy') 的降级路径。
// 返回值：true 表示复制成功；false 时调用方应给出「可手动复制」的文案，不要把失败咽掉。

export async function copyText(text: string): Promise<boolean> {
  if (!text) return false

  // ① 首选异步 Clipboard API（仅安全上下文可用）
  if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // 权限被拒 / 文档失焦 → 继续走降级路径
    }
  }

  // ② 降级：临时 textarea + execCommand（已废弃但兼容性最好）
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.top = '-1000px'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    ta.setSelectionRange(0, ta.value.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}
