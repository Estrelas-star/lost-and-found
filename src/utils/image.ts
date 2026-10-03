// src/utils/image.ts
// 图片地址解析：上传接口 /upload/image 返回的是【相对 URL】，
// 展示时需要拼接服务器源（见 vite 代理目标 / .env 的 VITE_IMAGE_BASE_URL）。
// 已是绝对地址(data:/blob:/http(s):)则原样返回。

const IMAGE_BASE = (import.meta.env as Record<string, string>).VITE_IMAGE_BASE_URL || ''

export function resolveImageUrl(url?: string | null): string {
  if (!url) return ''
  if (/^(https?:|data:|blob:)/i.test(url)) return url
  if (url.startsWith('//')) return url
  if (!IMAGE_BASE) return url // 未配置服务器源时，按相对路径原样使用（部署同源时可用）
  const base = IMAGE_BASE.replace(/\/+$/, '')
  return url.startsWith('/') ? base + url : base + '/' + url
}
