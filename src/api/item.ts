// src/api/item.ts
import { request } from './http'

// 帖子类型：0 丢失(lost) 1 拾到/招领(found)
export type ItemType = 0 | 1

// 标签 / 地点（公开列表，用于筛选器与发布表单）
export interface TagDTO {
  id: number
  name: string
  color?: string
  sort_order: number
}
export interface LocationDTO {
  id: number
  name: string
  parent_id: number
  level: number
  address?: string
  sort_order: number
}

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

/** 创建帖子：POST /item/create（创建即发布，无需审核，所有人可见）。
 * 注意：后端该接口返回 {} 不返回 id，前端发布后需改用 listMyItems 取最新 id 再传图。 */
export function createItem(payload: CreateItemPayload) {
  return request<{ id: number }>('/item/create', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/** 我的发布（当前登录用户）：GET /item/mine，返回结构同 /item/list。
 * 用于弥补 /item/create 不返回 id 的缺口——发布后取最新一条拿 id 再传图。 */
export function listMyItems(params: ListItemsParams = {}) {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) qs.append(k, String(v))
  })
  const query = qs.toString()
  return request<ItemListResult>(`/item/mine${query ? '?' + query : ''}`)
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
  claimed_by?: number      // 认领人 user_id（后端若返回，用于前端判定“我是否认领”）
  location_detail?: string
  images?: { image_url: string; sort_order: number }[]
  tags?: TagDTO[]            // 后端返回完整标签对象数组
  locations?: LocationDTO[]  // 后端返回地点链（从根到叶）
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

/** 首页“件物品正在被认真寻找”计数：GET /item/count，data 直接是数字 */
export function getItemCount() {
  return request<number>('/item/count')
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

// —— 标签 / 地点（公开列表，用于筛选器与发布表单）——
/** 标签列表（公开，按 sort_order 升序）：GET /tag/list，data 直接是 TagDTO[] */
export function listTags() {
  return request<TagDTO[]>('/tag/list')
}

/** 地点列表（公开，可按 parent_id/level 筛选）：GET /location/list，data 直接是 LocationDTO[] */
export function listLocations(params: { parent_id?: number; level?: number } = {}) {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) qs.append(k, String(v))
  })
  const query = qs.toString()
  return request<LocationDTO[]>(`/location/list${query ? '?' + query : ''}`)
}

// —— 物品管理：真实增删改（本人操作）——
export interface UpdateItemPayload {
  id: number
  title?: string
  description?: string
  location_id?: number
  location_detail?: string
  lost_found_time?: string
  contact?: string
  credit_reward?: number
  tag_ids?: number[]
}

/** 增量更新自己的物品：POST /item/update */
export function updateItem(payload: UpdateItemPayload) {
  return request<null>('/item/update', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/** 删除自己的物品（逻辑删除）：POST /item/delete，body { id } */
export function deleteItem(id: number) {
  return request<null>('/item/delete', {
    method: 'POST',
    body: JSON.stringify({ id }),
  })
}

/** 发布者关闭（下架）自己的物品：POST /item/{id}/close */
export function closeItem(id: number) {
  return request<null>(`/item/${id}/close`, {
    method: 'POST',
  })
}


// —— 认领流程（status: 0已发布/招领中 -> 1已认领 -> 2已关闭；无审核环节）——
/** 认领物品：POST /item/:id/claim（非发布者；status 0->1）。
 * 错误码：30006 未绑定QQ / 20003 已被认领 / 20002 已关闭 / 30004 认领自己 */
export function claimItem(id: number) {
  return request<null>(`/item/${id}/claim`, { method: 'POST' })
}
/** 撤销认领：POST /item/:id/claim/cancel（认领者或发布者；status 1->0） */
export function cancelClaim(id: number) {
  return request<null>(`/item/${id}/claim/cancel`, { method: 'POST' })
}
/** 发布者确认认领：POST /item/:id/confirm（status 1->2，发放积分） */
export function confirmItem(id: number) {
  return request<null>(`/item/${id}/confirm`, { method: 'POST' })
}
