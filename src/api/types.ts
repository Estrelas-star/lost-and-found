// 对齐后端 model/basic 与 response.CommonResponse
// 技术栈: TypeScript 

/** 后端统一返回结构: { code, message, data } */
export interface ApiResponse<T> {
  code: number
  message: string
  data: T
}

/** 后端 UserResponse (model/basic) —— 字段以 swagger 为准 */
export interface UserResponse {
  id: number
  username: string
  nickname: string
  role: number        // 0=普通学生 1=失物招领管理员 2=系统管理员 (数字含义需向后端确认)
  status: number
  credit: number
  avatar: string
  qq: string
  realname: string
  gender: number
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