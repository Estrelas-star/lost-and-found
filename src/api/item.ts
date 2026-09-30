// src/api/item.ts
import { request } from './http'

// 帖子类型：0 丢失(lost) 1 拾到/招领(found)
export type ItemType = 0 | 1

// 创建帖子请求体 —— 对应后端 model.CreateItemRequest
// 必填：title, description, type, lost_found_time
export interface CreateItemPayload {
  title: string
  description: string
  type: ItemType
  lost_found_time: string       // 必填，时间字符串，如 new Date().toISOString()
  contact?: string
  credit_reward?: number
  location_id?: number
  location_detail?: string
  tag_ids?: number[]
}

/** 创建帖子：POST /item/create（创建即发布，无需审核，所有人可见） */
export function createItem(payload: CreateItemPayload) {
  return request<{ id: number }>('/item/create', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

// 后端返回的帖子对象 —— 对应 model.ItemResponse
export interface ItemDTO {
  id: number
  title: string
  description: string
  type: number          // 0丢失 1拾到
  status: number        // 0已发布 1已认领 2已关闭
  view_count: number
  contact?: string
  lost_found_time: string
  created_at: string
  updated_at: string
  user_id: number
  location_detail?: string
  images?: { image_url: string; sort_order: number }[]
}

export interface ListItemsParams {
  type?: number
  status?: number
  location_id?: number
  tag_id?: number
  keyword?: string
  page?: number
  page_size?: number
}

export interface ItemListResult {
  items: ItemDTO[]
  page: number
  page_size: number
  total: number
}

/** 公开列表：GET /item/list（首页/我的发布直接拉后端已发布帖子） */
export function listItems(params: ListItemsParams = {}) {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) qs.append(k, String(v))
  })
  const query = qs.toString()
  return request<ItemListResult>(`/item/list${query ? '?' + query : ''}`)
}

/** 设置物品图片：POST /item/{itemID}/images（覆盖式，传 image_url 数组） */
export function setItemImages(itemID: number, images: { image_url: string; sort_order: number }[]) {
  return request<null>(`/item/${itemID}/images`, {
    method: 'POST',
    body: JSON.stringify({ images }),
  })
}

// —— 举报审核（审核员专用，后端 /admin/reports，待洪烨实现）——
export type ReportStatus = 0 | 1 | 2 | 3   // 0待审核 1已通过 2已拒绝 3已处理
export type ReportTargetType = 0 | 1 | 2   // 0物品 1评论 2用户
export type ReportReason = 0 | 1 | 2 | 3   // 0虚假信息 1违规内容 2恶意行为 3其他

export interface ReportDTO {
  id: number
  reporter_id: number
  target_type: ReportTargetType
  target_id: number
  reason: ReportReason
  description?: string
  status: ReportStatus
  auditor_id?: number
  audit_comment?: string
  audited_at?: string
  created_at: string
  updated_at?: string
  // 前端补充：被举报物品摘要（target_type=0 时由 /item/:id 拉取或 mock 自带）
  item?: { id: number; title: string; type: number; status: number; description?: string; images?: { image_url: string; sort_order: number }[] }
}

export interface ListReportsParams {
  status?: ReportStatus
  target_type?: ReportTargetType
  target_id?: number
  page?: number
  page_size?: number
}

export interface ReportListResult {
  items: ReportDTO[]
  page: number
  page_size: number
  total: number
}

/** 列出举报（审核员）：GET /admin/reports */
export function listReports(params: ListReportsParams = {}) {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) qs.append(k, String(v))
  })
  const query = qs.toString()
  return request<ReportListResult>(`/admin/reports${query ? '?' + query : ''}`)
}

/** 审核单条举报：POST /admin/reports/:id/review */
export function reviewReport(id: number, payload: { status: 1 | 2 | 3; audit_comment?: string }) {
  return request<ReportDTO>(`/admin/reports/${id}/review`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/** 拉取单个帖子（公开）：GET /item/:itemID —— 用于展示被举报帖子摘要 */
export function getItem(itemID: number) {
  return request<ItemDTO>(`/item/${itemID}`)
}