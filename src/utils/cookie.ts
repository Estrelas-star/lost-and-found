// src/utils/cookie.ts
// 轻量 cookie 读写：只用于「某个引导弹窗是否已经自动展示过」这类非敏感 UI 记忆。
// 与 localStorage 的分工：
//   · localStorage（utils/auth.ts 等）：登录态、公告已读等需要较大容量 / 频繁读写的状态；
//   · cookie（本文件）：跨会话「只自动弹一次」的开关，随请求发送但体积极小、可设过期时间。
// 注意：后端不依赖这些 cookie，纯前端标记。

/** 读取 cookie，未设置时返回 null */
export function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const target = `${encodeURIComponent(name)}=`
  for (const part of document.cookie.split(';')) {
    const item = part.trim()
    if (item.startsWith(target)) return decodeURIComponent(item.slice(target.length))
  }
  return null
}

/** 写入 cookie（默认 365 天；同站、path=/，避免跨页面丢失） */
export function setCookie(name: string, value: string, days = 365): void {
  if (typeof document === 'undefined') return
  const expires = new Date(Date.now() + days * 86400000).toUTCString()
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`
}

/** 删除 cookie（过期时间置为过去） */
export function removeCookie(name: string): void {
  if (typeof document === 'undefined') return
  document.cookie = `${encodeURIComponent(name)}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`
}
