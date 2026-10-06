import { request } from './http'
import type { ApiResponse } from './types'

/** 通知类型：0 系统通知 / 1 物品匹配 / 2 认领申请 / 3 认领结果 / 4 评论回复 / 5 积分变动 / 6 商品兑换 */
export type NotificationType = 0 | 1 | 2 | 3 | 4 | 5 | 6

/** 批量接口单次上限：后端 PUT /notifications/read 与 DELETE /notifications 均为 1-200 条，超出 → 1 */
export const NOTIFICATION_BATCH_MAX = 200

/** 分页拉取时的单页上限：后端 GET /notifications 的 limit 上限 100（超出按 100） */
export const NOTIFICATION_PAGE_MAX = 100

export interface NotificationItem {
  id: number
  admin_id: number   // 0 = 系统自动触发（QQ 绑定 / 认领关闭 / 兑换等）
  type: number
  title: string
  is_read: number    // 0 未读 / 1 已读 —— 判断已读一律只看这个字段（read_at 可能缺失）
  created_at: string
}

export interface NotificationDetail {
  id: number
  admin_id: number
  user_id: number
  type: number
  title: string
  content: string
  related_id?: number | null   // omitempty：可能整个键缺失（非 null）
  is_read: number
  // omitempty：**未读时整个键缺失**（不是 null）；「未读→自动已读」的那一次响应也可能仍缺失
  read_at?: string
  created_at: string
  updated_at: string
  // 注意：后端 is_deleted 为 json:"-"，列表 / 详情均不返回，前端无需声明
}

export interface BroadcastPayload {
  user_ids?: number[]      // 单次 ≤1000；send_to_all=true 时必须为空/不传（同传 → 1）
  send_to_all?: boolean
  type: number             // 必填，仅接受 0-6（后端 *int8 + oneof=0..6）
  title: string            // ≤100 字
  content: string
  related_id?: number | null
}

/** 把 id 数组去重并切成每段 max 个，供批量接口分批调用 */
function chunkIds(ids: number[]): number[][] {
  const clean = [...new Set(ids)].filter((n) => Number.isFinite(n) && n > 0)
  const out: number[][] = []
  for (let i = 0; i < clean.length; i += NOTIFICATION_BATCH_MAX) {
    out.push(clean.slice(i, i + NOTIFICATION_BATCH_MAX))
  }
  return out
}

/**
 * 通知列表：GET /notifications
 * 分页用 limit / offset（与 item/shop 的 page/page_size 不同）；
 * limit 缺省 10（≤0 归位 10）、上限 100（超出按 100）；offset 缺省 0（负数归位 0）；
 * 排序 created_at DESC, id DESC（稳定排序，同秒记录翻页不重复/丢行）；
 * type / is_read / admin_id 不筛就**省略**——传 0 或空串会被读成 0 并实际参与筛选。
 */
export function getNotifications(params: {
  limit?: number
  offset?: number
  type?: NotificationType
  is_read?: 0 | 1
  admin_id?: number
} = {}) {
  const qs = new URLSearchParams()
  if (params.limit != null) qs.set('limit', String(params.limit))
  if (params.offset != null) qs.set('offset', String(params.offset))
  // 越界枚举自 2026-10-07 起会返回 1（此前只是恒空、不报错）。
  // 这里做运行期防御：非法值干脆不传（等价于不筛选），避免把参数错误抛给用户。
  if (params.type != null && params.type >= 0 && params.type <= 6) qs.set('type', String(params.type))
  if (params.is_read === 0 || params.is_read === 1) qs.set('is_read', String(params.is_read))
  if (params.admin_id != null) qs.set('admin_id', String(params.admin_id))
  const q = qs.toString()
  return request<NotificationItem[]>(`/notifications${q ? '?' + q : ''}`)
}

/** 未读数：GET /notifications/unread-count（data 为裸数字；后端 Redis 缓存 5 分钟，已读/删除后立即失效重建） */
export function getUnreadCount() {
  return request<number>('/notifications/unread-count')
}

/** 通知详情（自动已读）：GET /notifications/:id —— 错误 60001 不存在/非本人 */
export function getNotificationDetail(id: number) {
  return request<NotificationDetail>(`/notifications/${id}`)
}

/**
 * 批量已读：PUT /notifications/read { ids: number[] }
 * 后端单次只接受 1-200 条（超出 → 1），这里自动分批串行调用；只操作自己的未读记录，无关 id 静默跳过。
 */
export async function markNotificationsRead(ids: number[]) {
  const groups = chunkIds(ids)
  if (!groups.length) return null as ApiResponse<null> | null
  let last: ApiResponse<null> | null = null
  for (const g of groups) {
    last = await request<null>('/notifications/read', { method: 'PUT', body: JSON.stringify({ ids: g }) })
  }
  return last
}

/**
 * 批量删除（软删）：DELETE /notifications { ids: number[] }
 * 后端单次只接受 1-200 条（超出 → 1），这里自动分批；
 * 会跳过「管理端群发给自己的那条」（user_id = admin_id），前端不应把它做成可删。
 */
export async function deleteNotifications(ids: number[]) {
  const groups = chunkIds(ids)
  if (!groups.length) return null as ApiResponse<null> | null
  let last: ApiResponse<null> | null = null
  for (const g of groups) {
    last = await request<null>('/notifications', { method: 'DELETE', body: JSON.stringify({ ids: g }) })
  }
  return last
}

/**
 * 管理员广播：POST /admin/notifications（role≥1）
 * · send_to_all=true 时 user_ids 必须为空/不传（同传 → 1）；
 * · send_to_all=false 时必须给出 user_ids（空 / 全为无效 id → 1），单次 ≤1000（超出 → 1）；
 * · type 必填且仅接受 0-6（0 系统通知合法，缺字段才报 1）；
 * · **异步发送：接口立即返回成功**，实际写入失败只记后端日志，前端看不到 60008。
 */
export function adminBroadcast(body: BroadcastPayload) {
  return request('/admin/notifications', { method: 'POST', body: JSON.stringify(body) })
}

