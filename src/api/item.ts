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