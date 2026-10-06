<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import MetricCard from './MetricCard.vue'
import { useAppStore } from '../stores/app'
import {
  getStatsOverview,
  getStatsTrend,
  getStatsLocations,
  getStatsTimeHeatmap,
  getStatsStagnant,
  getStatsHighView,
  getStatsReturnDuration,
  getStatsDistribution,
  getStatsFunnel,
  type OverviewResponse,
  type TrendResponse,
  type LocationsResponse,
  type HeatmapResponse,
  type StatsItemsResponse,
  type StatsDurationResponse,
  type StatsDistributionResponse,
  type StatsFunnelResponse,
  type StatsMetric,
} from '../api/stats'

const days = ref(30)
const loading = ref(false)
const error = ref('')
const updatedAt = ref('')

const overview = ref<OverviewResponse | null>(null)
const trend = ref<TrendResponse | null>(null)
const locations = ref<LocationsResponse | null>(null)
const heatmap = ref<HeatmapResponse | null>(null)
const stagnant = ref<StatsItemsResponse | null>(null)
const highView = ref<StatsItemsResponse | null>(null)
const duration = ref<StatsDurationResponse | null>(null)
const distribution = ref<StatsDistributionResponse | null>(null)
const funnel = ref<StatsFunnelResponse | null>(null)

const rangeOptions = [
  { label: '近 7 天', value: 7 },
  { label: '近 30 天', value: 30 },
  { label: '近 90 天', value: 90 },
]

async function loadAll() {
  loading.value = true
  error.value = ''
  try {
    const d = days.value
    const [
      ov,
      tr,
      loc,
      hm,
      st,
      hv,
      rd,
      dis,
      fn,
    ] = await Promise.all([
      getStatsOverview(d),
      getStatsTrend(d),
      getStatsLocations(d, 10),
      getStatsTimeHeatmap(d),
      getStatsStagnant(d, 1, 10),
      getStatsHighView(d, 1, 10),
      getStatsReturnDuration(d),
      getStatsDistribution('type', d),
      getStatsFunnel(d),
    ])
    overview.value = ov.data
    trend.value = tr.data
    locations.value = loc.data
    heatmap.value = hm.data
    stagnant.value = st.data
    highView.value = hv.data
    duration.value = rd.data
    distribution.value = dis.data
    funnel.value = fn.data
    updatedAt.value = new Date().toLocaleString('zh-CN', { hour12: false })
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(loadAll)

const trendMax = computed(() => {
  if (!trend.value) return 1
  const vals = trend.value.points.flatMap((p) => [p.published, p.returned])
  return Math.max(1, ...vals)
})

const heatMax = computed(() => {
  if (!heatmap.value) return 1
  let m = 0
  for (const row of heatmap.value.matrix) for (const v of row) if (v > m) m = v
  return Math.max(1, m)
})

const heatRows = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

const appStore = useAppStore()

// 地点 id -> 直属父级名称（高频地点重名时用于消歧，如「2号（梦溪村）」）
const locParentById = computed<Record<number, string>>(() => {
  const m: Record<number, string> = {}
  for (const l of appStore.locations) {
    if (l.parent_id) {
      const parent = appStore.locations.find((p) => p.id === l.parent_id)
      if (parent) m[l.id] = parent.name
    }
  }
  return m
})

function locNameShown(loc: { location_id: number; name: string }) {
  const list = locations.value?.locations ?? []
  const dup = list.filter((x) => x.name === loc.name).length > 1
  if (dup) {
    const parent = locParentById.value[loc.location_id]
    if (parent) return `${loc.name}（${parent}）`
  }
  return loc.name
}

function trendLabel(date: string) {
  return date.slice(5) // MM-DD
}

function trendLabelVisible(i: number) {
  return i % 5 === 0 || i === (trend.value?.points.length ?? 0) - 1
}

function heatColor(v: number) {
  const ratio = v / heatMax.value
  // 浅薄荷 -> 深绿
  const r = Math.round(216 - ratio * 96)
  const g = Math.round(241 - ratio * 130)
  const b = Math.round(232 - ratio * 120)
  return `rgb(${r},${g},${b})`
}

function typeName(name: string) {
  if (name === 'found') return '招领'
  if (name === 'lost') return '寻物'
  return name
}

const distMax = computed(() =>
  Math.max(1, ...(distribution.value?.buckets.map((b) => b.published) ?? [1]))
)

const funnelMax = computed(() => funnel.value?.stages[0]?.users ?? 1)

const funnelNames: Record<string, string> = {
  registered: '注册用户',
  published: '发布信息',
  claimed: '发起认领',
  returned: '成功归还',
}

function formatDuration(seconds: number) {
  if (!seconds) return '—'
  if (seconds < 3600) return `${Math.round(seconds / 60)} 分钟`
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)} 小时`
  return `${(seconds / 86400).toFixed(1)} 天`
}

function itemStatusText(s: number) {
  if (s === 0) return '在架'
  if (s === 1) return '已认领'
  if (s === 2) return '已下架'
  return `状态${s}`
}

function itemTypeText(t: number) {
  return t === 1 ? '招领' : t === 0 ? '寻物' : `类型${t}`
}

function trendText(m: StatsMetric | undefined) {
  if (!m) return '—'
  if (m.comparable && m.change_percent != null) {
    const sign = m.change_percent > 0 ? '+' : ''
    return `${sign}${m.change_percent.toFixed(1)}% 环比`
  }
  return '本统计周期'
}

function pct(v: number) {
  return `${(v * 100).toFixed(1)}%`
}
</script>

<template>
  <div class="dash">
    <div class="section-intro">
      <span class="eyebrow">OVERVIEW</span>
      <h1>校园失物招领总览</h1>
      <p>数据会说话，看看校园里正在发生什么。</p>
    </div>

    <div class="dash-toolbar">
      <el-radio-group v-model="days" size="small" @change="loadAll">
        <el-radio-button v-for="opt in rangeOptions" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </el-radio-button>
      </el-radio-group>
      <button class="refresh-btn" :disabled="loading" @click="loadAll">
        {{ loading ? '加载中…' : '刷新' }}
      </button>
      <span v-if="updatedAt" class="updated-at">更新于 {{ updatedAt }}</span>
    </div>

    <div v-if="error" class="dash-error">⚠ {{ error }}</div>

    <div v-if="loading && !overview" class="dash-loading">正在加载统计数据…</div>

    <template v-if="overview">
      <!-- 概览四指标 -->
      <div class="metrics">
        <MetricCard label="累计发布" :value="overview.published.value" :trend="trendText(overview.published)" tone="mint" />
        <MetricCard label="成功归还" :value="overview.returned.value" :trend="trendText(overview.returned)" tone="yellow" />
        <MetricCard label="待处理" :value="overview.pending.value" :trend="`其中 24h 内 ${overview.pending_over_24h} 条`" tone="coral" />
        <MetricCard label="总体归还率" :value="pct(overview.return_rate.value / 100)" :trend="trendText(overview.return_rate as unknown as StatsMetric)" tone="blue" />
      </div>

      <div class="dashboard-grid">
        <!-- 趋势 -->
        <div class="panel chart-panel">
          <div class="panel-head"><h2>近 {{ days }} 日趋势</h2><span>发布量 / 归还量</span></div>
          <div v-if="trend && trend.points.length" class="trend-chart">
            <div v-for="(p, i) in trend.points" :key="p.date" class="trend-col">
              <div class="trend-bars">
                <i class="bar pub" :style="{ height: (p.published / trendMax * 100) + '%' }" :title="`${trendLabel(p.date)} 发布 ${p.published}`" />
                <i class="bar ret" :style="{ height: (p.returned / trendMax * 100) + '%' }" :title="`${trendLabel(p.date)} 归还 ${p.returned}`" />
              </div>
              <span class="trend-x" :style="{ visibility: trendLabelVisible(i) ? 'visible' : 'hidden' }">{{ trendLabel(p.date) }}</span>
            </div>
          </div>
          <div v-else class="empty-state">暂无趋势数据</div>
        </div>

        <!-- 类型分布 -->
        <div class="panel">
          <div class="panel-head"><h2>物品类型分布</h2><span>按发布量</span></div>
          <div v-if="distribution && distribution.buckets.length" class="dist-list">
            <div v-for="b in distribution.buckets" :key="b.bucket_id" class="dist-row">
              <div class="dist-top"><strong>{{ typeName(b.bucket_name) }}</strong><span>{{ b.published }} 条 · 归还率 {{ b.return_rate.toFixed(1) }}%</span></div>
              <i class="dist-track"><b :style="{ width: (b.published / distMax * 100) + '%' }" /></i>
            </div>
          </div>
          <div v-else class="empty-state">暂无分布数据</div>
        </div>
      </div>

      <div class="dashboard-grid">
        <!-- 高频地点 -->
        <div class="panel">
          <div class="panel-head"><h2>高频地点</h2><span>发布数量 Top {{ locations ? locations.locations.length : 0 }}</span></div>
          <div v-if="locations && locations.locations.length" class="rank-list">
            <div v-for="(p, i) in locations.locations" :key="p.location_id" class="rank-row">
              <span class="rank-no">{{ i + 1 }}</span>
              <strong>{{ locNameShown(p) }}</strong>
              <i class="rank-track"><b :style="{ width: p.percent + '%' }" /></i>
              <em>{{ p.count }}</em>
            </div>
            <div v-if="locations.unknown" class="rank-row unknown">
              <span class="rank-no">·</span><strong>{{ locations.unknown.name }}</strong>
              <i class="rank-track"><b :style="{ width: locations.unknown.percent + '%' }" /></i>
              <em>{{ locations.unknown.count }}</em>
            </div>
          </div>
          <div v-else class="empty-state">暂无地点数据</div>
        </div>

        <!-- 时段热力图 -->
        <div class="panel">
          <div class="panel-head"><h2>发布时段热力图</h2><span>星期 × 小时</span></div>
          <div v-if="heatmap && heatmap.matrix.length" class="heatmap">
            <div class="heat-row" v-for="(row, ri) in heatmap.matrix" :key="ri">
              <span class="heat-rowlabel">{{ heatRows[ri] }}</span>
              <span v-for="(v, ci) in row" :key="ci" class="heat-cell" :style="{ background: heatColor(v) }" :title="`${heatRows[ri]} ${ci}:00 · ${v} 条`" />
            </div>
            <div class="heat-axis"><span /><span>0</span><span>6</span><span>12</span><span>18</span><span>23 时</span></div>
          </div>
          <div v-else class="empty-state">暂无热力图数据</div>
        </div>
      </div>

      <div class="dashboard-grid">
        <!-- 参与漏斗 -->
        <div class="panel">
          <div class="panel-head"><h2>参与漏斗</h2><span>注册 → 归还</span></div>
          <div v-if="funnel && funnel.stages.length" class="funnel">
            <div v-for="(s, i) in funnel.stages" :key="s.stage" class="funnel-row">
              <span class="funnel-name">{{ funnelNames[s.stage] || s.stage }}</span>
              <i class="funnel-track"><b :style="{ width: (s.users / funnelMax * 100) + '%' }" /></i>
              <em>{{ s.users }} 人</em>
              <small v-if="i > 0 && funnel.adjacent_ratios[i - 1] != null">转化 {{ (funnel.adjacent_ratios[i - 1] * 100).toFixed(0) }}%</small>
            </div>
          </div>
          <div v-else class="empty-state">暂无漏斗数据</div>
        </div>

        <!-- 平均归还时长 -->
        <div class="panel">
          <div class="panel-head"><h2>平均归还时长</h2><span>{{ duration && duration.approximate ? '近似估算' : '统计口径' }}</span></div>
          <div v-if="duration" class="duration">
            <div class="duration-item">
              <small>平均</small>
              <strong>{{ formatDuration(duration.overall.average_seconds) }}</strong>
              <span>样本 {{ duration.overall.count }} 条</span>
            </div>
            <div class="duration-item">
              <small>中位数</small>
              <strong>{{ formatDuration(duration.overall.median_seconds) }}</strong>
              <span>更稳健的参考值</span>
            </div>
          </div>
          <div v-else class="empty-state">暂无时长数据</div>
        </div>
      </div>

      <!-- 物品清单 -->
      <div class="dashboard-grid">
        <div class="panel">
          <div class="panel-head"><h2>滞留待处理</h2><span>长期无人认领</span></div>
          <div v-if="stagnant && stagnant.items.length" class="item-table">
            <div class="it-row it-head"><span>标题</span><span>地点</span><span>滞留</span><span>浏览</span><span>状态</span></div>
            <div v-for="it in stagnant.items" :key="it.id" class="it-row">
              <span class="it-title">{{ it.title }}</span>
              <span>{{ it.location_name }}</span>
              <span>{{ it.stagnant_days }} 天</span>
              <span>{{ it.view_count }}</span>
              <span>{{ itemStatusText(it.status) }}</span>
            </div>
          </div>
          <div v-else class="empty-state">近期无滞留物品 🎉</div>
        </div>

        <div class="panel">
          <div class="panel-head"><h2>高浏览低认领</h2><span>值得跟进</span></div>
          <div v-if="highView && highView.items.length" class="item-table">
            <div class="it-row it-head"><span>标题</span><span>地点</span><span>类型</span><span>浏览</span><span>状态</span></div>
            <div v-for="it in highView.items" :key="it.id" class="it-row">
              <span class="it-title">{{ it.title }}</span>
              <span>{{ it.location_name }}</span>
              <span>{{ itemTypeText(it.type) }}</span>
              <span>{{ it.view_count }}</span>
              <span>{{ itemStatusText(it.status) }}</span>
            </div>
          </div>
          <div v-else class="empty-state">暂无此类物品</div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.dash { width: 100%; }
.section-intro { margin-bottom: 22px; }
.section-intro .eyebrow {
  display: block; color: #9aa9a1; text-transform: uppercase;
  letter-spacing: 1.5px; font-size: 10px; font-weight: 700; margin-bottom: 8px;
}
.section-intro h1 { margin: 0 0 6px; font-size: 26px; letter-spacing: -0.5px; }
.section-intro p { margin: 0; color: #75817d; font-size: 13px; }

.dash-toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; flex-wrap: wrap; }
/* 时间范围选择：选中态与 hover 统一主题绿色（不落回 Element 默认蓝） */
.dash-toolbar :deep(.el-radio-button__inner) { color: #3c5148; }
.dash-toolbar :deep(.el-radio-button__inner:hover) { color: var(--el-color-primary); }
.dash-toolbar :deep(.el-radio-button.is-active .el-radio-button__inner) {
  background-color: var(--el-color-primary);
  border-color: var(--el-color-primary);
  box-shadow: -1px 0 0 0 var(--el-color-primary);
  color: #fff;
}
.dash-toolbar :deep(.el-radio-button.is-active .el-radio-button__inner:hover) {
  background-color: var(--el-color-primary-dark-2);
  border-color: var(--el-color-primary-dark-2);
  box-shadow: -1px 0 0 0 var(--el-color-primary-dark-2);
  color: #fff;
}
.refresh-btn {
  padding: 6px 14px; border-radius: 7px; background: #fff; border: 1px solid #d4e2da;
  color: #42b983; font-size: 12px; font-weight: 600;
}
.refresh-btn:hover:not(:disabled) { background: #eef7f2; }
.refresh-btn:disabled { opacity: 0.6; cursor: default; }
.updated-at { color: #9aa9a1; font-size: 11px; }

.dash-error {
  margin-bottom: 16px; padding: 12px 14px; border-radius: 9px;
  background: #fdecec; color: #c0392b; font-size: 13px;
}
.dash-loading { padding: 40px; text-align: center; color: #9aa9a1; font-size: 13px; }

.metrics {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 16px;
}
.dashboard-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }

.panel {
  background: #fff; border: 1px solid #e4e9e4; border-radius: 12px; padding: 18px;
  min-width: 0;
}
.panel-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 14px; }
.panel-head h2 { margin: 0; font-size: 15px; }
.panel-head span { color: #9aa9a1; font-size: 11px; }

/* 趋势图 */
.trend-chart { display: flex; align-items: flex-end; gap: 3px; height: 160px; padding-top: 6px; }
.trend-col { flex: 1; display: flex; flex-direction: column; align-items: center; min-width: 0; }
.trend-bars { display: flex; align-items: flex-end; gap: 2px; height: 140px; width: 100%; justify-content: center; }
.trend-bars .bar { width: 46%; max-width: 9px; border-radius: 3px 3px 0 0; min-height: 2px; }
.trend-bars .pub { background: #42b983; }
.trend-bars .ret { background: #f0a98d; }
.trend-x { font-size: 11px; color: #6f7b75; margin-top: 5px; font-weight: 500; white-space: nowrap; }

/* 类型分布 */
.dist-list { display: flex; flex-direction: column; gap: 14px; }
.dist-top { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 6px; }
.dist-top strong { color: #19332f; }
.dist-top span { color: #9aa9a1; }
.dist-track { display: block; height: 8px; background: #eef3ef; border-radius: 4px; overflow: hidden; }
.dist-track b { display: block; height: 100%; background: #42b983; border-radius: 4px; }

/* 排名 */
.rank-list { display: flex; flex-direction: column; gap: 12px; }
.rank-row { display: flex; align-items: center; gap: 10px; font-size: 12px; }
.rank-row.unknown { color: #9aa9a1; }
.rank-no { width: 18px; text-align: center; color: #42b983; font-weight: 700; }
.rank-row strong { flex-shrink: 0; width: 112px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rank-track { flex: 1; height: 8px; background: #eef3ef; border-radius: 4px; overflow: hidden; }
.rank-track b { display: block; height: 100%; background: #f8e9ac; border-radius: 4px; }
.rank-row em { font-style: normal; color: #75817d; width: 28px; text-align: right; }

/* 热力图 */
.heatmap { display: flex; flex-direction: column; gap: 3px; }
.heat-row { display: flex; align-items: center; gap: 3px; }
.heat-rowlabel { width: 30px; font-size: 10px; color: #9aa9a1; flex-shrink: 0; }
.heat-cell { flex: 1; height: 14px; border-radius: 2px; min-width: 0; }
.heat-axis { display: flex; gap: 3px; margin-top: 4px; padding-left: 33px; }
.heat-axis span { flex: 1; font-size: 9px; color: #b6c0bb; text-align: center; }

/* 漏斗 */
.funnel { display: flex; flex-direction: column; gap: 12px; }
.funnel-row { display: flex; align-items: center; gap: 10px; font-size: 12px; flex-wrap: wrap; }
.funnel-name { width: 70px; flex-shrink: 0; color: #19332f; }
.funnel-track { flex: 1; height: 14px; background: #eef3ef; border-radius: 7px; overflow: hidden; min-width: 40px; }
.funnel-track b { display: block; height: 100%; background: linear-gradient(90deg, #42b983, #7bcda4); border-radius: 7px; }
.funnel-row em { font-style: normal; color: #75817d; width: 44px; text-align: right; }
.funnel-row small { color: #42b983; font-size: 11px; }

/* 时长 */
.duration { display: flex; gap: 16px; }
.duration-item { flex: 1; background: #f3f8f5; border-radius: 10px; padding: 16px; text-align: center; }
.duration-item small { display: block; color: #9aa9a1; font-size: 11px; margin-bottom: 6px; }
.duration-item strong { display: block; font-size: 22px; color: #42b983; }
.duration-item span { display: block; color: #9aa9a1; font-size: 11px; margin-top: 6px; }

/* 物品清单 */
.item-table { display: flex; flex-direction: column; font-size: 12px; }
.it-row { display: grid; grid-template-columns: 1.6fr 1fr 0.7fr 0.5fr 0.7fr; gap: 8px; padding: 9px 4px; border-bottom: 1px solid #f0f3f0; align-items: center; }
.it-row.it-head { color: #9aa9a1; font-size: 11px; border-bottom: 1px solid #e4e9e4; }
.it-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #19332f; }

.empty-state { padding: 30px; text-align: center; color: #aab4ae; font-size: 13px; }

@media (max-width: 900px) {
  .metrics { grid-template-columns: repeat(2, 1fr); }
  .dashboard-grid { grid-template-columns: 1fr; }
}
</style>
