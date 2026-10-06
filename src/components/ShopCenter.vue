<script setup lang="ts">
// 积分商城（学生端）：商品兑换 + 我的兑换记录 + 积分明细（页内 Tab）
// 注：「积分明细」为占位 Tab —— 后端已建 credit_logs 流水表并有写入，但**没有查询接口**
//（错误码 50002 标注「预留（无流水查询接口）」），故本期不做假数据，等后端开放后再接入。
// 契约：GET /shop/goods/list（公开）、POST /shop/goods/:id/redeem（需登录 + 已绑 QQ）、GET /shop/orders（需登录）
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAppStore } from '../stores/app'
import { listGoods, listMyOrders, redeemGood } from '../api/shop'
import type { GoodDTO, OrderDTO } from '../api/shop'
import { resolveImageUrl } from '../utils/image'

const emit = defineEmits<{ 'open-settings': [] }>()
const store = useAppStore()

const tab = ref<'goods' | 'orders' | 'credits'>('goods')

// —— 我的积分 / QQ 绑定前置校验 ——
// 后端兑换前置要求：必须已绑定 QQ（未绑 → 11005）；这里先用 /user/me 的 qq 字段预判，避免用户白填
const credit = computed(() => store.authUser?.credit ?? 0)
const boundQQ = computed(() => (store.authUser?.qq || '').trim())
const canRedeem = computed(() => !!boundQQ.value)
function goBindQQ() { emit('open-settings') }

// —— 商品列表（GET /shop/goods/list）——
// 积分区间：后端语义 0 / 不传 = 该侧不限，故这里用 0 表示「不限」，不做 undefined 处理
const goods = ref<GoodDTO[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(12)
const keyword = ref('')
const minPrice = ref(0)
const maxPrice = ref(0)
const loading = ref(false)
const loadError = ref('')

async function loadGoods() {
  // 前端预检 min>max，避免白跑一次（后端该情况返回 1 参数错误）
  if (maxPrice.value > 0 && minPrice.value > maxPrice.value) {
    goods.value = []
    total.value = 0
    loadError.value = '积分区间不合法：最低积分不能大于最高积分'
    return
  }
  loading.value = true
  loadError.value = ''
  try {
    const res = await listGoods({
      keyword: keyword.value.trim() || undefined,
      min_price: minPrice.value,
      max_price: maxPrice.value,
      page: page.value,
      page_size: pageSize.value,
    })
    goods.value = res.data?.items ?? []
    total.value = res.data?.total ?? 0
  } catch (e) {
    goods.value = []
    total.value = 0
    loadError.value = (e as Error).message || '商品加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

// 筛选条件变化：回到第 1 页 + 300ms 防抖（与首页筛选栏一致，避免每敲一字打一次后端）
let filterTimer: ReturnType<typeof setTimeout> | null = null
watch([keyword, minPrice, maxPrice], () => {
  page.value = 1
  if (filterTimer) clearTimeout(filterTimer)
  filterTimer = setTimeout(loadGoods, 300)
})
function resetFilters() {
  if (!keyword.value && !minPrice.value && !maxPrice.value) return
  keyword.value = ''
  minPrice.value = 0
  maxPrice.value = 0
  page.value = 1
}
function onPage(p: number) { page.value = p; loadGoods() }
function onPageSize(s: number) { pageSize.value = s; page.value = 1; loadGoods() }

// —— 兑换（POST /shop/goods/:id/redeem）：单事务扣库存 + 扣积分 + 写订单快照 ——
const redeemingId = ref<number | null>(null)
async function onRedeem(g: GoodDTO) {
  if (!canRedeem.value) {
    ElMessage.warning('兑换需先绑定 QQ，请前往「账号设置」完成绑定')
    return
  }
  if (g.stock <= 0) {
    ElMessage.warning('该商品暂时缺货，换一件试试吧')
    return
  }
  try {
    await ElMessageBox.confirm(
      `确认使用 ${g.price} 积分兑换「${g.name}」？兑换成功后将扣除积分并生成订单。`,
      '兑换确认',
      { type: 'warning', confirmButtonText: '确认兑换', cancelButtonText: '再想想' }
    )
  } catch { return }

  redeemingId.value = g.id
  try {
    const res = await redeemGood(g.id)
    const r = res.data
    await ElMessageBox.alert(
      `订单号：${r.order_no}\n消耗积分：${r.price}\n剩余积分：${r.credit}\n\n领取奖励请联系管理员（已同步发送站内通知）。`,
      '兑换成功',
      { confirmButtonText: '知道了' }
    )
    await loadGoods()          // 库存 / 可兑换状态可能已变
    await store.initSession()  // 刷新顶栏积分与未读通知
    ordersLoaded.value = false // 下次进「我的兑换记录」Tab 时重新拉取
  } catch (e) {
    ElMessage.error((e as Error).message || '兑换失败，请稍后重试')
  } finally {
    redeemingId.value = null
  }
}

// —— 我的兑换记录（GET /shop/orders，订单为快照设计，商品改名/下架不影响历史）——
const orders = ref<OrderDTO[]>([])
const orderTotal = ref(0)
const orderPage = ref(1)
const orderPageSize = ref(10)
const orderLoading = ref(false)
const ordersLoaded = ref(false)

async function loadOrders() {
  orderLoading.value = true
  try {
    const res = await listMyOrders({ page: orderPage.value, page_size: orderPageSize.value })
    orders.value = res.data?.orders ?? []
    orderTotal.value = res.data?.total ?? 0
    ordersLoaded.value = true
  } catch (e) {
    orders.value = []
    orderTotal.value = 0
    ElMessage.error((e as Error).message || '兑换记录加载失败')
  } finally {
    orderLoading.value = false
  }
}
function onOrderPage(p: number) { orderPage.value = p; loadOrders() }
function onOrderPageSize(s: number) { orderPageSize.value = s; orderPage.value = 1; loadOrders() }

watch(tab, (t) => {
  if (t === 'orders' && !ordersLoaded.value) loadOrders()
})

function shortDate(iso: string) { return (iso || '').slice(0, 10) }

onMounted(loadGoods)
</script>

<template>
  <section class="shop-page">
    <div class="section-intro">
      <span class="eyebrow">POINTS STORE</span>
      <h1>积分商城</h1>
      <p>用「拾金不昧」积攒的积分，兑换属于你的校园小惊喜。</p>
    </div>

    <!-- 积分卡：我的积分 + QQ 绑定前置状态 -->
    <div class="shop-credit-bar">
      <div class="shop-credit-main">
        <span class="shop-credit-label">我的积分</span>
        <strong class="shop-credit-value">{{ credit }}</strong>
      </div>
      <div class="shop-credit-side">
        <template v-if="canRedeem">
          <span class="shop-qq-ok">已绑定 QQ {{ boundQQ }}</span>
        </template>
        <template v-else>
          <span class="shop-qq-warn">未绑定 QQ，暂不能兑换</span>
          <el-button size="small" @click="goBindQQ">去绑定</el-button>
        </template>
      </div>
    </div>

    <el-tabs v-model="tab" class="shop-tabs">
      <el-tab-pane label="商品兑换" name="goods">
        <div class="shop-filter">
          <el-input v-model="keyword" clearable placeholder="搜索商品名称" class="shop-filter-keyword" />
          <div class="shop-filter-price">
            <el-input-number v-model="minPrice" :min="0" :max="1000000" :step="10" controls-position="right" />
            <span class="shop-filter-dash">—</span>
            <el-input-number v-model="maxPrice" :min="0" :max="1000000" :step="10" controls-position="right" />
            <span class="shop-filter-hint">积分区间（0 表示不限）</span>
          </div>
          <button class="shop-filter-reset" type="button" @click="resetFilters">重置筛选</button>
        </div>

        <el-skeleton v-if="loading" :rows="4" animated />

        <template v-else>
          <el-alert v-if="loadError" :title="loadError" type="error" :closable="false" show-icon class="shop-alert" />
          <div v-else-if="goods.length" class="shop-grid">
            <article v-for="g in goods" :key="g.id" class="shop-card">
              <div class="shop-card-cover">
                <img v-if="g.image_url" :src="resolveImageUrl(g.image_url)" :alt="g.name" />
                <span v-else class="shop-card-placeholder">◆</span>
                <em v-if="g.stock <= 0" class="shop-card-soldout">缺货</em>
              </div>
              <div class="shop-card-body">
                <h3 class="shop-card-name">{{ g.name }}</h3>
                <p v-if="g.description" class="shop-card-desc">{{ g.description }}</p>
                <div class="shop-card-meta">
                  <span class="shop-card-price">{{ g.price }} <i>积分</i></span>
                  <span class="shop-card-stock">库存 {{ g.stock }}</span>
                </div>
                <el-button
                  class="shop-card-btn"
                  type="primary"
                  :loading="redeemingId === g.id"
                  :disabled="!canRedeem || g.stock <= 0"
                  @click="onRedeem(g)"
                >{{ g.stock <= 0 ? '暂不可兑换' : (canRedeem ? '立即兑换' : '需先绑定 QQ') }}</el-button>
              </div>
            </article>
          </div>
          <el-empty v-else description="商城暂无商品，稍后再来看看吧" />
        </template>

        <div v-if="!loading && total > pageSize" class="shop-pagination">
          <el-pagination
            :current-page="page"
            :page-size="pageSize"
            :page-sizes="[12, 24, 48]"
            :total="total"
            layout="total, sizes, prev, pager, next"
            background
            @current-change="onPage"
            @size-change="onPageSize"
          />
        </div>
      </el-tab-pane>

      <el-tab-pane label="我的兑换记录" name="orders">
        <el-table :data="orders" v-loading="orderLoading" stripe empty-text="还没有兑换记录">
          <el-table-column prop="order_no" label="订单号" min-width="190" />
          <el-table-column prop="goods_name" label="商品" min-width="160" />
          <el-table-column label="消耗积分" width="110">
            <template #default="{ row }">{{ row.price }}</template>
          </el-table-column>
          <el-table-column label="QQ" width="130">
            <template #default="{ row }">{{ row.qq || '—' }}</template>
          </el-table-column>
          <el-table-column label="兑换时间" width="130">
            <template #default="{ row }">{{ shortDate(row.created_at) }}</template>
          </el-table-column>
        </el-table>
        <div v-if="orderTotal > orderPageSize" class="shop-pagination">
          <el-pagination
            :current-page="orderPage"
            :page-size="orderPageSize"
            :page-sizes="[10, 20, 50]"
            :total="orderTotal"
            layout="total, sizes, prev, pager, next"
            background
            @current-change="onOrderPage"
            @size-change="onOrderPageSize"
          />
        </div>
        <p class="shop-orders-tip">订单为快照记录，商品改名或下架不影响历史订单。领取奖励请联系管理员。</p>
      </el-tab-pane>

      <!-- 积分明细：占位（后端 credit_logs 表已就绪但无查询接口），不做任何本地假数据 -->
      <el-tab-pane label="积分明细" name="credits">
        <el-alert
          type="info"
          show-icon
          :closable="false"
          title="积分明细等待后端接口"
          description="后端已建 credit_logs 积分流水表（变动金额、变动前后积分、类型、说明、时间）并正常写入，但尚未开放查询接口，因此这里暂不展示数据；接口就绪后会直接列出每一笔积分变动。当前积分可在顶栏「我的积分」查看。"
        />
        <p class="shop-orders-tip">在此之前，每次积分变动都会同步发送一条类型为「积分变动」的站内通知，可在顶栏铃铛中查看最近的变动金额与余额。</p>
      </el-tab-pane>
    </el-tabs>
  </section>
</template>

<style scoped>
.shop-page{max-width:var(--page-max)}
.shop-credit-bar{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:18px 22px;margin:22px 0 8px;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-lg);box-shadow:var(--shadow-xs)}
.shop-credit-main{display:flex;align-items:baseline;gap:10px}
.shop-credit-label{color:var(--muted);font-size:12px}
.shop-credit-value{font-size:30px;line-height:1;color:var(--green);letter-spacing:-.5px}
.shop-credit-side{display:flex;align-items:center;gap:10px}
.shop-qq-ok{color:var(--green);font-size:12px;background:var(--mint);border-radius:20px;padding:5px 12px}
.shop-qq-warn{color:#ad7a3c;font-size:12px;background:#fff8de;border:1px solid #f5e7ad;border-radius:20px;padding:5px 12px}
.shop-tabs{margin-top:14px}
.shop-filter{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:14px 16px;margin-bottom:18px;background:#fff;border:1px solid var(--line);border-radius:12px}
.shop-filter-keyword{width:240px}
.shop-filter-price{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.shop-filter-price :deep(.el-input-number){width:140px}
.shop-filter-dash{color:#a0aaa5}
.shop-filter-hint{color:var(--muted);font-size:12px}
.shop-filter-reset{margin-left:auto;padding:8px 14px;border:1px solid var(--line);border-radius:8px;background:#fff;color:#6b7a73;font-size:12px}
.shop-filter-reset:hover{border-color:var(--green);color:var(--green)}
.shop-alert{margin-bottom:18px}
.shop-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(228px,1fr));gap:16px}
.shop-card{display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-lg);overflow:hidden;box-shadow:var(--shadow-xs);transition:transform var(--dur) var(--ease),box-shadow var(--dur) var(--ease),border-color var(--dur) var(--ease)}
.shop-card:hover{transform:translateY(-4px);box-shadow:var(--shadow-hover);border-color:var(--green-light)}
.shop-card-cover{position:relative;height:132px;display:grid;place-items:center;background:#edf5ee;overflow:hidden}
.shop-card-cover img{width:100%;height:100%;object-fit:cover}
.shop-card-placeholder{font-size:34px;color:#b6cdc2}
.shop-card-soldout{position:absolute;top:10px;right:10px;background:#b9c4bf;color:#fff;font-size:10px;font-style:normal;border-radius:10px;padding:2px 9px}
.shop-card-body{display:flex;flex-direction:column;gap:8px;padding:14px 16px 16px;flex:1}
.shop-card-name{margin:0;font-size:14px;line-height:1.4}
.shop-card-desc{margin:0;color:var(--muted);font-size:12px;line-height:1.6;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.shop-card-meta{display:flex;align-items:center;justify-content:space-between;margin-top:auto}
.shop-card-price{color:var(--green);font-size:19px;font-weight:700}
.shop-card-price i{font-size:11px;font-style:normal;font-weight:500}
.shop-card-stock{color:#9aa9a1;font-size:11px}
.shop-card-btn{width:100%;margin-top:4px}
.shop-card-btn :deep(span){font-size:13px}
.shop-pagination{display:flex;justify-content:center;padding:22px 0 4px}
.shop-orders-tip{margin:14px 0 0;color:var(--muted);font-size:12px}
@media(max-width:700px){
  .shop-filter-keyword{width:100%}
  .shop-filter-price :deep(.el-input-number){width:120px}
  .shop-filter-reset{margin-left:0}
  .shop-grid{grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px}
}
</style>
