// src/utils/auth.ts —— token 存 localStorage, 带 expiredAt, 支持后端续期
// 组长要求: 不用 cookie、token 对象要能看到内容、要有过期时间。
// expiredAt 直接取自后端 JWT 的 exp 字段(后端有效期 24h), 与后端天然对齐。

const AUTH_KEY = 'auth'

// 登录态对象: 一看就知道里面有什么
interface StoredAuth {
  token: string      // 含 "Bearer " 前缀的 JWT
  user: unknown      // 登录用户信息
  expiredAt: number  // 过期时刻(毫秒时间戳), 取自 JWT 的 exp
}

/** 解码 JWT payload（不验签，仅前端读取过期时间等声明） */
function decodeJwt(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    const b64url = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64url.length % 4
    const b64 = pad ? b64url + '='.repeat(4 - pad) : b64url
    const bin = atob(b64)
    const json = decodeURIComponent(
      bin.split('').map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')
    )
    return JSON.parse(json)
  } catch {
    return null
  }
}

/** 由 token 推算过期时刻: 优先取 JWT 的 exp(秒级转毫秒), 取不到兜底 24h */
function computeExpiredAt(token: string): number {
  const payload = decodeJwt(token)
  const exp = payload?.exp
  if (typeof exp === 'number' && exp > 0) {
    return exp > 1e12 ? exp : exp * 1000 // 秒级时间戳转毫秒
  }
  return Date.now() + 24 * 3600 * 1000
}

/** 登录后调用: token+user+expiredAt 打包存 localStorage */
export function setAuth(token: string, user: unknown) {
  const payload: StoredAuth = { token, user, expiredAt: computeExpiredAt(token) }
  localStorage.setItem(AUTH_KEY, JSON.stringify(payload))
}

/** 续期: 后端在响应头返回新 token 时调用, 只更新 token 与 expiredAt, 不动 user */
export function updateToken(token: string) {
  const raw = localStorage.getItem(AUTH_KEY)
  if (!raw) return
  try {
    const auth = JSON.parse(raw) as StoredAuth
    auth.token = token
    auth.expiredAt = computeExpiredAt(token)
    localStorage.setItem(AUTH_KEY, JSON.stringify(auth))
  } catch {
    /* 解析失败则忽略 */
  }
}

/** 读取并校验: 过期或缺失自动清除, 等同未登录 */
function readAuth(): StoredAuth | null {
  const raw = localStorage.getItem(AUTH_KEY)
  if (!raw) return null
  try {
    const auth = JSON.parse(raw) as StoredAuth
    if (!auth.token || Date.now() > auth.expiredAt) {
      clearAuth()
      return null
    }
    return auth
  } catch {
    clearAuth()
    return null
  }
}

export function getToken(): string {
  return readAuth()?.token ?? ''
}

export function getStoredUser<T = unknown>(): T | null {
  return (readAuth()?.user as T) ?? null
}

/** 退出登录: 清空 localStorage 里的 auth */
export function clearAuth() {
  localStorage.removeItem(AUTH_KEY)
}
