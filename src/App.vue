<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAppStore, type Item, type ItemType, type Role } from './stores/app'
import { navItems } from './navigation'
import MetricCard from './components/MetricCard.vue'
import PublishForm from './components/PublishForm.vue'
import DetailDialog from './components/DetailDialog.vue'
import AuditCenter from './components/AuditCenter.vue'

const store = useAppStore()
const router = useRouter()
const route = useRoute()
const search = ref('')
const filter = ref<'全部' | ItemType>('全部')
const categoryFilter = ref('全部')
const locationFilter = ref('全部')
const timeFilter = ref('全部')
const currentPage = ref(1)
const pageSize = ref(6)
const selectedItem = ref<Item | null>(null)
const detailDialogVisible = ref(false)
const detailSlide = ref(0)
const likedItems = ref<number[]>([])
const notice = ref('')
const profileMenuOpen = ref(false)
const form = ref({ type: 'lost' as ItemType, title: '', category: '', tags: [] as string[], location: '', contact: '', desc: '', images: [] as string[] })
const errors = ref<Record<string, string>>({})
const locationTree = {
  南区: {
    食堂: ['一楼', '二楼', '门口'],
    图书馆: ['一楼', '二楼', '三楼'],
    教学楼: ['A座', 'B座', 'C座']
  },
  北区: {
    宿舍楼: ['1号楼', '2号楼', '3号楼'],
    体育馆: ['入口', '篮球场', '操场'],
    研究院: ['主楼', '实验楼', '停车场']
  },
  东区: {
    校门: ['东门', '南门', '北门'],
    行政楼: ['一楼', '二楼', '三楼'],
    绿地: ['小广场', '操场', '景观区']
  }
} as const
const locationSelections = ref({ campus: '', building: '', area: '' })
const roleLabels = { student: '学生端', itemAdmin: '失物招领管理', systemAdmin: '系统管理' }
const pageTitle = computed(() => ({ home: '发现物品', publish: '发布信息', posts: '我的发布', claims: '我的认领', audit: '审核中心', manage: '物品管理', dashboard: '数据总览', users: '账号管理', notices: '公告管理' })[store.activeRoute])
const visibleNavItems = computed(() => navItems[store.role].filter((item) => (item.roles as readonly Role[]).includes(store.role)))
const categoryOptions = ['数码', '证件', '日用', '服饰', '书籍', '其他'] as const
const locationOptions = computed(() => ['全部', ...Array.from(new Set(store.items.map((item) => item.location.split('·')[0]?.trim()).filter(Boolean)))])
const timeOptions = ['全部', '近3天', '近7天', '近30天']
const filteredItems = computed(() => store.items.filter((item) => {
  const matchesType = filter.value === '全部' || item.type === filter.value
  const matchesCategory = categoryFilter.value === '全部' || item.tags.includes(categoryFilter.value)
  const matchesLocation = locationFilter.value === '全部' || item.location.includes(locationFilter.value)
  const matchesSearch = `${item.title}${item.location}${item.tags.join(' ')}`.toLowerCase().includes(search.value.toLowerCase())
  const matchesTime = (() => {
    if (timeFilter.value === '全部') return true
    const raw = item.date
    const match = raw.match(/(\d{2})-(\d{2})/)
    if (!match) return true
    const [, month, day] = match
    const itemDate = new Date(2026, Number(month) - 1, Number(day))
    const today = new Date(2026, 5, 17)
    const diffDays = Math.floor((today.getTime() - itemDate.getTime()) / (1000 * 60 * 60 * 24))
    if (timeFilter.value === '近3天') return diffDays <= 3
    if (timeFilter.value === '近7天') return diffDays <= 7
    if (timeFilter.value === '近30天') return diffDays <= 30
    return true
  })()

  return matchesType && matchesCategory && matchesLocation && matchesSearch && matchesTime
}))
const totalPages = computed(() => Math.max(1, Math.ceil(filteredItems.value.length / pageSize.value)))
const paginatedItems = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredItems.value.slice(start, start + pageSize.value)
})
const detailImages = computed(() => selectedItem.value?.images?.length ? selectedItem.value.images : [])
const detailViews = computed(() => selectedItem.value ? 128 + selectedItem.value.id * 17 : 0)
const detailLikes = computed(() => selectedItem.value ? 12 + selectedItem.value.id * 3 + (likedItems.value.includes(selectedItem.value.id) ? 1 : 0) : 0)
const detailSaves = computed(() => selectedItem.value ? 8 + selectedItem.value.id * 2 + (store.favoriteItemIds.includes(selectedItem.value.id) ? 1 : 0) : 0)
const commentText = ref('')
const replyTarget = ref<{ id: number, author: string } | null>(null)
const detailComments = computed(() => selectedItem.value ? store.comments.filter((comment) => comment.itemId === selectedItem.value?.id) : [])
const myItems = computed(() => store.items.filter((item) => item.author === store.currentUser.name))
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
const buildingOptions = computed(() => Object.keys(locationTree[locationSelections.value.campus as keyof typeof locationTree] ?? {}))
const areaOptions = computed(() => (locationSelections.value.campus && locationSelections.value.building ? locationTree[locationSelections.value.campus as keyof typeof locationTree][locationSelections.value.building as keyof typeof locationTree[keyof typeof locationTree]] ?? [] : []))

watch([filter, categoryFilter, locationFilter, timeFilter, search], () => {
  currentPage.value = 1
})
watch([auditStatusFilter, auditTypeFilter, auditSearch], () => { auditPage.value = 1 })

const roleHome = { student: 'home', itemAdmin: 'audit', systemAdmin: 'dashboard' } as const

watch(() => route.meta.page, (page) => {
  store.setActiveRoute(typeof page === 'string' ? page : roleHome[store.role])
}, { immediate: true })
watch(() => locationSelections.value.campus, () => {
  locationSelections.value.building = ''
  locationSelections.value.area = ''
  if (locationSelections.value.campus) {
    form.value.location = locationSelections.value.campus
  } else {
    form.value.location = ''
  }
})
watch(() => locationSelections.value.building, () => {
  locationSelections.value.area = ''
  if (!locationSelections.value.campus) return
  if (locationSelections.value.building) {
    form.value.location = `${locationSelections.value.campus} · ${locationSelections.value.building}`
  } else {
    form.value.location = locationSelections.value.campus
  }
})
watch(() => locationSelections.value.area, () => {
  if (locationSelections.value.campus && locationSelections.value.building && locationSelections.value.area) {
    form.value.location = `${locationSelections.value.campus} · ${locationSelections.value.building} · ${locationSelections.value.area}`
  }
})

function go(key: string) {
  selectedItem.value = null
  router.push({ name: key })
}

function openItem(item: Item) {
  selectedItem.value = item
  detailDialogVisible.value = true
  detailSlide.value = 0
  commentText.value = ''
  replyTarget.value = null
}

function closeDetailDialog() {
  detailDialogVisible.value = false
  selectedItem.value = null
}

function sendComment() {
  const content = commentText.value.trim()
  if (!selectedItem.value || !content) return
  store.addComment({ itemId: selectedItem.value.id, author: store.currentUser.name, avatar: store.currentUser.name.slice(0, 1), content, parentId: replyTarget.value?.id, replyTo: replyTarget.value?.author })
  commentText.value = ''
  replyTarget.value = null
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

function handleLogout() {
  profileMenuOpen.value = false
  store.logout()
  router.replace({ name: 'login' })
}

function flash(text: string) { notice.value = text; setTimeout(() => { notice.value = '' }, 2200) }

function handleUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])

  if (!files.length) return

  const validFiles = files.filter((file) => file.type.startsWith('image/'))
  const remainingSlots = 3 - form.value.images.length
  const nextUrls = validFiles.slice(0, remainingSlots).map((file) => URL.createObjectURL(file))

  form.value.images = [...form.value.images, ...nextUrls].slice(0, 3)
  if (validFiles.length > remainingSlots) {
    errors.value.images = '最多只能上传 3 张图片'
    ElMessage.error('最多只能上传3张图片')
  }

  input.value = ''
}

function removeImage(index: number) {
  const url = form.value.images[index]
  if (url) URL.revokeObjectURL(url)
  form.value.images.splice(index, 1)
  if (errors.value.images) delete errors.value.images
}

function validateForm() {
  const nextErrors: Record<string, string> = {}

  if (!form.value.title.trim()) nextErrors.title = '请输入物品名称'
  else if (form.value.title.trim().length < 2) nextErrors.title = '物品名称至少 2 个字符'

  if (!form.value.tags.length) nextErrors.tags = '请至少选择一个物品标签'

  if (!form.value.location.trim()) nextErrors.location = '请选择丢失或拾取地点'

  if (!form.value.contact.trim()) nextErrors.contact = '请输入联系方式'
  else if (form.value.contact.trim().length < 5) nextErrors.contact = '联系方式至少 5 个字符'

  if (!form.value.desc.trim()) nextErrors.desc = '请输入详细描述'
  else if (form.value.desc.trim().length < 10) nextErrors.desc = '描述至少 10 个字符，便于核验信息真实性'

  if (form.value.images.length > 3) nextErrors.images = '最多只能上传 3 张图片'

  errors.value = nextErrors
  return Object.keys(nextErrors).length === 0
}

function resetPublishForm() {
  form.value = {
    type: 'lost' as ItemType,
    title: '',
    category: '',
    tags: [],
    location: '',
    contact: '',
    desc: '',
    images: []
  }
  locationSelections.value = { campus: '', building: '', area: '' }
  errors.value = {}
}

function submitPost() {
  if (!validateForm()) {
    flash('请修正表单中的错误后再提交')
    return
  }

  store.publish({
    ...form.value,
    icon: form.value.type === 'lost' ? '◌' : '◉',
    color: 'blue',
    status: '待审核'
  })

  resetPublishForm()
  flash('信息已提交，等待管理员审核')
}

function claim(item: Item) {
  store.submitClaim(item)
  flash('认领申请已提交，请等待审核')
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
        <span class="avatar">{{ store.currentUser.name.slice(0, 1) }}</span>
        <div><strong>{{ store.currentUser.name }}</strong><small>{{ store.currentUser.label }}</small></div>
      </div>
      <nav>
        <p class="nav-caption">{{ roleLabels[store.role] }}</p>
        <button v-for="item in visibleNavItems" :key="item.key" class="nav-item" :class="{ active: store.activeRoute === item.key }" @click="go(item.key)"><span>{{ item.icon }}</span>{{ item.label }}<b v-if="item.key === 'audit' && pendingItems.length">{{ pendingItems.length }}</b></button>
      </nav>
      <div class="sidebar-bottom"><button class="help-link" @click="flash('帮助中心即将上线')">? <span>帮助与反馈</span></button><div class="version">拾光 v1.0 · 让每件物品回家</div></div>
    </aside>

    <main class="main-content">
      <header class="topbar"><div class="breadcrumb">工作台 <span>/</span> <strong>{{ pageTitle }}</strong></div><div class="top-actions"><button class="icon-btn" @click="flash('暂无新的通知')">♧<i></i></button><div class="profile-wrap"><button class="profile" @click="profileMenuOpen = !profileMenuOpen"><span class="avatar small">{{ store.currentUser.name.slice(0, 1) }}</span><span>{{ store.currentUser.name }}</span>⌄</button><div v-if="profileMenuOpen" class="profile-menu"><div class="profile-menu-heading"><strong>{{ store.currentUser.name }}</strong><small>{{ store.currentUser.label }}</small></div><button @click="handleLogout">退出登录</button></div></div></div></header>
      <div class="page-wrap">
        <AuditCenter v-if="store.activeRoute === 'audit'" />
        <PublishForm v-if="store.activeRoute === 'publish'" />
        <section v-if="store.activeRoute === 'home'" class="page-section">
          <div class="welcome-row"><div><span class="eyebrow">WED · 06.17</span><h1>你好，{{ store.currentUser.name }} <span class="wave">✦</span></h1><p>今天也帮一件物品找到回家的路吧。</p></div><button class="primary-btn" @click="go('publish')">＋ 发布信息</button></div>
          <div class="notice-strip"><span class="notice-icon">✦</span><div><strong>{{ store.notices[0].title }}</strong><small>{{ store.notices[0].date }} · 查看详情 →</small></div><button @click="flash('公告已标记为已读')">×</button></div>
          <div class="section-head"><div><h2>校园里的物品</h2><p>实时更新，共 {{ filteredItems.length }} 条信息</p></div></div>

          <div class="filter-bar">
            <div class="filter-row">
              <div class="filter-box filter-search">
                <span class="filter-label">搜索</span>
                <el-input v-model="search" placeholder="搜索物品、地点、关键词" clearable />
              </div>
              <div class="filter-box">
                <span class="filter-label">类型</span>
                <el-select v-model="filter" placeholder="全部">
                  <el-option label="全部" value="全部" />
                  <el-option label="寻物" value="lost" />
                  <el-option label="招领" value="found" />
                </el-select>
              </div>
              <div class="filter-box">
                <span class="filter-label">分类</span>
                <el-select v-model="categoryFilter" placeholder="全部">
                  <el-option label="全部" value="全部" />
                  <el-option v-for="category in categoryOptions" :key="category" :label="category" :value="category" />
                </el-select>
              </div>
              <div class="filter-box">
                <span class="filter-label">地点</span>
                <el-select v-model="locationFilter" placeholder="全部">
                  <el-option label="全部" value="全部" />
                  <el-option v-for="location in locationOptions.filter((item) => item !== '全部')" :key="location" :label="location" :value="location" />
                </el-select>
              </div>
              <div class="filter-box">
                <span class="filter-label">时间</span>
                <el-select v-model="timeFilter" placeholder="全部">
                  <el-option v-for="time in timeOptions" :key="time" :label="time" :value="time" />
                </el-select>
              </div>
            </div>
          </div>

          <div class="item-grid">
            <article v-for="item in paginatedItems" :key="item.id" class="item-card" @click="openItem(item)">
              <div class="item-visual" :class="item.color"><span>{{ item.icon }}</span><em>{{ item.type === 'lost' ? '寻物' : '招领' }}</em></div>
              <div class="item-info"><div class="item-title"><h3>{{ item.title }}</h3><span :class="item.status === '已认领' ? 'done' : ''">{{ item.status }}</span></div><p>{{ item.desc }}</p><div class="item-meta"><span>⌖ {{ item.location }}</span><span>{{ item.date }}</span></div></div>
            </article>
            <div v-if="!filteredItems.length" class="empty-state"><el-empty description="暂时没有找到相关物品" /></div>
          </div>

          <div v-if="filteredItems.length" class="pagination-box">
            <el-pagination
              v-model:current-page="currentPage"
              v-model:page-size="pageSize"
              :page-sizes="[6, 12, 18]"
              :total="filteredItems.length"
              layout="total, sizes, prev, pager, next"
              background
              @size-change="currentPage = 1"
            />
          </div>
        </section>

        <section v-else-if="false" class="page-section narrow"></section>

        <section v-else-if="store.activeRoute === 'posts' || store.activeRoute === 'claims'" class="page-section"><div class="section-intro"><span class="eyebrow">PERSONAL SPACE</span><h1>{{ pageTitle }}</h1><p>追踪你的每一次发布与认领进度。</p></div><div class="table-panel"><div v-if="store.activeRoute === 'posts'" v-for="item in myItems" :key="item.id" class="table-row"><div class="mini-visual" :class="item.color">{{ item.icon }}</div><div class="row-main"><strong>{{ item.title }}</strong><small>{{ item.location }} · {{ item.date }}</small></div><span class="status-pill">{{ item.status }}</span><button class="text-btn" @click="selectedItem = item">查看详情</button></div><div v-else v-for="claimItem in store.claims" :key="claimItem.id" class="table-row"><div class="mini-visual blue">♡</div><div class="row-main"><strong>{{ claimItem.item }}</strong><small>{{ claimItem.date }} · 申请人：{{ claimItem.applicant }}</small></div><span class="status-pill">{{ claimItem.status }}</span></div><div v-if="(store.activeRoute === 'posts' ? myItems : store.claims).length === 0" class="empty-state">这里还没有记录</div></div></section>

        <section v-else-if="store.activeRoute === 'audit'" class="page-section audit-page"><div class="section-intro"><span class="eyebrow">OPERATIONS</span><h1>审核中心</h1><p>集中处理新提交的失物招领信息。</p></div><div class="metrics"><MetricCard label="待处理审核" :value="pendingItems.length" trend="需要你的判断" tone="mint"/><MetricCard label="本周已处理" value="32" trend="较上周 +12%" tone="yellow"/><MetricCard label="当前筛选结果" :value="auditItems.length" trend="实时更新" tone="blue"/></div><div class="audit-toolbar"><el-input v-model="auditSearch" clearable placeholder="搜索物品名称、发布者或地点" class="audit-search"/><el-select v-model="auditStatusFilter" placeholder="按状态"><el-option label="全部状态" value="全部"/><el-option label="待审核" value="待审核"/></el-select><el-select v-model="auditTypeFilter" placeholder="按类型"><el-option label="全部类型" value="全部"/><el-option label="寻物" value="lost"/><el-option label="招领" value="found"/></el-select></div><div class="audit-table-wrap"><el-table :data="auditItems" stripe empty-text="暂无待审核信息"><el-table-column label="图片" width="82"><template #default="{ row }"><div class="audit-thumb" :class="row.color"><img v-if="row.images?.[0]" :src="row.images[0]" alt="物品图片"/><span v-else>{{ row.icon }}</span></div></template></el-table-column><el-table-column prop="title" label="物品名称" min-width="170"/><el-table-column label="分类" min-width="130"><template #default="{ row }"><div class="audit-tags"><el-tag v-for="tag in row.tags" :key="tag" size="small">{{ tag }}</el-tag></div></template></el-table-column><el-table-column prop="author" label="发布者" min-width="100"/><el-table-column prop="date" label="发布时间" min-width="100"/><el-table-column label="当前状态" min-width="100"><template #default="{ row }"><el-tag type="warning">{{ row.status }}</el-tag></template></el-table-column><el-table-column label="操作" fixed="right" width="160"><template #default="{ row }"><el-button type="success" link @click="store.approve(row.id); flash('已通过审核')">通过</el-button><el-button type="danger" link @click="flash('驳回功能下一步接入')">驳回</el-button></template></el-table-column></el-table></div></section><section v-else-if="store.activeRoute === 'manage'" class="page-section"><div class="section-intro"><span class="eyebrow">OPERATIONS</span><h1>{{ pageTitle }}</h1><p>让每一条信息都准确、可信、及时。</p></div><div class="table-panel"><div v-for="item in store.items" :key="item.id" class="table-row"><div class="mini-visual" :class="item.color">{{ item.icon }}</div><div class="row-main"><strong>{{ item.title }}</strong><small>{{ item.location }} · {{ item.author }}</small></div><span class="status-pill">{{ item.status }}</span></div></div></section>

        <section v-else-if="store.activeRoute === 'dashboard'" class="page-section"><div class="section-intro"><span class="eyebrow">OVERVIEW · JUNE 2026</span><h1>校园失物招领总览</h1><p>数据会说话，看看校园里正在发生什么。</p></div><div class="metrics"><MetricCard label="累计发布" :value="stats.total" trend="较上月 +18%" tone="mint"/><MetricCard label="成功归还" :value="stats.returned" trend="归还率持续提升" tone="yellow"/><MetricCard label="待处理" :value="stats.pending" trend="今日需关注" tone="coral"/><MetricCard label="总体归还率" :value="stats.rate" trend="较上月 +6.4%" tone="blue"/></div><div class="dashboard-grid"><div class="chart-panel"><div class="panel-head"><h2>近 30 日趋势</h2><span>发布量 / 归还量</span></div><div class="fake-chart"><div v-for="(height, index) in [38, 56, 48, 72, 62, 80, 68, 92, 76, 88, 72, 96]" :key="index" class="bar-group"><i :style="{ height: height + '%' }"></i><b :style="{ height: height * .62 + '%' }"></b></div></div><div class="chart-labels"><span>05.19</span><span>05.26</span><span>06.02</span><span>06.09</span><span>06.16</span></div></div><div class="ranking-panel"><div class="panel-head"><h2>高频地点</h2><span>发布数量</span></div><div v-for="(place, index) in [['图书馆', 42], ['南区食堂', 36], ['体育馆', 29], ['教学楼', 21]]" :key="place[0]" class="rank-row"><span>0{{ index + 1 }}</span><strong>{{ place[0] }}</strong><i><b :style="{ width: place[1] * 2 + '%' }"></b></i><em>{{ place[1] }}</em></div></div></div></section>

        <section v-else-if="store.activeRoute === 'users' || store.activeRoute === 'notices'" class="page-section"><div class="section-intro"><span class="eyebrow">SYSTEM SETTINGS</span><h1>{{ pageTitle }}</h1><p>{{ store.activeRoute === 'users' ? '管理校园账号、角色与访问权限。' : '让重要消息抵达每一位同学。' }}</p></div><div class="table-panel"><div v-for="row in (store.activeRoute === 'users' ? [{ name: '林知夏', id: '2023010218', role: '普通学生', state: '正常' }, { name: '赵老师', id: 'LF-ADMIN-01', role: '失物招领管理员', state: '正常' }, { name: '陈老师', id: 'SYS-ADMIN-01', role: '系统管理员', state: '正常' }] : store.notices)" :key="row.id || row.title" class="table-row"><div class="mini-visual mint">{{ store.activeRoute === 'users' ? row.name.slice(0, 1) : '✦' }}</div><div class="row-main"><strong>{{ row.name || row.title }}</strong><small>{{ row.id || row.date }} · {{ row.role || '公告内容管理' }}</small></div><span class="status-pill">{{ row.state || row.tag }}</span><button class="text-btn" @click="flash('编辑功能已打开')">编辑</button></div></div></section>
      </div>
    </main>
    <DetailDialog :item="selectedItem" :visible="detailDialogVisible" @close="closeDetailDialog" />
    <div v-if="selectedItem" class="modal-backdrop" @click.self="selectedItem = null"><div class="detail-modal detail-modal-rich"><div class="detail-modal-actions"><button class="modal-action" @click="flash('举报信息已提交')">⚑ 举报</button><button class="modal-close" @click="selectedItem = null">×</button></div><div class="detail-gallery"><el-carousel v-if="detailImages.length" v-model="detailSlide" height="250px" arrow="always" indicator-position="outside"><el-carousel-item v-for="image in detailImages" :key="image"><img :src="image" alt="物品照片" /></el-carousel-item></el-carousel><div v-else class="detail-art" :class="selectedItem.color"><span>{{ selectedItem.icon }}</span><small>暂无照片</small></div></div><div class="detail-content"><span class="eyebrow">{{ selectedItem.type === 'lost' ? '寻物信息' : '招领信息' }} · {{ selectedItem.date }}</span><h2>{{ selectedItem.title }}</h2><div class="detail-tags"><el-tag v-for="tag in selectedItem.tags" :key="tag" effect="light">{{ tag }}</el-tag></div><p>{{ selectedItem.desc }}</p><div class="detail-lines"><span>⌖ {{ selectedItem.location }}</span><span>◷ {{ selectedItem.date }}</span><span>发布人：{{ selectedItem.author }}</span></div><div class="detail-stats"><span>◉ {{ detailViews }} 浏览</span><button type="button" :class="{ active: likedItems.includes(selectedItem.id) }" @click="toggleLike">♡ {{ detailLikes }} 点赞</button><button type="button" class="favorite-stat" :class="{ active: store.favoriteItemIds.includes(selectedItem.id) }" @click="toggleSave"><span>{{ store.favoriteItemIds.includes(selectedItem.id) ? '♥' : '♡' }}</span> {{ detailSaves }} 收藏</button></div><button v-if="store.role === 'student' && selectedItem.status !== '已认领'" class="primary-btn full-btn" @click="claim(selectedItem)">申请认领</button><section class="comments-section"><div class="comments-heading"><h3>评论区</h3><span>{{ detailComments.length }} 条评论</span></div><div v-if="replyTarget" class="replying-to">正在回复 @{{ replyTarget.author }}<button type="button" @click="replyTarget = null">取消</button></div><div class="comment-composer"><el-input v-model="commentText" type="textarea" :rows="2" :placeholder="replyTarget ? `回复 @${replyTarget.author}` : '说说你的看法...'" maxlength="200" show-word-limit /><button type="button" class="send-comment" aria-label="发送评论" @click="sendComment">➤</button></div><div class="comment-list"><article v-for="comment in detailComments" :key="comment.id" class="comment-item" :class="{ 'comment-reply': comment.parentId }"><div class="comment-avatar">{{ comment.avatar }}</div><div class="comment-body"><div class="comment-meta"><strong>{{ comment.author }}</strong><time>{{ comment.date }}</time></div><p v-if="comment.replyTo" class="reply-label">回复 @{{ comment.replyTo }}</p><p class="comment-text">{{ comment.content }}</p><div class="comment-actions"><button type="button" @click="replyTarget = { id: comment.id, author: comment.author }">回复</button><button type="button" :class="{ active: comment.liked }" @click="store.toggleCommentLike(comment.id)">♡ {{ comment.likes }}</button></div></div></article><el-empty v-if="!detailComments.length" description="还没有评论，来留下第一条吧" :image-size="70" /></div></section></div></div></div>
    <div v-if="notice" class="toast">✓ {{ notice }}</div>
  </div>
</template>
