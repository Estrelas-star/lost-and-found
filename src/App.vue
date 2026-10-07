<script setup lang="ts">
import { renderMarkdown, firstImageUrl, stripImages } from './utils/markdown'
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore, type Item, type ItemType, type Role } from './stores/app'
import { navItems } from './navigation'
import Dashboard from './components/Dashboard.vue'
import PublishForm from './components/PublishForm.vue'
import DetailDialog from './components/DetailDialog.vue'
import ManageItems from './components/ManageItems.vue'
import EditItemDialog from './components/EditItemDialog.vue'
import UserSettingsDialog from './components/UserSettingsDialog.vue'
import NotificationBell from './components/NotificationBell.vue'
import AnnouncementBell from './components/AnnouncementBell.vue'
import TagWall from './components/TagWall.vue'
import AdminUsers from './components/AdminUsers.vue'
import AnnouncementManager from './components/AnnouncementManager.vue'
import ShopCenter from './components/ShopCenter.vue'
import ManageGoods from './components/ManageGoods.vue'
import AgentAssistant from './components/AgentAssistant.vue'
import HelpCenter from './components/HelpCenter.vue'
import { getItem } from './api/item'
import { resolveImageUrl } from './utils/image'
import { ElMessage, ElMessageBox } from 'element-plus'

const store = useAppStore()
const router = useRouter()
const route = useRoute()
const search = ref('')
const filter = ref<'全部' | ItemType>('全部')
const selectedCategories = ref<string[]>([])
const locationFilter = ref('全部')
const currentPage = ref(1)
const pageSize = ref(6)
const selectedItem = ref<Item | null>(null)
const detailDialogVisible = ref(false)
// 编辑我的发布弹窗状态
const editDialogVisible = ref(false)
const editingItem = ref<Item | null>(null)
function openEdit(item: Item) { editingItem.value = item; editDialogVisible.value = true }
function closeEditDialog() { editDialogVisible.value = false; editingItem.value = null }
const notice = ref('')
// 首页公告条：展示 store.homeNotice（第一条没被「×」关掉的公告）；关掉后仍可在顶栏「公告栏」回看
function noticeDate(n: { published_at?: string | null; created_at: string }) {
  const v = n.published_at || n.created_at
  return v ? String(v).slice(0, 10) : ''
}
async function showNotice(n: { title: string; content: string }) {
  try { await ElMessageBox.alert(n.content || '（暂无内容）', n.title, { confirmButtonText: '知道了' }) } catch { /* 用户关闭 */ }
}
function openHomeNotice() {
  if (store.homeNotice) showNotice(store.homeNotice)
}
function dismissHomeNotice() {
  if (store.homeNotice) store.dismissNotice(store.homeNotice.id)
}
const profileMenuOpen = ref(false)
const settingsVisible = ref(false)
const currentAvatar = computed(() => resolveImageUrl(store.authUser?.avatar))
const roleLabels = { student: '学生端', itemAdmin: '失物招领管理', systemAdmin: '系统管理' }
const pageTitle = computed(() => ({ home: '发现物品', assistant: '智能助手', publish: '发布信息', posts: '我的发布', claims: '我的认领', manage: '物品管理', shop: '积分商城', goods: '商品管理', dashboard: '数据总览', users: '账号管理', notices: '公告管理', help: '帮助中心' })[store.activeRoute])
const visibleNavItems = computed(() => navItems[store.role].filter((item) => (item.roles as readonly Role[]).includes(store.role)))
// 分类筛选改用标签墙（selectedCategories），不再需要 categoryOptions
const locationOptions = computed(() => ['全部', ...store.locations.map((l) => l.name)])
// 首页地点筛选：优先用后端真实地点树做级联选择；无数据时回退扁平下拉
const usingRealLocations = computed(() => store.locations.length > 0)
interface CascaderNode { value: number; label: string; children: CascaderNode[] }
function buildLocTree(list: { id: number; name: string; parent_id: number }[]): CascaderNode[] {
  const map = new Map<number, CascaderNode>()
  list.forEach((l) => map.set(l.id, { value: l.id, label: l.name, children: [] }))
  const roots: CascaderNode[] = []
  list.forEach((l) => {
    const node = map.get(l.id)!
    const parent = l.parent_id != null && l.parent_id !== 0 ? map.get(l.parent_id) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  })
  return roots
}
const locationCascaderOptions = computed(() => buildLocTree(store.locations))
// 级联只选叶子节点（后端 location_id 精确匹配、不递归子节点），取末位=叶子作为筛选 location_id
const locationPath = ref<number[]>([])

// 首页数据直接取后端按筛选条件返回的真实结果（已移除本地 mock 与前端过滤）
const filteredItems = computed(() => {
  const items = store.remoteItems
  if (!selectedCategories.value.length) return items
  return items.filter((it) => (it.tags ?? []).some((t) => selectedCategories.value.includes(t)))
})
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const todayLabel = (() => {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${WEEKDAYS[d.getDay()]} · ${mm}.${dd}`
})()
// 筛选条件变化：重置到第 1 页并加 300ms 防抖，避免搜索框每敲一字就打一次后端
let homeFilterTimer: ReturnType<typeof setTimeout> | null = null
watch([filter, selectedCategories, locationFilter, locationPath, search], () => {
  currentPage.value = 1
  if (homeFilterTimer) clearTimeout(homeFilterTimer)
  homeFilterTimer = setTimeout(() => applyHomeFilters(), 300)
})
const roleHome = { student: 'home', itemAdmin: 'manage', systemAdmin: 'dashboard' } as const

watch(() => route.meta.page, (page) => {
  store.setActiveRoute(typeof page === 'string' ? page : roleHome[store.role])
}, { immediate: true })

// 首页筛选条件 -> 发给后端 GET /item/list（服务端筛选，不再前端过滤）
function applyHomeFilters() {
  store.fetchItems({
    type: filter.value === '全部' ? undefined : filter.value === 'lost' ? 0 : 1,
    tag_id: undefined, // 分类改为前端多选过滤（见 filteredItems）
    location_id: usingRealLocations.value
      ? (locationPath.value.length ? locationPath.value[locationPath.value.length - 1] : undefined)
      : (locationFilter.value === '全部' ? undefined : store.locationIdByName[locationFilter.value]),
    keyword: search.value.trim() || undefined,
    page: currentPage.value,
    page_size: pageSize.value,
  })
}

// 真分页：翻页/改每页大小 -> 重新拉后端对应页（用后端真实 total）
function onHomePage(p: number) { currentPage.value = p; applyHomeFilters() }
function onHomeSize(s: number) { pageSize.value = s; currentPage.value = 1; applyHomeFilters() }

// 重置首页所有筛选条件
function resetHomeFilters() {
  search.value = ''
  filter.value = '全部'
  selectedCategories.value = []
  locationFilter.value = '全部'
  locationPath.value = []
  currentPage.value = 1
  applyHomeFilters()
}

// 进入首页 / 我的发布时，从后端拉取真实帖子
watch(() => store.activeRoute, (r) => {
  if (r === 'home') applyHomeFilters()
  if (r === 'posts') store.fetchMyItems()
  if (r === 'claims') store.fetchItems()
}, { immediate: true })

// 进入应用即从公开接口拉取标签与地点，供首页筛选器和发布表单使用
onMounted(() => {
  store.fetchTags()
  store.fetchLocations()
  store.fetchItemCount()
  store.fetchNotices()
  store.fetchUnreadCount()
  const notifTimer = setInterval(() => store.fetchUnreadCount(), 60000)
  onUnmounted(() => clearInterval(notifTimer))
})

function go(key: string) {
  selectedItem.value = null
  router.push({ name: key })
}

// 首页「智能匹配」：带着当前搜索词跳到智能助手
// （App.vue 是同一个组件实例，仅在 section 之间切换，所以首页筛选状态天然保留）
function goSmartMatch() {
  const q = search.value.trim()
  router.push({ name: 'assistant', query: q ? { q } : {} })
}

function openItem(item: Item) {
  selectedItem.value = item
  store.fetchComments(item.id)
  detailDialogVisible.value = true
}

async function openItemById(id: number) {
  try {
    const res = await getItem(id)
    if (res?.data) openItem(store.mapToFront(res.data))
  } catch {
    ElMessage.warning('未找到相关物品')
  }
}

function closeDetailDialog() {
  detailDialogVisible.value = false
  selectedItem.value = null
}

async function handleLogout() {
  profileMenuOpen.value = false
  await store.logout()            // 先等退出完成(清 token/用户/角色), 再跳登录页, 避免要点两下
  router.replace({ name: 'login' })
}
function openSettings() {
  profileMenuOpen.value = false
  settingsVisible.value = true
}

function flash(text: string) { notice.value = text; setTimeout(() => { notice.value = '' }, 2200) }

function friendlyMsg(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (/无权利|无权限|permission|forbidden|403|10005|10006/i.test(msg)) return '操作失败：权限不足或登录已失效，请重新登录后重试'
  return msg || '操作失败，请稍后重试'
}
async function removeMyItem(item: Item) {
  try {
    await ElMessageBox.confirm(`确认删除「${item.title}」？删除后不可恢复。`, '删除确认', { type: 'warning' })
  } catch { return }
  try {
    await store.removeRemoteItem(item.id)
    await store.fetchMyItems()
    flash('已删除该物品')
  } catch (e) { ElMessage.error(friendlyMsg(e)) }
}


// 发布者确认认领（status 1->2，发放积分；后端仅发布者可调，他人 20005）
// 不再本地改 status —— store 内已按服务端数据刷新「我的发布」与列表
async function confirmMyItem(item: Item) {
  try {
    await store.confirmMyItem(item.id)
    flash('已确认认领，积分已发放')
  } catch (e) { ElMessage.error(friendlyMsg(e)) }
}
// 撤销认领（仅本人且物品处于已认领状态）
async function cancelMyItem(item: Item) {
  try {
    await store.cancelMyClaim(item.id)
    await store.fetchItems()
    flash('已撤销认领')
  } catch (e) { ElMessage.error(friendlyMsg(e)) }
}
// 发布者关闭（我找回来了，**不发积分**）：与「确认认领」并列的另一条关闭路径
// 后端 POST /item/:id/close（status 0/1 -> 2，仅发布者）；有进行中的认领会通知认领者
async function closeMyItem(item: Item) {
  try {
    await ElMessageBox.confirm(
      `确定关闭「${item.title}」吗？关闭后该物品将结束展示，且不会给认领者发放积分。如果确实已归还给对方，请改用「确认认领」。`,
      '关闭物品（不发积分）',
      { type: 'warning', confirmButtonText: '确定关闭', cancelButtonText: '取消' }
    )
  } catch { return }
  try {
    await store.closeMyItem(item.id)
    flash('已关闭该物品，未发放积分')
  } catch (e) { ElMessage.error(friendlyMsg(e)) }
}

</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark">拾</span><div><strong>拾光</strong><small>校园失物招领</small></div></div>
      <div class="workspace-label">当前工作区</div>
      <div class="role-switcher">
        <span class="avatar"><img v-if="currentAvatar" :src="currentAvatar" alt="" /><template v-else>{{ store.currentUser.name.slice(0, 1) }}</template></span>
        <div><strong>{{ store.currentUser.name }}</strong><small>{{ store.currentUser.label }}</small></div>
      </div>
      <nav>
        <p class="nav-caption">{{ roleLabels[store.role] }}</p>
        <button v-for="item in visibleNavItems" :key="item.key" class="nav-item" :class="{ active: store.activeRoute === item.key }" @click="go(item.key)"><span>{{ item.icon }}</span>{{ item.label }}</button>
      </nav>
      <div class="sidebar-bottom"><button class="help-link" :class="{ active: store.activeRoute === 'help' }" @click="go('help')">? <span>帮助与反馈</span></button><div class="version">拾光 v1.0 · 让每件物品回家</div></div>
    </aside>

    <main class="main-content">
      <header class="topbar"><div class="breadcrumb">工作台 <span>/</span> <strong>{{ pageTitle }}</strong></div><div class="top-actions"><button v-if="store.role === 'student'" class="credit-chip" title="我的积分，点击进入积分商城" @click="go('shop')"><span>◆</span>{{ store.authUser?.credit ?? 0 }} 积分</button><AnnouncementBell /><NotificationBell @open-item="openItemById" /><div class="profile-wrap"><button class="profile" @click="profileMenuOpen = !profileMenuOpen"><span class="avatar small"><img v-if="currentAvatar" :src="currentAvatar" alt="" /><template v-else>{{ store.currentUser.name.slice(0, 1) }}</template></span><span>{{ store.currentUser.name }}</span>⌄</button><div v-if="profileMenuOpen" class="profile-menu"><div class="profile-menu-heading"><strong>{{ store.currentUser.name }}</strong><small>{{ store.currentUser.label }}</small></div><button class="profile-menu-item" @click="openSettings">账号设置</button><button @click="handleLogout">退出登录</button></div></div></div></header>
      <div class="page-wrap">
        <ManageItems v-if="store.activeRoute === 'manage'" />
        <!-- 发布表单用 KeepAlive 缓存：填写中途切到其它页面再回来，草稿不丢 -->
        <KeepAlive>
          <PublishForm v-if="store.activeRoute === 'publish'" />
        </KeepAlive>
        <section v-if="store.activeRoute === 'home'" class="page-section">
          <div class="welcome-row"><div><span class="eyebrow">{{ todayLabel }}</span><h1>你好，{{ store.currentUser.name }} <span class="wave">✦</span></h1><p>{{ store.itemCount }} 件物品正在被认真寻找，今天也帮一件物品找到回家的路吧。</p></div><button class="primary-btn" @click="go('publish')">＋ 发布信息</button></div>
          <div v-if="store.homeNotice" class="notice-strip"><span class="notice-icon">✦</span><div style="cursor:pointer" @click="openHomeNotice"><strong>{{ store.homeNotice.title }}</strong><small>{{ noticeDate(store.homeNotice) }} · 查看详情 →</small></div><button title="不在首页显示（可在顶部「公告栏」回看）" @click="dismissHomeNotice">×</button></div>

          <el-form class="filter-form" label-position="top" @submit.prevent>
            <el-form-item label="搜索">
              <div class="home-search-row">
                <el-input v-model="search" placeholder="搜索物品、地点、关键词" clearable />
                <button type="button" class="smart-match-btn" title="描述物品，让助手帮你找匹配的帖子" @click="goSmartMatch">✦ 智能匹配</button>
              </div>
            </el-form-item>
            <div class="filter-row">
              <div class="filter-col">
                <el-form-item label="类型">
                  <el-radio-group v-model="filter" class="filter-type">
                    <el-radio-button value="全部">全部</el-radio-button>
                    <el-radio-button value="lost">寻物</el-radio-button>
                    <el-radio-button value="found">招领</el-radio-button>
                  </el-radio-group>
                </el-form-item>
              </div>
              <div class="filter-col">
                <el-form-item label="分类">
                  <TagWall v-model="selectedCategories" :options="store.tags.map(t => t.name)" label="分类" :sidebar-width="246" />
                </el-form-item>
              </div>
              <div class="filter-col">
                <el-form-item label="地点">
                  <el-cascader v-if="usingRealLocations" v-model="locationPath" :options="locationCascaderOptions" :props="{ expandTrigger: 'hover' }" placeholder="全部地点" clearable filterable class="filter-cascader" />
                  <el-select v-else v-model="locationFilter" filterable placeholder="全部">
                    <el-option label="全部" value="全部" />
                    <el-option v-for="location in locationOptions.filter((item) => item !== '全部')" :key="location" :label="location" :value="location" />
                  </el-select>
                </el-form-item>
              </div>
              <button class="filter-reset" @click="resetHomeFilters">重置筛选</button>
            </div>
          </el-form>

          <div class="item-grid">
            <article v-for="item in filteredItems" :key="item.id" class="item-card" :class="{ 'has-cover': !!firstImageUrl(item.desc) }" @click="openItem(item)">
              <div class="item-visual" :class="item.color"><img v-if="firstImageUrl(item.desc)" :src="resolveImageUrl(firstImageUrl(item.desc))" alt="" /><span v-else>{{ item.icon }}</span><em>{{ item.type === 'lost' ? '寻物' : '招领' }}</em></div>
              <div class="item-info"><div class="item-title"><h3>{{ item.title }}</h3><span :class="item.status === '已认领' ? 'done' : ''">{{ item.status }}</span></div><div class="markdown-body" v-html="renderMarkdown(stripImages(item.desc))"></div><div class="item-meta"><span>⌖ {{ item.location }}</span><span>{{ item.date }}</span></div></div>
            </article>
            <div v-if="!filteredItems.length" class="empty-state"><el-empty description="暂时没有找到相关物品" /></div>
          </div>

          <div v-if="store.remoteTotal" class="pagination-box">
            <el-pagination
              :current-page="currentPage"
              :page-size="pageSize"
              :page-sizes="[6, 12, 18]"
              :total="store.remoteTotal"
              layout="total, sizes, prev, pager, next"
              background
              @current-change="onHomePage"
              @size-change="onHomeSize"
            />
          </div>
        </section>

        <section v-else-if="store.activeRoute === 'posts' || store.activeRoute === 'claims'" class="page-section"><div class="section-intro"><span class="eyebrow">PERSONAL SPACE</span><h1>{{ pageTitle }}</h1><p>追踪你的每一次发布与认领进度。</p></div><div class="table-panel"><div v-if="store.activeRoute === 'posts'" v-for="item in store.myItems" :key="item.id" class="table-row"><div class="mini-visual" :class="item.color">{{ item.icon }}</div><div class="row-main"><strong>{{ item.title }}</strong><small>{{ item.location }} · {{ item.date }}</small></div><span class="status-pill">{{ item.status }}</span><button class="text-btn" @click="openItem(item)">查看详情</button><button class="text-btn" @click="openEdit(item)">编辑</button><template v-if="item.status === '已认领'"><button class="text-btn" @click="confirmMyItem(item)">确认认领</button><button class="text-btn" @click="closeMyItem(item)">关闭（不发积分）</button></template><button class="text-btn" style="color:#e06c75" @click="removeMyItem(item)">删除</button></div><div v-else v-for="claimItem in store.myClaims" :key="claimItem.id" class="table-row"><div class="mini-visual blue">♡</div><div class="row-main"><strong>{{ claimItem.title }}</strong><small>{{ claimItem.location }} · {{ claimItem.date }}</small></div><span class="status-pill">{{ claimItem.status }}</span><button v-if="claimItem.status === '已认领'" class="text-btn" @click="cancelMyItem(claimItem)">撤销认领</button></div><div v-if="(store.activeRoute === 'posts' ? store.myItems : store.myClaims).length === 0" class="empty-state">{{ store.activeRoute === 'posts' ? '你还没有发布任何物品' : '这里还没有记录' }}</div></div></section>


<section v-else-if="store.activeRoute === 'dashboard'" class="page-section"><Dashboard /></section>

        <section v-else-if="store.activeRoute === 'users'" class="page-section"><AdminUsers /></section>
        <section v-else-if="store.activeRoute === 'notices'" class="page-section"><AnnouncementManager /></section>
        <section v-else-if="store.activeRoute === 'shop'" class="page-section"><ShopCenter @open-settings="settingsVisible = true" /></section>
        <section v-else-if="store.activeRoute === 'goods'" class="page-section"><ManageGoods /></section>
        <section v-else-if="store.activeRoute === 'assistant'" class="page-section"><AgentAssistant @open-item="openItemById" /></section>
        <section v-else-if="store.activeRoute === 'help'" class="page-section"><HelpCenter /></section>
      </div>
    </main>
    <DetailDialog :item="selectedItem" :visible="detailDialogVisible" @close="closeDetailDialog" @open-item="openItemById" />
    <EditItemDialog :item="editingItem" :visible="editDialogVisible" @close="closeEditDialog" @saved="closeEditDialog" />
    <UserSettingsDialog :visible="settingsVisible" @close="settingsVisible = false" />
    <div v-if="notice" class="toast">✓ {{ notice }}</div>
  </div>
</template>
