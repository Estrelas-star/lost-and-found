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