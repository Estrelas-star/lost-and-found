import { request } from './http'

/**
 * 数据总览（管理员统计）接口 —— 对齐后端 admin-stats 契约
 * 权限：role >= 1（失物招领管理员 / 系统管理员）均可访问
 * 所有接口返回 { code:0, data:{...} } 信封，request 已统一处理 code/data
 */

export interface StatsMetric {
  value: number
  change_percent: number | null
  comparable: boolean
  previous: number
}

export interface StatsRateMetric {
  value: number // 已是百分比，如 5.26 表示 5.26%
  change_percent: number | null
  comparable: boolean
  previous: number
}

export interface StatsPeriod {
  start_date: string
  end_date: string
}

/** GET /admin/stats/overview —— 概览四指标 */
export interface OverviewResponse {
  pending: StatsMetric
  pending_over_24h: number
  period: StatsPeriod
  published: StatsMetric
  return_rate: StatsRateMetric
  returned: StatsMetric
}

/** GET /admin/stats/trend —— 每日发布/归还趋势 */
export interface TrendPoint {
  date: string // YYYY-MM-DD
  published: number
  returned: number
}
export interface TrendResponse {
  start_date: string
  end_date: string
  points: TrendPoint[]
}

/** GET /admin/stats/locations —— 地点分布 */
export interface LocationStat {
  location_id: number
  name: string
  count: number
  percent: number
}
export interface LocationsResponse {
  locations: LocationStat[]
  total: number
  unknown: LocationStat | null
}

/** GET /admin/stats/time-heatmap —— 发布时段热力图，matrix 为 7(星期) x 24(小时) */
export interface HeatmapResponse {
  start_date: string
  end_date: string
  matrix: number[][]
}

/** GET /admin/stats/items/stagnant —— 滞留待处理清单 */
export interface StatsItemRow {
  id: number
  title: string
  location_id: number
  location_name: string
  stagnant_days: number
  status: number
  type: number
  view_count: number
  created_at: string
}
export interface StatsItemsResponse {
  items: StatsItemRow[]
  page: number
  page_size: number
  total: number
}

/** GET /admin/stats/return-duration —— 近似归还时长（group_by 省略，仅 overall） */
export interface StatsDurationRow {
  average_seconds: number
  count: number
  group_id: number
  median_seconds: number
}
export interface StatsDurationResponse {
  approximate: boolean
  start_date: string
  end_date: string
  group_by: string
  groups: StatsDurationRow[]
  overall: StatsDurationRow
}

/** GET /admin/stats/distribution —— 维度分布（dimension: type / location / category ...） */
export interface StatsDistributionRow {
  bucket_id: number
  bucket_name: string
  percent: number
  published: number
  return_rate: number
  returned: number
}
export interface StatsDistributionResponse {
  buckets: StatsDistributionRow[]
  dimension: string
  end_date: string
  start_date: string
  total: number
}

/** GET /admin/stats/funnel —— 参与漏斗 */
export interface StatsFunnelRow {
  stage: string
  users: number
}
export interface StatsFunnelResponse {
  adjacent_ratios: number[]
  end_date: string
  stages: StatsFunnelRow[]
  start_date: string
}

function qs(params: Record<string, number | string | undefined> = {}): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') sp.set(k, String(v))
  }
  const q = sp.toString()
  return q ? '?' + q : ''
}

export function getStatsOverview(days = 30) {
  return request<OverviewResponse>(`/admin/stats/overview${qs({ days })}`)
}
export function getStatsTrend(days = 30) {
  return request<TrendResponse>(`/admin/stats/trend${qs({ days })}`)
}
export function getStatsLocations(days = 30, limit = 10) {
  return request<LocationsResponse>(`/admin/stats/locations${qs({ days, limit })}`)
}
export function getStatsTimeHeatmap(days = 30) {
  return request<HeatmapResponse>(`/admin/stats/time-heatmap${qs({ days })}`)
}
export function getStatsStagnant(days = 30, page = 1, pageSize = 10) {
  return request<StatsItemsResponse>(`/admin/stats/items/stagnant${qs({ days, page, page_size: pageSize })}`)
}
export function getStatsHighView(days = 30, minViews = 1, page = 1, pageSize = 10) {
  return request<StatsItemsResponse>(`/admin/stats/items/high-view${qs({ days, min_views: minViews, page, page_size: pageSize })}`)
}
export function getStatsReturnDuration(days = 30) {
  // 注意：group_by 传任何值后端都会报“请求参数错误”，故省略，只取 overall
  return request<StatsDurationResponse>(`/admin/stats/return-duration${qs({ days })}`)
}
export function getStatsDistribution(dimension: string, days = 30) {
  return request<StatsDistributionResponse>(`/admin/stats/distribution${qs({ dimension, days })}`)
}
export function getStatsFunnel(days = 30) {
  return request<StatsFunnelResponse>(`/admin/stats/funnel${qs({ days })}`)
}
