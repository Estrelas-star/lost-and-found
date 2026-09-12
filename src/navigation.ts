export const navItems = {
  student: [
    { key: 'home', label: '发现物品', icon: '⌂', roles: ['student'] },
    { key: 'publish', label: '发布信息', icon: '+', roles: ['student'] },
    { key: 'posts', label: '我的发布', icon: '▤', roles: ['student'] },
    { key: 'claims', label: '我的认领', icon: '♡', roles: ['student'] }
  ],
  itemAdmin: [
    { key: 'audit', label: '审核中心', icon: '✓', roles: ['itemAdmin'] },
    { key: 'manage', label: '物品管理', icon: '▦', roles: ['itemAdmin'] }
  ],
  systemAdmin: [
    { key: 'dashboard', label: '数据总览', icon: '◫', roles: ['systemAdmin'] },
    { key: 'users', label: '账号管理', icon: '◎', roles: ['systemAdmin'] },
    { key: 'notices', label: '公告管理', icon: '▱', roles: ['systemAdmin'] }
  ]
} as const
