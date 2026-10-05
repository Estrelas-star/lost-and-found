// src/api/upload.ts
// 图片上传：POST /upload/image（multipart/form-data，字段名 file，需登录），
// 成功后返回后端给的相对 URL（data.url，如 /uploads/2026/09/26/xxx.jpg），由调用方填进 item.images[].image_url。
//
// 为什么带重试：
//   Vite dev 代理转发"带文件的大 body POST"时会间歇性返回 502（实测同一文件 8 次里挂 3 次，
//   直连后端 8/8 全成功），属代理层抖动而非后端业务错误，故对 5xx / 网络错误自动重试。
import { getToken, updateToken, clearAuth } from '../utils/auth'
import type { ApiResponse } from './types'

const BASE_URL = '/api/v1'

// 与后端 response/response_code.go 对齐的错误码文案（上传相关）
const CODE_MESSAGE: Record<number, string> = {
  1: '图片参数有误，请重试',
  9: '图片超过 5MB，请压缩后再上传',
  10: '只支持 JPG / PNG / WEBP 格式的图片',
  11: '服务器保存图片失败，请稍后重试',
}

// 前端预检，避免明显不合规的文件白跑一趟
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SIZE = 5 * 1024 * 1024
const MAX_ATTEMPTS = 3
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** 可重试的临时故障（网络中断 / 代理 502、503、504） */
class RetryableError extends Error {}

async function uploadOnce(file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  // 不要手动设置 Content-Type，让浏览器自动写入 multipart boundary
  const headers = new Headers()
  const token = getToken()
  if (token) headers.set('Authorization', token)

  let res: Response
  try {
    res = await fetch(`${BASE_URL}/upload/image`, { method: 'POST', body: form, headers })
  } catch {
    throw new RetryableError('网络异常，图片上传失败')
  }

  // Vite 代理抖动：502/503/504 视为可重试
  if (res.status === 502 || res.status === 503 || res.status === 504) {
    throw new RetryableError(`服务暂时不可用（HTTP ${res.status}），请重试`)
  }

  // 后端续期：响应头带回新 token 则静默更新（与 http.ts 一致）
  const newToken = res.headers.get('Authorization')
  if (newToken) updateToken(newToken)

  let json: ApiResponse<{ url: string }>
  try {
    json = (await res.json()) as ApiResponse<{ url: string }>
  } catch {
    throw new Error(`服务器返回异常（HTTP ${res.status}）`)
  }

  if (json.code === 0 && json.data?.url) return json.data.url

  // 登录态失效：清空并派发 expired（与 http.ts 的判定保持一致）
  if (json.code === 10005 || json.code === 10006 || (json.code === 2 && !token)) {
    clearAuth()
    window.dispatchEvent(new CustomEvent('auth:expired', { detail: { message: '登录已失效，请重新登录' } }))
    throw new Error('登录已失效，请重新登录后再上传')
  }
  if (json.code === 2) throw new Error('权限不足：当前账号无权上传图片')
  throw new Error(CODE_MESSAGE[json.code] || json.message || '图片上传失败')
}

/** 上传单张图片，返回相对 URL。临时性故障（代理 502 / 网络抖动）自动重试 2 次 */
export async function uploadImage(file: File): Promise<string> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('只支持 JPG / PNG / WEBP 格式的图片')
  }
  if (file.size > MAX_SIZE) {
    throw new Error('图片超过 5MB，请压缩后再上传')
  }

  let lastErr: unknown
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await uploadOnce(file)
    } catch (e) {
      lastErr = e
      // 只重试临时性故障；业务错误（类型/大小/权限）立即抛出
      if (!(e instanceof RetryableError) || attempt === MAX_ATTEMPTS) break
      await sleep(300 * attempt) // 300ms → 600ms 退避
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('图片上传失败')
}
