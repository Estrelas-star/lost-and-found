// src/api/upload.ts
// 图片上传：先调 POST /upload/image（multipart/form-data，字段名 file，需登录），
// 拿到后端返回的相对 URL（data.url），再交由调用方填进 item.images[].image_url。
import { getToken, updateToken, clearAuth } from '../utils/auth'
import type { ApiResponse } from './types'

const BASE_URL = '/api/v1'

export async function uploadImage(file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  // 不要手动设置 Content-Type，让浏览器自动写入 multipart boundary
  const headers = new Headers()
  const token = getToken()
  if (token) headers.set('Authorization', token)

  const res = await fetch(`${BASE_URL}/upload/image`, { method: 'POST', body: form, headers })
  const json = (await res.json()) as ApiResponse<{ url: string }>
  // 后端续期：响应头带回新 token 则静默更新（与 http.ts 一致）
  const newToken = res.headers.get('Authorization')
  if (newToken) updateToken(newToken)
  if (json.code === 0) return json.data.url
  // 登录态失效：清空并派发 expired（与 http.ts 一致）
  if (json.code === 10005 || json.code === 10006) {
    clearAuth()
    window.dispatchEvent(new CustomEvent('auth:expired', { detail: { message: json.message || '登录已失效，请重新登录' } }))
  }
  throw new Error(json.message || '图片上传失败')
}
