// src/api/shop.ts
// 积分商城（shop / goods / orders）
// 契约来源：LNF-SERVER/agent.md/api_agent.md §2.8、api_guide.md §八
//   · 公开：GET /shop/goods/list（keyword + min_price/max_price 闭区间，page_size 上限 100 正常生效）
//           GET /shop/goods/:goodsID（不存在/已下架 → 11001）
//   · 需登录：POST /shop/goods/:goodsID/redeem（单事务扣库存+扣积分+写订单快照，前置必须已绑定 QQ）
//            GET /shop/orders（我的兑换记录，快照设计，商品改名/下架不影响历史）
//   · 管理员（role≥1）：POST /shop/goods/create | update | delete（软删=下架）
import { request } from './http'

/** 商品（GET /shop/goods/list、GET /shop/goods/:goodsID） */
export interface GoodDTO {
  id: number
  name: string
  description?: string
  image_url?: string   // 相对路径，展示需经 resolveImageUrl 拼 VITE_IMAGE_BASE_URL
  price: number        // 兑换所需积分
  stock: number        // 0 表示暂不可兑换
  sort_order: number
  created_at: string
  updated_at: string
}

export interface GoodListResult {
  total: number
  page: number
  page_size: number
  items: GoodDTO[]
}

/** 兑换订单（快照设计：商品改名/下架不影响历史记录） */
export interface OrderDTO {
  id: number
  order_no: string
  user_id: number
  goods_id: number
  goods_name: string
  price: number
  qq: string
  nickname: string
  created_at: string
}

export interface OrderListResult {
  total: number
  page: number
  page_size: number
  orders: OrderDTO[]
}

/** 兑换成功响应：订单号 + 兑换后剩余积分（积分与 type=5 通知同源） */
export interface RedeemGoodsResult {
  order_no: string
  goods_id: number
  goods_name: string
  price: number
  credit: number
  created_at: string
}

export interface ListGoodsParams {
  keyword?: string
  min_price?: number
  max_price?: number
  page?: number
  page_size?: number
}

/** 新增商品（管理员）：name 1-100 字且不可与未下架商品重名 */
export interface CreateGoodRequest {
  name: string
  description?: string
  image_url?: string
  price: number        // 1 ~ 1000000
  stock?: number       // ≥0，缺省 0
  sort_order?: number
}

/** 增量更新商品（管理员）：只传要改的字段 */
export interface UpdateGoodRequest {
  id: number
  name?: string
  description?: string
  image_url?: string
  price?: number
  stock?: number
  sort_order?: number
}

/** 把可选查询参数拼成 query string（空串/undefined/null 一律不发） */
function toQuery(params: Record<string, string | number | undefined | null>): string {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.append(k, String(v))
  })
  const q = qs.toString()
  return q ? '?' + q : ''
}

// —— 公开接口 ——

/** 商品列表（无需登录）：GET /shop/goods/list，排序 sort_order ASC, created_at DESC, id DESC */
export function listGoods(params: ListGoodsParams = {}) {
  return request<GoodListResult>(`/shop/goods/list${toQuery(params)}`)
}

/** 商品详情（无需登录）：GET /shop/goods/:goodsID，不存在/已下架 → 11001 */
export function getGood(goodsID: number) {
  return request<GoodDTO>(`/shop/goods/${goodsID}`)
}

// —— 需登录 ——

/**
 * 积分兑换：POST /shop/goods/:goodsID/redeem
 * 前置要求：必须已绑定 QQ（未绑 → 11005）
 * 错误码：10006 账号问题 / 11001 商品不存在或已下架 / 11002 库存不足 / 50001 积分不足
 * 成功后后端自动发两条站内通知（type=5 积分变动、type=6 商品兑换）与一条 QQ 群 @ 消息；领奖需联系管理员
 */
export function redeemGood(goodsID: number) {
  return request<RedeemGoodsResult>(`/shop/goods/${goodsID}/redeem`, { method: 'POST' })
}

/** 我的兑换记录（需登录）：GET /shop/orders，created_at DESC */
export function listMyOrders(params: { page?: number; page_size?: number } = {}) {
  return request<OrderListResult>(`/shop/orders${toQuery(params)}`)
}

// —— 管理员（role≥1）——

/** 新增商品：POST /shop/goods/create（11003 名空/超长/重名，11004 价格非法） */
export function createGood(body: CreateGoodRequest) {
  return request<null>('/shop/goods/create', { method: 'POST', body: JSON.stringify(body) })
}

/** 更新商品（增量）：POST /shop/goods/update */
export function updateGood(body: UpdateGoodRequest) {
  return request<null>('/shop/goods/update', { method: 'POST', body: JSON.stringify(body) })
}

/** 下架商品（软删，历史订单不受影响）：POST /shop/goods/delete，body { id } */
export function deleteGood(id: number) {
  return request<null>('/shop/goods/delete', { method: 'POST', body: JSON.stringify({ id }) })
}
