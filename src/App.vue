<script setup>
import { computed, ref } from 'vue'
import { useAppStore } from './stores/app'
import { navItems } from './router'
import MetricCard from './components/MetricCard.vue'

const store = useAppStore()
const search = ref('')
const filter = ref('全部')
const selectedItem = ref(null)
const notice = ref('')
const form = ref({ type: 'lost', title: '', category: '数码', location: '', contact: '', desc: '' })
const roleLabels = { student: '学生端', itemAdmin: '失物招领管理', systemAdmin: '系统管理' }
const pageTitle = computed(() => ({ home: '发现物品', publish: '发布信息', posts: '我的发布', claims: '我的认领', audit: '审核中心', manage: '物品管理', dashboard: '数据总览', users: '账号管理', notices: '公告管理' })[store.activeRoute])
const filteredItems = computed(() => store.items.filter((item) => (filter.value === '全部' || item.type === filter.value) && `${item.title}${item.location}${item.category}`.toLowerCase().includes(search.value.toLowerCase())))
const myItems = computed(() => store.items.filter((item) => item.author === store.currentUser.name))
const pendingItems = computed(() => store.items.filter((item) => item.status === '待审核'))
const stats = computed(() => ({ total: store.items.length + 26, returned: store.items.filter((item) => item.status === '已认领').length + 18, pending: pendingItems.value.length + 8, rate: '68%' }))

function go(key) { store.setActiveRoute(key); selectedItem.value = null }
function flash(text) { notice.value = text; setTimeout(() => { notice.value = '' }, 2200) }
function submitPost() {
  if (!form.value.title || !form.value.location) {
    flash('请先补充物品名称和地点')
    return
  }

  store.publish({
    ...form.value,
    icon: form.value.type === 'lost' ? '◌' : '◉',
    color: 'blue',
    status: '待审核'
  })
  form.value = {
    type: 'lost',
    title: '',
    category: '数码',
    location: '',
    contact: '',
    desc: ''
  }
  flash('信息已提交，等待管理员审核')
}

function claim(item) {
  store.submitClaim(item)
  flash('认领申请已提交，请等待审核')
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
        <select v-model="store.role" aria-label="切换角色"><option value="student">学生端</option><option value="itemAdmin">失物招领管理</option><option value="systemAdmin">系统管理</option></select>
      </div>
      <nav>
        <p class="nav-caption">{{ roleLabels[store.role] }}</p>
        <button v-for="item in navItems[store.role]" :key="item.key" class="nav-item" :class="{ active: store.activeRoute === item.key }" @click="go(item.key)"><span>{{ item.icon }}</span>{{ item.label }}<b v-if="item.key === 'audit' && pendingItems.length">{{ pendingItems.length }}</b></button>
      </nav>
      <div class="sidebar-bottom"><button class="help-link" @click="flash('帮助中心即将上线')">? <span>帮助与反馈</span></button><div class="version">拾光 v1.0 · 让每件物品回家</div></div>
    </aside>

    <main class="main-content">
      <header class="topbar"><div class="breadcrumb">工作台 <span>/</span> <strong>{{ pageTitle }}</strong></div><div class="top-actions"><button class="icon-btn" @click="flash('暂无新的通知')">♧<i></i></button><button class="profile" @click="flash('当前登录：' + store.currentUser.name)"><span class="avatar small">{{ store.currentUser.name.slice(0, 1) }}</span><span>{{ store.currentUser.name }}</span>⌄</button></div></header>
      <div class="page-wrap">
        <section v-if="store.activeRoute === 'home'" class="page-section">
          <div class="welcome-row"><div><span class="eyebrow">WED · 06.17</span><h1>你好，{{ store.currentUser.name }} <span class="wave">✦</span></h1><p>今天也帮一件物品找到回家的路吧。</p></div><button class="primary-btn" @click="go('publish')">＋ 发布信息</button></div>
          <div class="notice-strip"><span class="notice-icon">✦</span><div><strong>{{ store.notices[0].title }}</strong><small>{{ store.notices[0].date }} · 查看详情 →</small></div><button @click="flash('公告已标记为已读')">×</button></div>
          <div class="section-head"><div><h2>校园里的物品</h2><p>实时更新，共 {{ store.items.length + 26 }} 条信息</p></div><div class="filters"><label>⌕ <input v-model="search" placeholder="搜索物品、地点..." /></label><button v-for="tag in ['全部', 'lost', 'found']" :key="tag" :class="{ selected: filter === tag }" @click="filter = tag">{{ tag === '全部' ? tag : tag === 'lost' ? '寻物' : '招领' }}</button></div></div>
          <div class="item-grid"><article v-for="item in filteredItems" :key="item.id" class="item-card" @click="selectedItem = item"><div class="item-visual" :class="item.color"><span>{{ item.icon }}</span><em>{{ item.type === 'lost' ? '寻物' : '招领' }}</em></div><div class="item-info"><div class="item-title"><h3>{{ item.title }}</h3><span :class="item.status === '已认领' ? 'done' : ''">{{ item.status }}</span></div><p>{{ item.desc }}</p><div class="item-meta"><span>⌖ {{ item.location }}</span><span>{{ item.date }}</span></div></div></article><div v-if="!filteredItems.length" class="empty-state">没有找到匹配的信息</div></div>
        </section>

        <section v-else-if="store.activeRoute === 'publish'" class="page-section narrow"><div class="section-intro"><span class="eyebrow">CREATE A POST</span><h1>发布一条信息</h1><p>描述得越清楚，物品越快回到主人身边。</p></div><form class="form-panel" @submit.prevent="submitPost"><div class="segmented"><button type="button" :class="{ active: form.type === 'lost' }" @click="form.type = 'lost'">我丢失了物品</button><button type="button" :class="{ active: form.type === 'found' }" @click="form.type = 'found'">我捡到了物品</button></div><div class="form-grid"><label>物品名称<input v-model="form.title" placeholder="例如：黑色折叠雨伞" /></label><label>物品分类<select v-model="form.category"><option>数码</option><option>证件</option><option>日用</option><option>其他</option></select></label><label>丢失 / 拾取地点<input v-model="form.location" placeholder="例如：图书馆三楼" /></label><label>联系方式<input v-model="form.contact" placeholder="手机号或微信号" /></label><label class="full">详细描述<textarea v-model="form.desc" rows="4" placeholder="颜色、特征、时间等线索..."></textarea></label><label class="upload full">▧ <span>添加物品照片（可选）</span><small>支持 JPG、PNG，最多 3 张</small></label></div><button class="primary-btn" type="submit">提交审核 →</button></form></section>

        <section v-else-if="store.activeRoute === 'posts' || store.activeRoute === 'claims'" class="page-section"><div class="section-intro"><span class="eyebrow">PERSONAL SPACE</span><h1>{{ pageTitle }}</h1><p>追踪你的每一次发布与认领进度。</p></div><div class="table-panel"><div v-if="store.activeRoute === 'posts'" v-for="item in myItems" :key="item.id" class="table-row"><div class="mini-visual" :class="item.color">{{ item.icon }}</div><div class="row-main"><strong>{{ item.title }}</strong><small>{{ item.location }} · {{ item.date }}</small></div><span class="status-pill">{{ item.status }}</span><button class="text-btn" @click="selectedItem = item">查看详情</button></div><div v-else v-for="claimItem in store.claims" :key="claimItem.id" class="table-row"><div class="mini-visual blue">♡</div><div class="row-main"><strong>{{ claimItem.item }}</strong><small>{{ claimItem.date }} · 申请人：{{ claimItem.applicant }}</small></div><span class="status-pill">{{ claimItem.status }}</span></div><div v-if="(store.activeRoute === 'posts' ? myItems : store.claims).length === 0" class="empty-state">这里还没有记录</div></div></section>

        <section v-else-if="store.activeRoute === 'audit' || store.activeRoute === 'manage'" class="page-section"><div class="section-intro"><span class="eyebrow">OPERATIONS</span><h1>{{ pageTitle }}</h1><p>让每一条信息都准确、可信、及时。</p></div><div class="metrics"><MetricCard label="待处理审核" :value="pendingItems.length" trend="需要你的判断" tone="mint"/><MetricCard label="本周已处理" value="32" trend="较上周 +12%" tone="yellow"/><MetricCard label="待认领物品" value="24" trend="持续跟进中" tone="blue"/></div><div class="table-panel"><div v-for="item in (store.activeRoute === 'audit' ? pendingItems : store.items)" :key="item.id" class="table-row"><div class="mini-visual" :class="item.color">{{ item.icon }}</div><div class="row-main"><strong>{{ item.title }}</strong><small>{{ item.type === 'lost' ? '寻物' : '招领' }} · {{ item.location }} · {{ item.author }}</small></div><span class="status-pill">{{ item.status }}</span><button v-if="store.activeRoute === 'audit' && item.status === '待审核'" class="approve-btn" @click="store.approve(item.id); flash('已通过审核')">通过审核</button><button class="text-btn" @click="selectedItem = item">查看</button></div></div></section>

        <section v-else-if="store.activeRoute === 'dashboard'" class="page-section"><div class="section-intro"><span class="eyebrow">OVERVIEW · JUNE 2026</span><h1>校园失物招领总览</h1><p>数据会说话，看看校园里正在发生什么。</p></div><div class="metrics"><MetricCard label="累计发布" :value="stats.total" trend="较上月 +18%" tone="mint"/><MetricCard label="成功归还" :value="stats.returned" trend="归还率持续提升" tone="yellow"/><MetricCard label="待处理" :value="stats.pending" trend="今日需关注" tone="coral"/><MetricCard label="总体归还率" :value="stats.rate" trend="较上月 +6.4%" tone="blue"/></div><div class="dashboard-grid"><div class="chart-panel"><div class="panel-head"><h2>近 30 日趋势</h2><span>发布量 / 归还量</span></div><div class="fake-chart"><div v-for="(height, index) in [38, 56, 48, 72, 62, 80, 68, 92, 76, 88, 72, 96]" :key="index" class="bar-group"><i :style="{ height: height + '%' }"></i><b :style="{ height: height * .62 + '%' }"></b></div></div><div class="chart-labels"><span>05.19</span><span>05.26</span><span>06.02</span><span>06.09</span><span>06.16</span></div></div><div class="ranking-panel"><div class="panel-head"><h2>高频地点</h2><span>发布数量</span></div><div v-for="(place, index) in [['图书馆', 42], ['南区食堂', 36], ['体育馆', 29], ['教学楼', 21]]" :key="place[0]" class="rank-row"><span>0{{ index + 1 }}</span><strong>{{ place[0] }}</strong><i><b :style="{ width: place[1] * 2 + '%' }"></b></i><em>{{ place[1] }}</em></div></div></div></section>

        <section v-else-if="store.activeRoute === 'users' || store.activeRoute === 'notices'" class="page-section"><div class="section-intro"><span class="eyebrow">SYSTEM SETTINGS</span><h1>{{ pageTitle }}</h1><p>{{ store.activeRoute === 'users' ? '管理校园账号、角色与访问权限。' : '让重要消息抵达每一位同学。' }}</p></div><div class="table-panel"><div v-for="row in (store.activeRoute === 'users' ? [{ name: '林知夏', id: '2023010218', role: '普通学生', state: '正常' }, { name: '赵老师', id: 'LF-ADMIN-01', role: '失物招领管理员', state: '正常' }, { name: '陈老师', id: 'SYS-ADMIN-01', role: '系统管理员', state: '正常' }] : store.notices)" :key="row.id || row.title" class="table-row"><div class="mini-visual mint">{{ store.activeRoute === 'users' ? row.name.slice(0, 1) : '✦' }}</div><div class="row-main"><strong>{{ row.name || row.title }}</strong><small>{{ row.id || row.date }} · {{ row.role || '公告内容管理' }}</small></div><span class="status-pill">{{ row.state || row.tag }}</span><button class="text-btn" @click="flash('编辑功能已打开')">编辑</button></div></div></section>
      </div>
    </main>
    <div v-if="selectedItem" class="modal-backdrop" @click.self="selectedItem = null"><div class="detail-modal"><button class="modal-close" @click="selectedItem = null">×</button><div class="detail-art" :class="selectedItem.color">{{ selectedItem.icon }}</div><span class="eyebrow">{{ selectedItem.type === 'lost' ? '寻物信息' : '招领信息' }} · {{ selectedItem.date }}</span><h2>{{ selectedItem.title }}</h2><p>{{ selectedItem.desc }}</p><div class="detail-lines"><span>⌖ {{ selectedItem.location }}</span><span>发布人：{{ selectedItem.author }}</span></div><button v-if="store.role === 'student' && selectedItem.status !== '已认领'" class="primary-btn full-btn" @click="claim(selectedItem)">提交认领申请</button></div></div>
    <div v-if="notice" class="toast">✓ {{ notice }}</div>
  </div>
</template>
