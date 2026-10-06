import { request, requestWithHeaderToken } from './http'
import type {
  AddUserCreditRequest,
  BatchRequest,
  ChangeUserRoleRequest,
  ChangeUserStatusRequest,
  CreateUserRequest,
  CreditLogListResult,
  ListCreditLogsParams,
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

/**
 * 我的积分流水：GET /user/credit-logs（私有，只返回当前登录用户自己的记录）
 *
 * · `type` **不筛就省略**（传空串/0 会被后端读成 0 并实际参与筛选，空串还会触发 `1` 参数错误）
 * · `page` 默认 1；`page_size` 默认 10、**最大 100**（超出 → `1`）
 * · 排序由后端保证 `created_at` 降序，**前端不要本地重排**
 * · 返回 `{ total, page, page_size, logs }`；`logs` 空数据为 `[]`（不是 null）
 * · 错误码：`1` 参数错误 / `2` 未登录或无 token（由 http.ts 统一跳登录）/ `6` 服务端异常
 * · 当前积分余额不在此接口返回，用 `GET /user/me` 的 `credit`
 */
export function listCreditLogs(params: ListCreditLogsParams = {}) {
  const qs = new URLSearchParams()
  if (params.type != null) qs.set('type', String(params.type))
  if (params.page != null) qs.set('page', String(params.page))
  if (params.page_size != null) qs.set('page_size', String(params.page_size))
  const query = qs.toString()
  return request<CreditLogListResult>(`/user/credit-logs${query ? '?' + query : ''}`)
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