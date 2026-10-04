import { request } from './http'
import type { ApiResponse } from './types'

export interface NotificationItem {
  id: number
  admin_id: number
  type: number
  title: string
  is_read: number   // 0 未读 / 1 已读
  created_at: string
}

export interface NotificationDetail {
  id: number
  admin_id: number
  user_id: number
  type: number
  title: string
  content: string
  related_id: number | null
  is_read: number
  read_at: string
  created_at: string
  updated_at: string
}

export interface BroadcastPayload {
  user_ids?: number[]
  send_to_all?: boolean
  type: number
  title: string
  content: string
  related_id?: number | null
}

/**
 * 通知列表：GET /notifications
 * 分页用 limit / offset（与 item/shop 的 page/page_size 不同），列表项不含 content
 */
export function getNotifications(params: { limit?: number; offset?: number; type?: number; is_read?: number } = {}) {
  const qs = new URLSearchParams()
  if (params.limit != null) qs.set('limit', String(params.limit))
  if (params.offset != null) qs.set('offset', String(params.offset))
  if (params.type != null) qs.set('type', String(params.type))
  if (params.is_read != null) qs.set('is_read', String(params.is_read))
  const q = qs.toString()
  return request<NotificationItem[]>(`/notifications${q ? '?' + q : ''}`)
}

/** 未读数：GET /notifications/unread-count（data 为裸数字，Redis 缓存 5 分钟） */
export function getUnreadCount() {
  return request<number>('/notifications/unread-count')
}

/** 通知详情（自动已读）：GET /notifications/:id */
export function getNotificationDetail(id: number) {
  return request<NotificationDetail>(`/notifications/${id}`)
}

/** 批量已读：PUT /notifications/read { ids: number[] } */
export function markNotificationsRead(ids: number[]) {
  return request('/notifications/read', { method: 'PUT', body: JSON.stringify({ ids }) })
}

/** 批量删除：DELETE /notifications { ids: number[] } */
export function deleteNotifications(ids: number[]) {
  return request('/notifications', { method: 'DELETE', body: JSON.stringify({ ids }) })
}

/** 管理员广播：POST /admin/notifications { user_ids?, send_to_all?, type, title, content, related_id? } */
export function adminBroadcast(body: BroadcastPayload) {
  return request('/admin/notifications', { method: 'POST', body: JSON.stringify(body) })
}
