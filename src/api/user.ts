import { request, requestWithHeaderToken } from './http'
import type {
  AddUserCreditRequest,
  BatchRequest,
  ChangeUserRoleRequest,
  ChangeUserStatusRequest,
  CreateUserRequest,
  LoginRequest,
  UpdateUserRequest,
  PublicUserResponse,
  UserResponse,
} from './types'

/** 注册: POST /user/create */
export function createUser(body: CreateUserRequest) {
  return request<UserResponse>('/user/create', { method: 'POST', body: JSON.stringify(body) })
}

/** 登录: POST /user/login */
export async function login(body: LoginRequest) {
  const { data, token } = await requestWithHeaderToken<UserResponse>('/user/login', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return { user: data, token }
}

/** 登出: POST /user/logout (logoutAll=1 表示全部设备登出) */
export function logout(body: { logout_all?: number } = {}) {
  return request('/user/logout', { method: 'POST', body: JSON.stringify(body) })
}

/** 修改资料: POST /user/update */
export function updateUser(body: UpdateUserRequest) {
  return request('/user/update', { method: 'POST', body: JSON.stringify(body) })
}

/** 获取自己的信息: GET /user/me  */
export function getMe() {
  return request<UserResponse>('/user/me')
}

/** 按 id 批量获取用户: POST /user/batch  */
export function batchGetUsers(ids: number[]) {
  return request<PublicUserResponse[]>('/user/batch', {
    method: 'POST',
    body: JSON.stringify({ ids } satisfies BatchRequest),
  })
}

/** 申请 QQ 绑定验证码：POST /user/qq/get-code { qq: number } */
export function getQQCode(body: { qq: number }) {
  return request('/user/qq/get-code', { method: 'POST', body: JSON.stringify(body) })
}

/** 提交 QQ 绑定：POST /user/qq/bind { qq: number, code: number } */
export function bindQQ(body: { qq: number; code: number }) {
  return request('/user/qq/bind', { method: 'POST', body: JSON.stringify(body) })
}

/* 管理员专用接口 */

/** 改变用户角色: POST /admin/change-role */
export function adminChangeRole(body: ChangeUserRoleRequest) {
  return request<UserResponse>('/admin/change-role', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/** 改变用户状态: POST /admin/change-status */
export function adminChangeStatus(body: ChangeUserStatusRequest) {
  return request<UserResponse>('/admin/change-status', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/** 改变用户积分: POST /admin/add-credit */
export function adminAddCredit(body: AddUserCreditRequest) {
  return request<UserResponse>('/admin/add-credit', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}