export interface ApiResponse<T> {
  code: number
  message: string
  data: T
}

/**  UserResponse */
export interface UserResponse {
  id: number
  username: string
  nickname: string
  role: number        // 0=普通学生 1=业务管理员 2=系统管理员
  status: number      // 0=禁用 1=正常
  credit: number      // 积分
  avatar: string
  qq: string
  realname: string
  gender: number
  last_login_at: string
  created_at: string
  updated_at: string
}

/** 注册请求体 */
export interface CreateUserRequest {
  username: string   // 长度 2-32, 必须唯一
  password: string   // 长度 8-20, 需含大小写+数字+符号
  nickname: string   // 长度 2-32
}

/** 登录请求体 */
export interface LoginRequest {
  username: string
  password: string
}

/** 修改用户信息请求体 (可选字段) */
export interface UpdateUserRequest {
  nickname?: string
  realname?: string
  gender?: number
  avatar?: string
}


export interface ChangeUserRoleRequest {
  id: number      // 目标用户的 id
  role: number    // 0=普通 1=业务管理员 2=系统管理员
}

/** 管理员改变用户状态 */
export interface ChangeUserStatusRequest {
  id: number      // 目标用户的 id
  status: number  // 0=禁用 1=正常
}

/** 管理员改变用户积分 */
export interface AddUserCreditRequest {
  id: number            // 目标用户的 id
  credit: number        // 变动的积分值
  operator_id: number   // 操作人(管理员自己)的用户 id
  type: number
  description?: string
}

/** 根据 id 批量获取用户列表 */
export interface BatchRequest {
  ids: number[]   // 用户 id 数组
}