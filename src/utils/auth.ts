const TOKEN_KEY = 'authorization-token'
const USER_KEY = 'user'

/** 登录后调用: 把 token 和 user 写进浏览器 cookie */
export function setAuth(token: string, user: unknown) {
  const maxAge = 7 * 24 * 3600 // 7 天, 单位秒
  document.cookie = `${TOKEN_KEY}=${encodeURIComponent(token)}; max-age=${maxAge}; path=/; SameSite=Lax`
  document.cookie = `${USER_KEY}=${encodeURIComponent(JSON.stringify(user))}; max-age=${maxAge}; path=/; SameSite=Lax`
}

export function getToken(): string {
  const m = document.cookie.match(new RegExp(`(?:^| )${TOKEN_KEY}=([^;]+)`))
  return m ? decodeURIComponent(m[1]) : ''
}

/** 读取已登录用户 */
export function getStoredUser<T = unknown>(): T | null {
  const m = document.cookie.match(new RegExp(`(?:^| )${USER_KEY}=([^;]+)`))
  if (!m) return null
  try {
    return JSON.parse(decodeURIComponent(m[1])) as T
  } catch {
    return null
  }
}

/** 退出登录: 清空 cookie  */
export function clearAuth() {
  document.cookie = `${TOKEN_KEY}=; max-age=0; path=/`
  document.cookie = `${USER_KEY}=; max-age=0; path=/`
}