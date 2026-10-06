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

/** /user/batch 实际返回（后端 model.PublicUserResponse，仅公开字段） */
export interface PublicUserResponse {
  id: number
  nickname: string
  gender?: number | null
  avatar?: string | null
  role: number        // 0=普通学生 1=业务管理员 2=系统管理员
  last_login_at?: string | null
  created_at: string
}

/** 根据 id 批量获取用户列表 */
export interface BatchRequest {
  ids: number[]   // 用户 id 数组
}

/* ===== 积分流水（GET /user/credit-logs） ===== */

/** 积分流水业务类型：0 拾金不昧奖励 / 1 认领成功奖励 / 2 违规扣分 / 3 系统调整 / 4 积分兑换 */
export type CreditLogType = 0 | 1 | 2 | 3 | 4

/**
 * 单条积分流水（后端 model.CreditLogResponse）
 * 注意：**不返回** operator_id / related_id，前端不展示这两项。
 */
export interface CreditLogDTO {
  id: number
  change_amount: number    // 正数为增加、负数为减少
  before_amount: number    // 变动前积分
  after_amount: number     // 变动后积分
  type: number
  type_label: string       // 后端已给出中文标签（如「积分兑换」），前端不再自行映射
  description?: string     // 变动说明
  created_at: string
}

/** GET /user/credit-logs 的 data：logs 空数据为 []（不是 null） */
export interface CreditLogListResult {
  total: number
  page: number
  page_size: number
  logs: CreditLogDTO[]
}

/** GET /user/credit-logs 查询参数（全部可选；**不筛就省略**，不要传空串，否则后端按 0 参与筛选/报 1） */
export interface ListCreditLogsParams {
  type?: CreditLogType
  page?: number
  page_size?: number       // 默认 10，最大 100
}