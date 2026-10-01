import { getToken, updateToken, clearAuth } from '../utils/auth'
import type { ApiResponse } from './types'

// 走 Vite 代理(见 vite.config.ts), /api 会被转发到后端, 避免浏览器跨域报错
const BASE_URL = '/api/v1'

// 解析响应 JSON；body 不是合法 JSON 时给出友好的服务器错误提示
async function parseJsonSafe<T>(res: Response): Promise<ApiResponse<T>> {
  try {
    return (await res.json()) as ApiResponse<T>
  } catch {
    throw new Error(`服务器返回异常 (HTTP ${res.status})`)
  }
}

/**
 * 统一处理业务响应：
 * - code===0 视为成功
 * - 10005(token被禁用) / 10006(账号禁用) / code===2 且无 token(真未登录)：本地会话已死，
 *   清空登录态并派发 auth:expired 事件，由 AppRoot 跳登录页（防“随机 10005 所有接口跟着抖”）
 * - code===2 但带了 token：权限不足(role 不够)，不登出，给友好提示
 */
function unwrap<T>(json: ApiResponse<T>, hadToken: boolean): ApiResponse<T> {
  if (json.code === 0) return json
  if (json.code === 10005 || json.code === 10006 || (json.code === 2 && !hadToken)) {
    clearAuth()
    const message = json.code === 10006
      ? '账号已被禁用，请联系管理员'
      : json.code === 10005
        ? '登录已过期，请重新登录'
        : (json.message || '登录已失效，请重新登录')
    window.dispatchEvent(new CustomEvent('auth:expired', { detail: { message } }))
    throw new Error(message)
  }
  if (json.code === 2) {
    throw new Error('权限不足：当前账号无权访问该功能，请联系管理员')
  }
  throw new Error(json.message || '请求失败')
}

/** 通用请求: 成功返回 data, 失败抛错。若响应头带回新 token（后端6h续期）则自动更新存储 */
export async function request<T>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const headers = new Headers(options.headers)
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const token = getToken()
  if (token) headers.set('Authorization', token) // token 已含 "Bearer " 前缀

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers })
  const json = await parseJsonSafe<T>(res)
  // 后端续期：在响应头返回新 token，前端静默更新，避免6h后旧 token 被拉黑导致掉线
  const newToken = res.headers.get('Authorization')
  if (newToken) updateToken(newToken)
  return unwrap(json, !!token)
}

/** 登录专用: token 在【响应头】Authorization 里, 不在 body */
export async function requestWithHeaderToken<T>(
  path: string,
  options: RequestInit = {}
): Promise<{ data: T; token: string }> {
  const headers = new Headers(options.headers)
  headers.set('Content-Type', 'application/json')

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers })
  const json = await parseJsonSafe<T>(res)
  const result = unwrap(json, false) // 登录请求本身不带鉴权 token，失败(10001/10003/10006等)走统一处理
  const token = res.headers.get('Authorization') ?? ''
  return { data: result.data, token }
}
