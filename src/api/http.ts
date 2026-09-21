import { getToken } from '../utils/auth'
import type { ApiResponse } from './types'

// 走 Vite 代理(见 vite.config.ts), /api 会被转发到后端, 避免浏览器跨域报错
const BASE_URL = '/api/v1'

/** 通用请求: 成功返回 data, 失败抛错 */
export async function request<T>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const headers = new Headers(options.headers)
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const token = getToken()
  if (token) headers.set('Authorization', token) // token 已含 "Bearer " 前缀

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers })
  const json = (await res.json()) as ApiResponse<T>
  if (json.code !== 0) throw new Error(json.message || '请求失败')
  return json
}

/** 登录专用: token 在【响应头】Authorization 里, 不在 body */
export async function requestWithHeaderToken<T>(
  path: string,
  options: RequestInit = {}
): Promise<{ data: T; token: string }> {
  const headers = new Headers(options.headers)
  headers.set('Content-Type', 'application/json')

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers })
  const json = (await res.json()) as ApiResponse<T>
  if (json.code !== 0) throw new Error(json.message || '请求失败')
  const token = res.headers.get('Authorization') ?? ''
  return { data: json.data, token }
}
