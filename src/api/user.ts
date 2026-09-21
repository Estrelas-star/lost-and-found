import { request, requestWithHeaderToken } from './http'
import type { CreateUserRequest, LoginRequest, UpdateUserRequest, UserResponse } from './types'

/** 注册: POST /user/create */
export function createUser(body: CreateUserRequest) {
  return request<UserResponse>('/user/create', { method: 'POST', body: JSON.stringify(body) })
}

/** 登录: POST /user/login —— token 在响应头, 这里一起取出来 */
export async function login(body: LoginRequest) {
  const { data, token } = await requestWithHeaderToken<UserResponse>('/user/login', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return { user: data, token }
}

/** 登出: POST /user/logout (logoutAll=1 表示全部设备登出) */
export function logout(body: { logoutAll?: number } = {}) {
  return request('/user/logout', { method: 'POST', body: JSON.stringify(body) })
}

/** 修改资料: POST /user/update */
export function updateUser(body: UpdateUserRequest) {
  return request('/user/update', { method: 'POST', body: JSON.stringify(body) })
}