import { getToken, updateToken, clearAuth } from '../utils/auth'
import type { ApiResponse } from './types'

// 走 Vite 代理(见 vite.config.ts), /api 会被转发到后端, 避免浏览器跨域报错
const BASE_URL = '/api/v1'

/**
 * 带业务错误码的异常：code 对齐后端 response/response_code.go。
 * 它仍是 Error 子类 —— 现有调用方的 (e as Error).message 与字符串正则匹配全部照旧可用；
 * 新增 code 字段是为了让上层能精确区分 120001(会话过期) / 120004(限流) / 120006(功能未开启) 等分支。
 */
export class ApiError extends Error {
  code: number
  constructor(code: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

// 前端友好文案：只覆盖本次新增的 shop（11xxx / 50001）与 agent（12xxxx）段，不改动既有错误码行为
const CODE_MESSAGE: Record<number, string> = {
  // 物品流程通用（认领 / 详情 / 相似推荐）与管理员强制撤回认领
  20001: '物品不存在或已被删除',
  20002: '物品已关闭',
  20011: '物品已是已发布状态，无需撤回',
  11001: '商品不存在或已下架',
  11002: '商品库存不足，换一件试试吧',
  11003: '商品名称无效（为空 / 超长 / 与未下架商品重名）',
  11004: '商品价格非法（需在 1 ~ 1000000 之间）',
  11005: '兑换需先绑定 QQ，请前往「账号设置」完成绑定',
  50001: '积分不足，无法兑换该商品',
  120001: '智能助手会话已过期，请重新描述一次',
  120002: '智能服务暂时不可用，请稍后重试（草稿已保留）',
  120003: '输入不合法：描述不超过 500 字，图片最多 3 张',
  120004: '操作过于频繁，请稍后再试',
  120005: '当前会话状态不支持该操作，已为你重置会话',
  120006: '智能助手当前未开启',
}

function messageFor(json: ApiResponse<unknown>): string {
  return CODE_MESSAGE[json.code] || json.message || '请求失败'
}

// 解析响应 JSON；body 不是合法 JSON 时给出友好的服务器错误提示
async function parseJsonSafe<T>(res: Response): Promise<ApiResponse<T>> {
  try {
    return (await res.json()) as ApiResponse<T>
  } catch {
    throw new ApiError(-1, `服务器返回异常 (HTTP ${res.status})`)
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
    throw new ApiError(json.code, message)
  }
  if (json.code === 2) {
    throw new ApiError(2, '权限不足：当前账号无权访问该功能，请联系管理员')
  }
  throw new ApiError(json.code, messageFor(json))
}

/** 通用请求选项：在原 RequestInit 基础上增加可选超时（毫秒）；不传则不设超时，保持既有行为 */
export interface RequestOptions extends RequestInit {
  timeoutMs?: number
}

/**
 * 通用请求: 成功返回 data, 失败抛 ApiError（带 code）。若响应头带回新 token（后端 6h 续期）则自动更新存储。
 * timeoutMs：Agent 的 /agent/chat 单次耗时 2~8 秒，必须传 ≥30000（见 api/agent.ts 的 LLM_TIMEOUT_MS）
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
  const { timeoutMs, ...init } = options
  const headers = new Headers(init.headers)
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const token = getToken()
  if (token) headers.set('Authorization', token) // token 已含 "Bearer " 前缀

  const controller = timeoutMs && timeoutMs > 0 ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers,
      ...(controller ? { signal: controller.signal } : {}),
    })
    const json = await parseJsonSafe<T>(res)
    // 后端续期：在响应头返回新 token，前端静默更新，避免6h后旧 token 被拉黑导致掉线
    const newToken = res.headers.get('Authorization')
    if (newToken) updateToken(newToken)
    return unwrap(json, !!token)
  } catch (e) {
    // 超时中断：语义化为「请求超时」，便于 Agent 面板给出「请稍后重试」提示
    if (controller?.signal.aborted) {
      throw new ApiError(-1, `请求超时（${Math.round((timeoutMs as number) / 1000)}s），请稍后重试`)
    }
    throw e
  } finally {
    if (timer) clearTimeout(timer)
  }
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
