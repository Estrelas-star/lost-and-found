import { request } from './http'

/**
 * 公告（Announcement）接口 —— 对齐后端 model/basic/anouncement.go 契约
 * 枚举：
 *   type   0系统公告 / 1活动公告 / 2维护通知 / 3其他
 *   status 1已发布 / 2已下架（0 已废弃，前端不使用）
 *   is_top 0否 / 1是
 * 权限：/announcement* 公开；/admin/announcement* 需 JWT + 系统管理员(role=2)
 */
export interface AnnouncementItem {
  id: number
  admin_id: number
  title: string
  content: string
  type: number
  status: number
  is_top: number
  view_count: number
  published_at?: string | null
  created_at: string
  updated_at: string
}

export interface AnnouncementListResult {
  total: number
  page: number
  page_size: number
  announcements: AnnouncementItem[]
}

export interface AnnouncementListQuery {
  page?: number
  page_size?: number
  status?: number
}

export interface CreateAnnouncementRequest {
  title: string
  content: string
  type: number
  is_top: number
}

/** 增量更新：仅传需要改的字段（后端指针语义，不传即不动） */
export interface UpdateAnnouncementRequest {
  id: number
  title?: string
  content?: string
  type?: number
  status?: number
  is_top?: number
}

function toQuery(params: AnnouncementListQuery = {}): string {
  const qs = new URLSearchParams()
  if (params.page != null) qs.set('page', String(params.page))
  if (params.page_size != null) qs.set('page_size', String(params.page_size))
  if (params.status != null) qs.set('status', String(params.status))
  const q = qs.toString()
  return q ? '?' + q : ''
}

/** 公开：已发布公告分页列表 GET /announcement（仅 status=1，按 id 倒序） */
export function getAnnouncements(params: AnnouncementListQuery = {}) {
  return request<AnnouncementListResult>(`/announcement${toQuery(params)}`)
}

/** 公开：公告详情 GET /announcement/:id（每次访问浏览量 +1） */
export function getAnnouncementDetail(id: number) {
  return request<AnnouncementItem>(`/announcement/${id}`)
}

/** 管理端：公告列表 GET /admin/announcement（含已下架；status 可选筛选 1/2） */
export function adminGetAnnouncements(params: AnnouncementListQuery = {}) {
  return request<AnnouncementListResult>(`/admin/announcement${toQuery(params)}`)
}

/** 管理端：创建公告 POST /admin/announcement/create（创建即发布） */
export function createAnnouncement(body: CreateAnnouncementRequest) {
  return request('/admin/announcement/create', { method: 'POST', body: JSON.stringify(body) })
}

/** 管理端：更新公告 POST /admin/announcement/update（增量） */
export function updateAnnouncement(body: UpdateAnnouncementRequest) {
  return request('/admin/announcement/update', { method: 'POST', body: JSON.stringify(body) })
}

/** 管理端：删除公告 DELETE /admin/announcement/:id（软删除） */
export function deleteAnnouncement(id: number) {
  return request(`/admin/announcement/${id}`, { method: 'DELETE' })
}
