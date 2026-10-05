<script setup lang="ts">
import { renderMarkdown, firstImageUrl, stripImages } from './utils/markdown'
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore, isActiveStatus, type Item, type ItemType, type Role } from './stores/app'
import { navItems } from './navigation'
import MetricCard from './components/MetricCard.vue'
import PublishForm from './components/PublishForm.vue'
import DetailDialog from './components/DetailDialog.vue'
import AuditCenter from './components/AuditCenter.vue'
import ManageItems from './components/ManageItems.vue'
import EditItemDialog from './components/EditItemDialog.vue'
import UserSettingsDialog from './components/UserSettingsDialog.vue'
import NotificationBell from './components/NotificationBell.vue'
import AnnouncementBell from './components/AnnouncementBell.vue'
import TagWall from './components/TagWall.vue'
import AdminUsers from './components/AdminUsers.vue'
import AnnouncementManager from './components/AnnouncementManager.vue'
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
const detailSlide = ref(0)
// 编辑我的发布弹窗状态
const editDialogVisible = ref(false)
const editingItem = ref<Item | null>(null)
function openEdit(item: Item) { editingItem.value = item; editDialogVisible.value = true }
function closeEditDialog() { editDialogVisible.value = false; editingItem.value = null }
const likedItems = ref<number[]>([])
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
const pageTitle = computed(() => ({ home: '发现物品', publish: '发布信息', posts: '我的发布', claims: '我的认领', audit: '审核中心', manage: '物品管理', dashboard: '数据总览', users: '账号管理', notices: '公告管理' })[store.activeRoute])
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
const detailImages = computed(() => selectedItem.value?.images?.length ? selectedItem.value.images : [])
const detailViews = computed(() => selectedItem.value ? 128 + selectedItem.value.id * 17 : 0)
const detailLikes = computed(() => selectedItem.value ? 12 + selectedItem.value.id * 3 + (likedItems.value.includes(selectedItem.value.id) ? 1 : 0) : 0)
const detailSaves = computed(() => selectedItem.value ? 8 + selectedItem.value.id * 2 + (store.favoriteItemIds.includes(selectedItem.value.id) ? 1 : 0) : 0)
const commentText = ref('')
const replyTarget = ref<{ id: number, author: string } | null>(null)
const detailComments = computed(() => selectedItem.value ? store.comments.filter((comment) => comment.itemId === selectedItem.value?.id) : [])
const pendingItems = computed(() => store.items.filter((item) => item.status === '待审核'))
const auditStatusFilter = ref<'全部' | '待审核'>('全部')
const auditTypeFilter = ref<'全部' | ItemType>('全部')
const auditSearch = ref('')
const auditPage = ref(1)
const auditPageSize = ref(6)
const rejectDialogVisible = ref(false)
const rejectReason = ref('')
const rejectingItemId = ref<number | null>(null)
const auditItems = computed(() => pendingItems.value.filter((item) => {
  const matchesStatus = auditStatusFilter.value === '全部' || item.status === auditStatusFilter.value
  const matchesType = auditTypeFilter.value === '全部' || item.type === auditTypeFilter.value
  const matchesSearch = `${item.title}${item.author}${item.location}${item.tags.join(' ')}`.toLowerCase().includes(auditSearch.value.trim().toLowerCase())
  return matchesStatus && matchesType && matchesSearch
}))
const paginatedAuditItems = computed(() => auditItems.value.slice((auditPage.value - 1) * auditPageSize.value, auditPage.value * auditPageSize.value))
const stats = computed(() => ({ total: store.items.length + 26, returned: store.items.filter((item) => item.status === '已认领').length + 18, pending: pendingItems.value.length + 8, rate: '68%' }))

// 筛选条件变化：重置到第 1 页并加 300ms 防抖，避免搜索框每敲一字就打一次后端
let homeFilterTimer: ReturnType<typeof setTimeout> | null = null
watch([filter, selectedCategories, locationFilter, locationPath, search], () => {
  currentPage.value = 1
  if (homeFilterTimer) clearTimeout(homeFilterTimer)
  homeFilterTimer = setTimeout(() => applyHomeFilters(), 300)
})
watch([auditStatusFilter, auditTypeFilter, auditSearch], () => { auditPage.value = 1 })

const roleHome = { student: 'home', itemAdmin: 'audit', systemAdmin: 'dashboard' } as const

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

function openItem(item: Item) {
  selectedItem.value = item
  store.fetchComments(item.id)
  detailDialogVisible.value = true
  detailSlide.value = 0
  commentText.value = ''
  replyTarget.value = null
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

async function sendComment() {
  const content = commentText.value.trim()
  if (!selectedItem.value || !content) return
  try {
    await store.addComment({ itemId: selectedItem.value.id, author: store.currentUser.name, avatar: store.currentUser.name.slice(0, 1), content, parentId: replyTarget.value?.id, replyTo: replyTarget.value?.author })
    commentText.value = ''
    replyTarget.value = null
    ElMessage.success('评论已发布')
  } catch (e) {
    ElMessage.error('评论发布失败，请稍后重试')
  }
}

function toggleLike() {
  if (!selectedItem.value) return
  const id = selectedItem.value.id
  likedItems.value = likedItems.value.includes(id) ? likedItems.value.filter((itemId) => itemId !== id) : [...likedItems.value, id]
}

function toggleSave() {
  if (!selectedItem.value) return
  const id = selectedItem.value.id
  const saved = store.favoriteItemIds.includes(id)
  store.toggleFavorite(id)
  flash(saved ? '已取消收藏' : '已收藏这条信息')
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
function refreshSelected() {
  if (!selectedItem.value) return
  const updated = store.remoteItems.find((i) => i.id === selectedItem.value!.id)
  if (updated) selectedItem.value = updated
}

function friendlyMsg(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (/无权利|无权限|permission|forbidden|403|10005|10006/i.test(msg)) return '操作失败：权限不足或登录已失效，请重新登录后重试'
  return msg || '操作失败，请稍后重试'
}
async function closeMyItem(item: Item) {
  try {
    await ElMessageBox.confirm(`确认下架「${item.title}」？下架后他人将看不到该物品。`, '下架确认', { type: 'warning' })
  } catch { return }
  try {
    await store.closeRemoteItem(item.id)
    await store.fetchMyItems()
    flash('已下架该物品')
  } catch (e) { ElMessage.error(friendlyMsg(e)) }
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


async function claim(item: Item) {
  if (!isActiveStatus(item.status)) {
    flash('该物品当前不可认领')
    return
  }
  try {
    await store.submitClaim(item.id)
    refreshSelected()
    flash(item.type === 'lost' ? '已提交，等待失主联系' : '认领成功')
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (/30006|绑定|qq|QQ/i.test(msg)) ElMessage.warning('认领需先绑定QQ，请前往账号设置绑定')
    else ElMessage.error(friendlyMsg(e))
  }
}
// 发布者确认认领（status 1->2，发放积分）
async function confirmMyItem(item: Item) {
  try {
    await store.confirmMyItem(item.id)
    await store.fetchMyItems()
    flash('已确认认领，积分已发放')
  } catch (e) { ElMessage.error(friendlyMsg(e)) }
}
// 撤销认领（仅本人且物品处于已认领状态）
async function cancelMyItem(item: Item) {
  try {
    await store.cancelMyClaim(item.id)
    await store.fetchItems()
    refreshSelected()
    flash('已撤销认领')
  } catch (e) { ElMessage.error(friendlyMsg(e)) }
}

function openRejectDialog(id: number) {
  rejectingItemId.value = id
  rejectReason.value = ''
  rejectDialogVisible.value = true
}

function submitReject() {
  if (!rejectingItemId.value || !rejectReason.value.trim()) {
    flash('请填写驳回原因')
    return
  }
  store.reject(rejectingItemId.value, rejectReason.value.trim())
  rejectDialogVisible.value = false
  flash('已驳回该信息')
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
        <button v-for="item in visibleNavItems" :key="item.key" class="nav-item" :class="{ active: store.activeRoute === item.key }" @click="go(item.key)"><span>{{ item.icon }}</span>{{ item.label }}<b v-if="item.key === 'audit' && pendingItems.length">{{ pendingItems.length }}</b></button>
      </nav>
      <div class="sidebar-bottom"><button class="help-link" @click="flash('帮助中心即将上线')">? <span>帮助与反馈</span></button><div class="version">拾光 v1.0 · 让每件物品回家</div></div>
    </aside>

    <main class="main-content">
      <header class="topbar"><div class="breadcrumb">工作台 <span>/</span> <strong>{{ pageTitle }}</strong></div><div class="top-actions"><AnnouncementBell /><NotificationBell @open-item="openItemById" /><div class="profile-wrap"><button class="profile" @click="profileMenuOpen = !profileMenuOpen"><span class="avatar small"><img v-if="currentAvatar" :src="currentAvatar" alt="" /><template v-else>{{ store.currentUser.name.slice(0, 1) }}</template></span><span>{{ store.currentUser.name }}</span>⌄</button><div v-if="profileMenuOpen" class="profile-menu"><div class="profile-menu-heading"><strong>{{ store.currentUser.name }}</strong><small>{{ store.currentUser.label }}</small></div><button class="profile-menu-item" @click="openSettings">账号设置</button><button @click="handleLogout">退出登录</button></div></div></div></header>
      <div class="page-wrap">
        <AuditCenter v-if="store.activeRoute === 'audit'" />
        <ManageItems v-if="store.activeRoute === 'manage'" />
        <PublishForm v-if="store.activeRoute === 'publish'" />
        <section v-if="store.activeRoute === 'home'" class="page-section">
          <div class="welcome-row"><div><span class="eyebrow">WED · 06.17</span><h1>你好，{{ store.currentUser.name }} <span class="wave">✦</span></h1><p>今天也帮一件物品找到回家的路吧。</p></div><button class="primary-btn" @click="go('publish')">＋ 发布信息</button></div>
          <div v-if="store.homeNotice" class="notice-strip"><span class="notice-icon">✦</span><div style="cursor:pointer" @click="openHomeNotice"><strong>{{ store.homeNotice.title }}</strong><small>{{ noticeDate(store.homeNotice) }} · 查看详情 →</small></div><button title="不在首页显示（可在顶部「公告栏」回看）" @click="dismissHomeNotice">×</button></div>
          <div class="section-head"><div><h2>校园里的物品</h2><p>实时更新，共 {{ store.remoteTotal }} 条信息</p><p class="home-count">{{ store.itemCount }} 件物品正在被认真寻找</p></div></div>

          <div class="filter-bar">
            <div class="filter-row">
              <div class="filter-box filter-search">
                <span class="filter-label">搜索</span>
                <el-input v-model="search" placeholder="搜索物品、地点、关键词" clearable />
              </div>
              <div class="filter-box">
                <span class="filter-label">类型</span>
                <el-select v-model="filter" filterable placeholder="全部">
                  <el-option label="全部" value="全部" />
                  <el-option label="寻物" value="lost" />
                  <el-option label="招领" value="found" />
                </el-select>
              </div>
              <div class="filter-box">
                <span class="filter-label">分类</span>
                <TagWall v-model="selectedCategories" :options="store.tags.map(t => t.name)" label="分类" :sidebar-width="246" />
              </div>
              <div class="filter-box">
                <span class="filter-label">地点</span>
                <el-cascader v-if="usingRealLocations" v-model="locationPath" :options="locationCascaderOptions" :props="{ expandTrigger: 'hover' }" placeholder="全部地点" clearable filterable class="filter-cascader" />
                <el-select v-else v-model="locationFilter" filterable placeholder="全部">
                  <el-option label="全部" value="全部" />
                  <el-option v-for="location in locationOptions.filter((item) => item !== '全部')" :key="location" :label="location" :value="location" />
                </el-select>
              </div>
              <button class="filter-reset" @click="resetHomeFilters">重置筛选</button>
            </div>
          </div>

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

        <section v-else-if="false" class="page-section narrow"></section>

        <section v-else-if="store.activeRoute === 'posts' || store.activeRoute === 'claims'" class="page-section"><div class="section-intro"><span class="eyebrow">PERSONAL SPACE</span><h1>{{ pageTitle }}</h1><p>追踪你的每一次发布与认领进度。</p></div><div class="table-panel"><div v-if="store.activeRoute === 'posts'" v-for="item in store.myItems" :key="item.id" class="table-row"><div class="mini-visual" :class="item.color">{{ item.icon }}</div><div class="row-main"><strong>{{ item.title }}</strong><small>{{ item.location }} · {{ item.date }}</small></div><span class="status-pill">{{ item.status }}</span><button class="text-btn" @click="openItem(item)">查看详情</button><button class="text-btn" @click="openEdit(item)">编辑</button><template v-if="isActiveStatus(item.status)"><button class="text-btn" @click="closeMyItem(item)">下架</button></template><template v-else-if="item.status === '已认领'"><button class="text-btn" @click="confirmMyItem(item)">确认认领</button><button class="text-btn" @click="closeMyItem(item)">关闭</button></template><button class="text-btn" style="color:#e06c75" @click="removeMyItem(item)">删除</button></div><div v-else v-for="claimItem in store.myClaims" :key="claimItem.id" class="table-row"><div class="mini-visual blue">♡</div><div class="row-main"><strong>{{ claimItem.title }}</strong><small>{{ claimItem.location }} · {{ claimItem.date }}</small></div><span class="status-pill">{{ claimItem.status }}</span><button v-if="claimItem.status === '已认领'" class="text-btn" @click="cancelMyItem(claimItem)">撤销认领</button></div><div v-if="(store.activeRoute === 'posts' ? store.myItems : store.myClaims).length === 0" class="empty-state">{{ store.activeRoute === 'posts' ? '你还没有发布任何物品' : '这里还没有记录' }}</div></div></section>

        <section v-else-if="store.activeRoute === 'audit'" class="page-section audit-page"><div class="section-intro"><span class="eyebrow">OPERATIONS</span><h1>审核中心</h1><p>集中处理新提交的失物招领信息。</p></div><div class="metrics"><MetricCard label="待处理审核" :value="pendingItems.length" trend="需要你的判断" tone="mint"/><MetricCard label="本周已处理" value="32" trend="较上周 +12%" tone="yellow"/><MetricCard label="当前筛选结果" :value="auditItems.length" trend="实时更新" tone="blue"/></div><div class="audit-toolbar"><el-input v-model="auditSearch" clearable placeholder="搜索物品名称、发布者或地点" class="audit-search"/><el-select v-model="auditStatusFilter" placeholder="按状态"><el-option label="全部状态" value="全部"/><el-option label="待审核" value="待审核"/></el-select><el-select v-model="auditTypeFilter" placeholder="按类型"><el-option label="全部类型" value="全部"/><el-option label="寻物" value="lost"/><el-option label="招领" value="found"/></el-select></div><div class="audit-table-wrap"><el-table :data="auditItems" stripe empty-text="暂无待审核信息"><el-table-column label="图片" width="82"><template #default="{ row }"><div class="audit-thumb" :class="row.color"><img v-if="row.images?.[0]" :src="resolveImageUrl(row.images[0])" alt="物品图片"/><span v-else>{{ row.icon }}</span></div></template></el-table-column><el-table-column prop="title" label="物品名称" min-width="170"/><el-table-column label="分类" min-width="130"><template #default="{ row }"><div class="audit-tags"><el-tag v-for="tag in row.tags" :key="tag" size="small">{{ tag }}</el-tag></div></template></el-table-column><el-table-column prop="author" label="发布者" min-width="100"/><el-table-column prop="date" label="发布时间" min-width="100"/><el-table-column label="当前状态" min-width="100"><template #default="{ row }"><el-tag type="warning">{{ row.status }}</el-tag></template></el-table-column><el-table-column label="操作" fixed="right" width="160"><template #default="{ row }"><el-button type="success" link @click="store.approve(row.id); flash('已通过审核')">通过</el-button><el-button type="danger" link @click="flash('驳回功能下一步接入')">驳回</el-button></template></el-table-column></el-table></div></section>

        <section v-else-if="store.activeRoute === 'dashboard'" class="page-section"><div class="section-intro"><span class="eyebrow">OVERVIEW · JUNE 2026</span><h1>校园失物招领总览</h1><p>数据会说话，看看校园里正在发生什么。</p></div><div class="metrics"><MetricCard label="累计发布" :value="stats.total" trend="较上月 +18%" tone="mint"/><MetricCard label="成功归还" :value="stats.returned" trend="归还率持续提升" tone="yellow"/><MetricCard label="待处理" :value="stats.pending" trend="今日需关注" tone="coral"/><MetricCard label="总体归还率" :value="stats.rate" trend="较上月 +6.4%" tone="blue"/></div><div class="dashboard-grid"><div class="chart-panel"><div class="panel-head"><h2>近 30 日趋势</h2><span>发布量 / 归还量</span></div><div class="fake-chart"><div v-for="(height, index) in [38, 56, 48, 72, 62, 80, 68, 92, 76, 88, 72, 96]" :key="index" class="bar-group"><i :style="{ height: height + '%' }"></i><b :style="{ height: height * .62 + '%' }"></b></div></div><div class="chart-labels"><span>05.19</span><span>05.26</span><span>06.02</span><span>06.09</span><span>06.16</span></div></div><div class="ranking-panel"><div class="panel-head"><h2>高频地点</h2><span>发布数量</span></div><div v-for="(place, index) in [['图书馆', 42], ['南区食堂', 36], ['体育馆', 29], ['教学楼', 21]]" :key="place[0]" class="rank-row"><span>0{{ index + 1 }}</span><strong>{{ place[0] }}</strong><i><b :style="{ width: place[1] * 2 + '%' }"></b></i><em>{{ place[1] }}</em></div></div></div></section>

        <section v-else-if="store.activeRoute === 'users'" class="page-section"><AdminUsers /></section>
        <section v-else-if="store.activeRoute === 'notices'" class="page-section"><AnnouncementManager /></section>
      </div>
    </main>
    <DetailDialog :item="selectedItem" :visible="detailDialogVisible" @close="closeDetailDialog" />
    <EditItemDialog :item="editingItem" :visible="editDialogVisible" @close="closeEditDialog" @saved="closeEditDialog" />
    <UserSettingsDialog :visible="settingsVisible" @close="settingsVisible = false" />
    <div v-if="selectedItem" class="modal-backdrop" @click.self="selectedItem = null"><div class="detail-modal detail-modal-rich"><div class="detail-modal-actions"><button class="modal-action" @click="flash('举报信息已提交')">⚑ 举报</button><button class="modal-close" @click="selectedItem = null">×</button></div><div class="detail-gallery"><el-carousel v-if="detailImages.length" v-model="detailSlide" height="250px" arrow="always" indicator-position="outside"><el-carousel-item v-for="image in detailImages" :key="image"><img :src="resolveImageUrl(image)" alt="物品照片" /></el-carousel-item></el-carousel><div v-else class="detail-art" :class="selectedItem.color"><span>{{ selectedItem.icon }}</span><small>暂无照片</small></div></div><div class="detail-content"><span class="eyebrow">{{ selectedItem.type === 'lost' ? '寻物信息' : '招领信息' }} · {{ selectedItem.date }}</span><h2>{{ selectedItem.title }}</h2><div class="detail-tags"><el-tag v-for="tag in selectedItem.tags" :key="tag" effect="light">{{ tag }}</el-tag></div><div class="markdown-body" v-html="renderMarkdown(selectedItem.desc)"></div><div class="detail-lines"><span>⌖ {{ selectedItem.location }}</span><span>◷ {{ selectedItem.date }}</span><span>发布人：{{ selectedItem.author }}</span></div><div class="detail-stats"><span>◉ {{ detailViews }} 浏览</span><button type="button" :class="{ active: likedItems.includes(selectedItem.id) }" @click="toggleLike">♡ {{ detailLikes }} 点赞</button><button type="button" class="favorite-stat" :class="{ active: store.favoriteItemIds.includes(selectedItem.id) }" @click="toggleSave"><span>{{ store.favoriteItemIds.includes(selectedItem.id) ? '♥' : '♡' }}</span> {{ detailSaves }} 收藏</button></div><button v-if="store.role === 'student' && isActiveStatus(selectedItem.status)" class="primary-btn full-btn" @click="claim(selectedItem)">{{ selectedItem.type === 'lost' ? '我捡到了' : '申请认领' }}</button><button v-if="store.role === 'student' && store.isClaimedByMe(selectedItem) && selectedItem.status === '已认领'" class="primary-btn full-btn ghost" @click="cancelMyItem(selectedItem)">撤销认领</button><section class="comments-section"><div class="comments-heading"><h3>评论区</h3><span>{{ detailComments.length }} 条评论</span></div><div v-if="replyTarget" class="replying-to">正在回复 @{{ replyTarget.author }}<button type="button" @click="replyTarget = null">取消</button></div><div class="comment-composer"><el-input v-model="commentText" type="textarea" :rows="2" :placeholder="replyTarget ? `回复 @${replyTarget.author}` : '说说你的看法...'" maxlength="200" show-word-limit /><button type="button" class="send-comment" aria-label="发送评论" @click="sendComment">➤</button></div><div class="comment-list"><article v-for="comment in detailComments" :key="comment.id" class="comment-item" :class="{ 'comment-reply': comment.parentId }"><div class="comment-avatar">{{ comment.avatar }}</div><div class="comment-body"><div class="comment-meta"><strong>{{ comment.author }}</strong><time>{{ comment.date }}</time></div><p v-if="comment.replyTo" class="reply-label">回复 @{{ comment.replyTo }}</p><p class="comment-text">{{ comment.content }}</p><div class="comment-actions"><button type="button" @click="replyTarget = { id: comment.id, author: comment.author }">回复</button></div></div></article><el-empty v-if="!detailComments.length" description="还没有评论，来留下第一条吧" :image-size="70" /></div></section></div></div></div>
    <div v-if="notice" class="toast">✓ {{ notice }}</div>
  </div>
</template>
