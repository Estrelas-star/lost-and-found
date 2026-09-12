import { defineStore } from 'pinia'

export const useAppStore = defineStore('app', {
  state: () => ({
    role: 'student',
    activeRoute: 'home',
    notices: [
      { id: 1, title: '期末周拾光服务时间调整通知', date: '2026-06-12', tag: '重要' },
      { id: 2, title: '毕业季物品集中认领活动开始啦', date: '2026-06-08', tag: '活动' }
    ],
    items: [
      { id: 1, type: 'found', title: '黑色 AirPods Pro 2', category: '数码', location: '图书馆三楼', date: '06-15', status: '待认领', author: '李同学', color: 'ink', icon: '◉', desc: '在靠窗自习区拾到，已交至图书馆服务台。' },
      { id: 2, type: 'lost', title: '蓝色帆布包', category: '日用', location: '南区食堂', date: '06-14', status: '招领中', author: '周同学', color: 'blue', icon: '▰', desc: '包内有一本《设计心理学》和校园卡。' },
      { id: 3, type: 'found', title: '校园卡 · 陈知行', category: '证件', location: '操场看台', date: '06-14', status: '待认领', author: '拾光志愿者', color: 'mint', icon: '▣', desc: '已核验姓名，等待失主联系。' },
      { id: 4, type: 'lost', title: '银色保温杯', category: '日用', location: '文科楼 204', date: '06-13', status: '招领中', author: '王同学', color: 'coral', icon: '◒', desc: '杯身有一枚小树贴纸，落款为 W。' },
      { id: 5, type: 'found', title: '一串钥匙', category: '其他', location: '西门快递站', date: '06-12', status: '已认领', author: '拾光志愿者', color: 'yellow', icon: '⌘', desc: '三把钥匙，附有蓝色小挂件。' }
    ],
    claims: [{ id: 1, item: '黑色 AirPods Pro 2', applicant: '林同学', date: '06-15 14:20', status: '审核中' }]
  }),
  getters: {
    currentUser: (state) => ({ student: { name: '林知夏', id: '2023010218', label: '普通学生' }, itemAdmin: { name: '赵老师', id: 'LF-ADMIN-01', label: '失物招领管理员' }, systemAdmin: { name: '陈老师', id: 'SYS-ADMIN-01', label: '系统管理员' } })[state.role],
    pendingCount: (state) => state.items.filter((item) => item.status === '待审核').length + state.claims.filter((claim) => claim.status === '审核中').length
  },
  actions: {
    setRole(role) { this.role = role },
    setActiveRoute(route) { this.activeRoute = route },
    publish(item) { this.items.unshift({ id: Date.now(), ...item, status: this.role === 'student' ? '待审核' : item.status, author: this.currentUser.name, date: '刚刚' }) },
    submitClaim(item) { this.claims.unshift({ id: Date.now(), item: item.title, applicant: this.currentUser.name, date: '刚刚', status: '审核中' }) },
    approve(id) { const item = this.items.find((entry) => entry.id === id); if (item) item.status = '招领中' },
    updateClaim(id, status) { const claim = this.claims.find((entry) => entry.id === id); if (claim) claim.status = status }
  }
})
