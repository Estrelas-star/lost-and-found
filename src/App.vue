<script setup lang="ts">  //页面总框架
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Bell } from '@element-plus/icons-vue'
import { useAppStore, type Item, type ItemType, type Role, type User, ROLE_LABELS } from './stores/app'
import { navItems } from './navigation'
import MetricCard from './components/MetricCard.vue'
import PublishForm from './components/PublishForm.vue'
import DetailDialog from './components/DetailDialog.vue'
import AuditCenter from './components/AuditCenter.vue'
import ManageItems from './components/ManageItems.vue'

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
const selectedCluesItem = ref<Item | null>(null)
const itemCluesDialogVisible = ref(false)
const detailDialogVisible = ref(false)
const detailSlide = ref(0)
const likedItems = ref<number[]>([])
const notice = ref('')
const profileMenuOpen = ref(false)
const notificationPanelOpen = ref(false)
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
  if (item.status === '待审核' || item.status === '已撤回' || item.status === '已找回') return false
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
const selectedItemClues = computed(() => selectedCluesItem.value
  ? store.clues.filter((clue) => clue.itemId === selectedCluesItem.value?.id && clue.ownerId === selectedCluesItem.value?.ownerId)
  : [])
const visibleClaims = computed(() => store.role === 'student'
  ? store.claims.filter((claim) => claim.applicantId === store.currentUser.account)
  : store.claims)
const currentNotifications = computed(() => store.notifications
  .filter((notification) => notification.recipientId === store.account || notification.recipientName === store.currentUser.name)
  .sort((first, second) => second.id - first.id))
const unreadNotificationCount = computed(() => currentNotifications.value.filter((notification) => !notification.read).length)
/** 我的认领 - 查看联系方式弹窗：发布者联系方式（从认领对应物品的 contact 取） */
const contactRevealDialogVisible = ref(false)
/** 我的认领 - 查看联系方式弹窗：当前要展示的联系方式 */
const selectedClaimContact = ref('')
/** 我的认领 - 查看联系方式弹窗：隐私承诺勾选状态 */
const claimContactPromiseAgreed = ref(false)
/** 我的认领 - 查看联系方式弹窗：是否已复制 */
const claimContactCopied = ref(false)
/** 打开"我的认领"的联系方式弹窗：从认领记录找到对应物品，取其 contact 字段 */
function openClaimContact(claimItem: (typeof store.claims)[number]) {
  const item = store.items.find((entry) => entry.id === claimItem.itemId)
  selectedClaimContact.value = item?.contact?.trim() ?? '暂未提供'
  claimContactPromiseAgreed.value = false
  claimContactCopied.value = false
  contactRevealDialogVisible.value = true
}
/** 勾选承诺后复制发布者联系方式 */
function copyClaimContact() {
  if (!claimContactPromiseAgreed.value) {
    ElMessage.warning('请先勾选承诺，再查看发布者联系方式')
    return
  }
  const contact = selectedClaimContact.value
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(contact).then(() => {
      claimContactCopied.value = true
      ElMessage.success('联系方式已复制到剪贴板')
    }).catch(() => {
      claimContactCopied.value = true
      ElMessage.success('联系方式已展示')
    })
  } else {
    claimContactCopied.value = true
    ElMessage.success('联系方式已展示')
  }
}
const stats = computed(() => ({ total: store.items.length + 26, returned: store.items.filter((item) => item.status === '已认领').length + 18, rate: '68%' }))
const buildingOptions = computed(() => Object.keys(locationTree[locationSelections.value.campus as keyof typeof locationTree] ?? {}))
const areaOptions = computed(() => (locationSelections.value.campus && locationSelections.value.building ? locationTree[locationSelections.value.campus as keyof typeof locationTree][locationSelections.value.building as keyof typeof locationTree[keyof typeof locationTree]] ?? [] : []))

watch([filter, categoryFilter, locationFilter, timeFilter, search], () => {
  currentPage.value = 1
})
watch(selectedItem, (item) => {
  if (item) detailDialogVisible.value = true
})
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
  notificationPanelOpen.value = false
  router.push({ name: key })
}

function toggleNotificationPanel() {
  notificationPanelOpen.value = !notificationPanelOpen.value
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

function editItem(item: Item) {
  closeDetailDialog()
  store.beginEditItem(item.id)
  router.push({ name: 'publish' })
}

function openItemClues(item: Item) {
  store.markItemCluesRead(item.id)
  selectedCluesItem.value = item
  itemCluesDialogVisible.value = true
}

function onItemCluesDialogClosed() {
  if (selectedCluesItem.value) store.markItemCluesRead(selectedCluesItem.value.id)
  selectedCluesItem.value = null
}

async function confirmRecovered(item: Item) {
  try {
    await ElMessageBox.confirm('确认该物品已被找回或认领吗？确认后该物品将停止展示，且不再接受新线索。', '确认找回', {
      type: 'warning',
      confirmButtonText: '确认找回',
      cancelButtonText: '取消'
    })
  } catch {
    return
  }
  const ok = store.confirmRecovered(item.id)
  if (ok) {
    ElMessage.success('已确认找回，该物品已停止展示')
  }
}

async function openNotification(notification: (typeof store.notifications)[number]) {
  store.markNotificationsRead([notification.id])
  notificationPanelOpen.value = false
  if (notification.kind !== 'clue' || notification.itemId === undefined) return
  const item = store.items.find((entry) => entry.id === notification.itemId)
  if (!item) return
  if (store.activeRoute !== 'posts') await router.push({ name: 'posts' })
  openItemClues(item)
}

/** 删除单条通知 */
function removeNotification(notification: (typeof store.notifications)[number]) {
  store.removeNotification(notification.id)
  ElMessage.success('已删除该通知')
}

/** 清空全部通知（带二次确认） */
async function clearAllNotifications() {
  try {
    await ElMessageBox.confirm('确定要清空所有消息通知吗？清空后无法恢复。', '清空通知', {
      type: 'warning',
      confirmButtonText: '确认清空',
      cancelButtonText: '取消'
    })
  } catch { return }
  store.clearNotifications()
  ElMessage.success('已清空全部通知')
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
  flash('发布成功！请等待管理员审核，通过后将在列表中展示。')
}

function claim(item: Item) {
  if (item.status !== '招领中' && item.status !== '待认领') {
    flash('该物品当前不可申请认领')
    return
  }
  store.submitClaim(item)
  flash('认领申请已提交，请等待审核')
}

/* ===== 账号管理 ===== */
function roleLabel(role: unknown): string {
  return ROLE_LABELS[role as Role] ?? '未知'
}
const roleChangeDialogVisible = ref(false)
const roleChangingUser = ref<User | null>(null)
const roleOptions: Role[] = ['student', 'itemAdmin', 'systemAdmin']
const selectedNewRole = ref<Role>('student')

function openRoleDialog(user: User) {
  roleChangingUser.value = user
  selectedNewRole.value = user.role
  roleChangeDialogVisible.value = true
}

function submitRoleChange() {
  if (!roleChangingUser.value) return
  const result = store.changeUserRole(roleChangingUser.value.account, selectedNewRole.value)
  if (result.ok) {
    ElMessage.success(result.message)
    roleChangeDialogVisible.value = false
  } else {
    ElMessage.error(result.message)
  }
}

function toggleDisabled(user: User) {
  const result = store.toggleUserDisabled(user.account)
  if (result.ok) {
    ElMessage.success(result.message)
  } else {
    ElMessage.error(result.message)
  }
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
        <button v-for="item in visibleNavItems" :key="item.key" class="nav-item" :class="{ active: store.activeRoute === item.key }" @click="go(item.key)"><span>{{ item.icon }}</span>{{ item.label }}</button>
      </nav>
      <div class="sidebar-bottom"><button class="help-link" @click="flash('帮助中心即将上线')">? <span>帮助与反馈</span></button><div class="version">拾光 v1.0 · 让每件物品回家</div></div>
    </aside>

    <main class="main-content">
      <header class="topbar"><div class="breadcrumb">工作台 <span>/</span> <strong>{{ pageTitle }}</strong></div><div class="top-actions"><div class="notification-wrap"><button class="icon-btn notification-trigger" aria-label="消息通知" :aria-expanded="notificationPanelOpen" @click="toggleNotificationPanel"><Bell class="notification-icon" aria-hidden="true"/><span v-if="unreadNotificationCount" class="notification-badge">{{ unreadNotificationCount }}</span></button><section v-if="notificationPanelOpen" class="notification-panel" aria-label="消息通知"><div class="notification-panel-heading"><strong>消息通知</strong><div class="notification-head-actions"><button v-if="currentNotifications.length" type="button" class="notification-clear-btn" @click="clearAllNotifications">清空全部</button><button type="button" class="notification-close-btn" aria-label="关闭通知" @click="notificationPanelOpen = false">×</button></div></div><div v-if="currentNotifications.length" class="notification-list"><article v-for="notification in currentNotifications" :key="notification.id" class="notification-item" :class="{ 'notification-unread': !notification.read }" role="button" tabindex="0" @click="openNotification(notification)" @keydown.enter="openNotification(notification)"><div class="notification-item-main"><p>{{ notification.message }}</p><time>{{ notification.createdAt }}</time></div><button type="button" class="notification-delete-btn" aria-label="删除该通知" @click.stop="removeNotification(notification)">删除</button></article></div><el-empty v-else description="暂无系统通知" :image-size="64" /></section></div><div class="profile-wrap"><button class="profile" @click="profileMenuOpen = !profileMenuOpen"><span class="avatar small">{{ store.currentUser.name.slice(0, 1) }}</span><span>{{ store.currentUser.name }}</span>⌄</button><div v-if="profileMenuOpen" class="profile-menu"><div class="profile-menu-heading"><strong>{{ store.currentUser.name }}</strong><small>{{ store.currentUser.label }}</small></div><button @click="handleLogout">退出登录</button></div></div></div></header>
      <div class="page-wrap">
        <AuditCenter v-if="store.activeRoute === 'audit'" />
        <ManageItems v-if="store.activeRoute === 'manage'" />
        <PublishForm v-if="store.activeRoute === 'publish'" />
        <section v-if="store.activeRoute === 'home'" class="page-section">
          <div class="welcome-row"><div><span class="eyebrow">WED · 06.17</span><h1>你好，{{ store.currentUser.name }} <span class="wave">✦</span></h1><p>今天也帮一件物品找到回家的路吧。</p></div><button class="primary-btn" @click="go('publish')">＋ 发布信息</button></div>
          <div class="notice-strip"><span class="notice-icon">✦</span><div><strong>{{ store.notices[0].title }}</strong><small>{{ store.notices[0].date }} · 查看详情 →</small></div><button @click="flash('公告已标记为已读')">×</button></div>
          <div class="section-head"><div><h2>校园里的物品</h2><p>实时更新，共 {{ filteredItems.length }} 条信息</p></div></div>

          <el-form class="filter-form" label-position="top" @submit.prevent>
            <el-row :gutter="16">
              <el-col :span="24">
                <el-form-item label="搜索">
                  <el-input v-model="search" placeholder="搜索物品、地点、关键词" clearable />
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="16">
              <el-col :xs="12" :sm="6" :md="6" :lg="6">
                <el-form-item label="类型">
                  <el-select v-model="filter" placeholder="全部" class="filter-select">
                    <el-option label="全部" value="全部" />
                    <el-option label="寻物" value="lost" />
                    <el-option label="招领" value="found" />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :xs="12" :sm="6" :md="6" :lg="6">
                <el-form-item label="分类">
                  <el-select v-model="categoryFilter" placeholder="全部" class="filter-select">
                    <el-option label="全部" value="全部" />
                    <el-option v-for="category in categoryOptions" :key="category" :label="category" :value="category" />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :xs="12" :sm="6" :md="6" :lg="6">
                <el-form-item label="地点">
                  <el-select v-model="locationFilter" placeholder="全部" class="filter-select">
                    <el-option label="全部" value="全部" />
                    <el-option v-for="location in locationOptions.filter((item) => item !== '全部')" :key="location" :label="location" :value="location" />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :xs="12" :sm="6" :md="6" :lg="6">
                <el-form-item label="时间">
                  <el-select v-model="timeFilter" placeholder="全部" class="filter-select">
                    <el-option v-for="time in timeOptions" :key="time" :label="time" :value="time" />
                  </el-select>
                </el-form-item>
              </el-col>
            </el-row>
          </el-form>

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

        <section v-else-if="store.activeRoute === 'posts' || store.activeRoute === 'claims'" class="page-section">
          <div class="section-intro"><span class="eyebrow">PERSONAL SPACE</span><h1>{{ pageTitle }}</h1><p>追踪你的每一次发布与认领进度。</p></div>
          <div class="table-panel">
            <template v-if="store.activeRoute === 'posts'">
              <div v-for="item in myItems" :key="item.id" class="table-row"><div class="mini-visual" :class="item.color">{{ item.icon }}</div><div class="row-main"><strong>{{ item.title }}</strong><small>{{ item.location }} · {{ item.date }}</small></div><span class="status-pill" :class="{ 'status-pill-withdrawn': item.status === '已撤回', 'status-pill-recovered': item.status === '已找回' }">{{ item.status === '已关闭' ? '已下架' : item.status }}</span><button class="text-btn" @click="openItem(item)">查看详情</button><button v-if="item.status === '待审核' || item.status === '已撤回'" class="text-btn" @click="editItem(item)">{{ item.status === '已撤回' ? '重新发布' : '编辑' }}</button><button v-if="item.type === 'lost' && (item.status === '招领中' || item.status === '待认领')" class="text-btn confirm-recovered-btn" @click="confirmRecovered(item)">确认找回</button></div>
            </template>
            <template v-else>
              <div v-for="claimItem in visibleClaims" :key="claimItem.id" class="table-row"><div class="mini-visual blue">♡</div><div class="row-main"><strong>{{ claimItem.item }}</strong><small>{{ claimItem.date }} · 申请人：{{ claimItem.applicant }}</small><small v-if="claimItem.rejectionReason" class="claim-rejection-reason">驳回原因：{{ claimItem.rejectionReason }}</small></div><span class="status-pill">{{ claimItem.status }}</span><button class="text-btn claim-contact-btn" @click="openClaimContact(claimItem)">查看联系方式</button></div>
            </template>
            <div v-if="(store.activeRoute === 'posts' ? myItems : visibleClaims).length === 0" class="empty-state">这里还没有记录</div>
          </div>
        </section>

        <section v-else-if="store.activeRoute === 'dashboard'" class="page-section"><div class="section-intro"><span class="eyebrow">OVERVIEW · JUNE 2026</span><h1>校园失物招领总览</h1><p>数据会说话，看看校园里正在发生什么。</p></div><div class="metrics"><MetricCard label="累计发布" :value="stats.total" trend="较上月 +18%"/><MetricCard label="成功归还" :value="stats.returned" trend="归还率持续提升" tone="yellow"/><MetricCard label="总体归还率" :value="stats.rate" trend="较上月 +6.4%" tone="blue"/></div><div class="dashboard-grid"><div class="chart-panel"><div class="panel-head"><h2>近 30 日趋势</h2><span>发布量 / 归还量</span></div><div class="fake-chart"><div v-for="(height, index) in [38, 56, 48, 72, 62, 80, 68, 92, 76, 88, 72, 96]" :key="index" class="bar-group"><i :style="{ height: height + '%' }"></i><b :style="{ height: height * .62 + '%' }"></b></div></div><div class="chart-labels"><span>05.19</span><span>05.26</span><span>06.02</span><span>06.09</span><span>06.16</span></div></div><div class="ranking-panel"><div class="panel-head"><h2>高频地点</h2><span>发布数量</span></div><div v-for="(place, index) in [['图书馆', 42], ['南区食堂', 36], ['体育馆', 29], ['教学楼', 21]]" :key="place[0]" class="rank-row"><span>0{{ index + 1 }}</span><strong>{{ place[0] }}</strong><i><b :style="{ width: place[1] * 2 + '%' }"></b></i><em>{{ place[1] }}</em></div></div></div></section>

        <section v-else-if="store.activeRoute === 'users'" class="page-section users-page"><div class="section-intro"><span class="eyebrow">SYSTEM SETTINGS</span><h1>{{ pageTitle }}</h1><p>管理校园账号、角色与访问权限。</p></div><div class="manage-table-wrap"><el-table :data="store.registeredUsers" style="width: 100%"><el-table-column label="账号" prop="account" min-width="120" /><el-table-column label="昵称" min-width="120"><template #default="{ row }"><strong>{{ row.name }}</strong></template></el-table-column><el-table-column label="角色" min-width="140"><template #default="{ row }"><el-tag :type="row.role === 'systemAdmin' ? 'danger' : row.role === 'itemAdmin' ? 'warning' : 'success'" effect="light">{{ roleLabel(row.role) }}</el-tag></template></el-table-column><el-table-column label="状态" min-width="100"><template #default="{ row }"><el-tag :type="row.disabled ? 'info' : 'success'" effect="plain">{{ row.disabled ? '已禁用' : '正常' }}</el-tag></template></el-table-column><el-table-column label="操作" min-width="200"><template #default="{ row }"><el-button type="primary" link :disabled="row.account === 'sysadmin'" @click="openRoleDialog(row)">修改角色</el-button><el-button :type="row.disabled ? 'success' : 'warning'" link :disabled="row.account === 'sysadmin'" @click="toggleDisabled(row)">{{ row.disabled ? '启用' : '禁用' }}</el-button></template></el-table-column></el-table></div></section>

        <section v-else-if="store.activeRoute === 'notices'" class="page-section"><div class="section-intro"><span class="eyebrow">SYSTEM SETTINGS</span><h1>{{ pageTitle }}</h1><p>让重要消息抵达每一位同学。</p></div><div class="table-panel"><div v-for="row in store.notices" :key="row.id || row.title" class="table-row"><div class="mini-visual mint">✦</div><div class="row-main"><strong>{{ row.title }}</strong><small>{{ row.date }} · 公告内容管理</small></div><span class="status-pill">{{ row.tag }}</span><button class="text-btn" @click="flash('编辑功能已打开')">编辑</button></div></div></section>
      </div>
    </main>
    <!-- 我的认领 - 查看发布者联系方式弹窗（仅允许通过 X 关闭，防误触） -->
    <el-dialog v-model="contactRevealDialogVisible" title="查看发布者联系方式" width="min(480px, 94vw)" :close-on-click-modal="false" :close-on-press-escape="false">
      <div class="claim-contact-step">
        <p class="claim-contact-tip">为保障双方权益，请先确认以下承诺：</p>
        <label class="claim-promise-box" :class="{ 'promise-checked': claimContactPromiseAgreed }">
          <el-checkbox v-model="claimContactPromiseAgreed">我承诺仅将该联系方式用于找回该物品，绝不恶意骚扰</el-checkbox>
        </label>
        <div v-if="claimContactPromiseAgreed" class="claim-contact-reveal">
          <span class="claim-contact-label">发布者联系方式</span>
          <div class="claim-contact-row">
            <strong class="claim-contact-value">{{ selectedClaimContact }}</strong>
            <button type="button" class="claim-copy-btn" @click="copyClaimContact">{{ claimContactCopied ? '已复制 ✓' : '一键复制' }}</button>
          </div>
        </div>
        <p v-else class="claim-promise-hint">请先勾选上方承诺，再查看发布者联系方式</p>
      </div>
    </el-dialog>
    <el-dialog v-model="itemCluesDialogVisible" :title="`${selectedCluesItem?.title ?? ''} · 收到的线索`" width="min(560px, 94vw)" @closed="onItemCluesDialogClosed">
      <div v-if="selectedItemClues.length" class="owner-claim-list">
        <article v-for="clue in selectedItemClues" :key="clue.id" class="owner-claim-item">
          <div class="owner-claim-heading"><strong>{{ clue.reporter }}</strong><time>{{ clue.date }}</time></div>
          <p>{{ clue.description }}</p>
          <small>联系方式：{{ clue.contact }}</small>
          <div v-if="clue.images.length" class="clue-evidence-gallery"><el-image v-for="(image, index) in clue.images" :key="image" class="clue-evidence-image" :src="image" :preview-src-list="clue.images" :initial-index="index" fit="contain" preview-teleported alt="线索照片" /></div>
        </article>
      </div>
      <el-empty v-else description="暂时没有线索" :image-size="72" />
    </el-dialog>
    <DetailDialog :item="selectedItem" :visible="detailDialogVisible" :is-owner="store.activeRoute === 'posts'" @close="closeDetailDialog" @edit="editItem" />
    <div v-if="selectedItem" class="modal-backdrop" @click.self="selectedItem = null"><div class="detail-modal detail-modal-rich"><div class="detail-modal-actions"><button class="modal-action" @click="flash('举报信息已提交')">⚑ 举报</button><button class="modal-close" @click="selectedItem = null">×</button></div><div class="detail-gallery"><el-carousel v-if="detailImages.length" v-model="detailSlide" height="250px" arrow="always" indicator-position="outside"><el-carousel-item v-for="image in detailImages" :key="image"><img :src="image" alt="物品照片" /></el-carousel-item></el-carousel><div v-else class="detail-art" :class="selectedItem.color"><span>{{ selectedItem.icon }}</span><small>暂无照片</small></div></div><div class="detail-content"><span class="eyebrow">{{ selectedItem.type === 'lost' ? '寻物信息' : '招领信息' }} · {{ selectedItem.date }}</span><h2>{{ selectedItem.title }}</h2><div class="detail-tags"><el-tag v-for="tag in selectedItem.tags" :key="tag" effect="light">{{ tag }}</el-tag></div><p>{{ selectedItem.desc }}</p><div class="detail-lines"><span>⌖ {{ selectedItem.location }}</span><span>◷ {{ selectedItem.date }}</span><span>发布人：{{ selectedItem.author }}</span></div><div class="detail-stats"><span>◉ {{ detailViews }} 浏览</span><button type="button" :class="{ active: likedItems.includes(selectedItem.id) }" @click="toggleLike">♡ {{ detailLikes }} 点赞</button><button type="button" class="favorite-stat" :class="{ active: store.favoriteItemIds.includes(selectedItem.id) }" @click="toggleSave"><span>{{ store.favoriteItemIds.includes(selectedItem.id) ? '♥' : '♡' }}</span> {{ detailSaves }} 收藏</button></div><button v-if="store.role === 'student' && ['招领中', '待认领'].includes(selectedItem.status)" class="primary-btn full-btn" @click="claim(selectedItem)">申请认领</button><section class="comments-section"><div class="comments-heading"><h3>评论区</h3><span>{{ detailComments.length }} 条评论</span></div><div v-if="replyTarget" class="replying-to">正在回复 @{{ replyTarget.author }}<button type="button" @click="replyTarget = null">取消</button></div><div class="comment-composer"><el-input v-model="commentText" type="textarea" :rows="2" :placeholder="replyTarget ? `回复 @${replyTarget.author}` : '说说你的看法...'" maxlength="200" show-word-limit /><button type="button" class="send-comment" aria-label="发送评论" @click="sendComment">➤</button></div><div class="comment-list"><article v-for="comment in detailComments" :key="comment.id" class="comment-item" :class="{ 'comment-reply': comment.parentId }"><div class="comment-avatar">{{ comment.avatar }}</div><div class="comment-body"><div class="comment-meta"><strong>{{ comment.author }}</strong><time>{{ comment.date }}</time></div><p v-if="comment.replyTo" class="reply-label">回复 @{{ comment.replyTo }}</p><p class="comment-text">{{ comment.content }}</p><div class="comment-actions"><button type="button" @click="replyTarget = { id: comment.id, author: comment.author }">回复</button><button type="button" :class="{ active: comment.liked }" @click="store.toggleCommentLike(comment.id)">♡ {{ comment.likes }}</button></div></div></article><el-empty v-if="!detailComments.length" description="还没有评论，来留下第一条吧" :image-size="70" /></div></section></div></div></div>
    <div v-if="notice" class="toast">✓ {{ notice }}</div>
    <el-dialog v-model="roleChangeDialogVisible" title="修改角色" width="420px" align-center>
      <p class="dialog-user-info">为账号「{{ roleChangingUser?.name }}」设置新角色</p>
      <el-select v-model="selectedNewRole" placeholder="请选择角色" style="width: 100%">
        <el-option v-for="r in roleOptions" :key="r" :label="ROLE_LABELS[r]" :value="r" />
      </el-select>
      <template #footer>
        <el-button @click="roleChangeDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitRoleChange">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>
