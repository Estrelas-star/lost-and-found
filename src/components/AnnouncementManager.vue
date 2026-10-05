<script setup lang="ts">
// 系统管理员 · 公告管理（对接真实后端）
// 后端契约（已核对 router / handler / service / model）：
//   GET    /admin/announcement?page&page_size&status  → data {total,page,page_size,announcements[]}（含已下架）
//   POST   /admin/announcement/create  {title,content,type,is_top}              创建即发布：status=1、published_at=now
//   POST   /admin/announcement/update  {id,title?,content?,type?,status?,is_top?}  增量更新（不传即不动）
//   DELETE /admin/announcement/:id     软删除（is_deleted=1），删后公开/管理均不可见
// 枚举：type 0系统公告 1活动公告 2维护通知 3其他；status 1已发布 2已下架；is_top 0否 1是
// 校验：标题 trim 非空且 ≤100 字节、内容 trim 非空、type 0-3、status 仅 1/2、is_top 0/1，否则后端返回 90003
// 权限：仅系统管理员(role=2)，其它角色后端会拦（前端另做守卫提示）
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAppStore } from '../stores/app'
import {
  adminGetAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  type AnnouncementItem,
} from '../api/announcement'

const store = useAppStore()

const TYPE_OPTIONS = [
  { value: 0, label: '系统公告' },
  { value: 1, label: '活动公告' },
  { value: 2, label: '维护通知' },
  { value: 3, label: '其他' }
]
const STATUS_OPTIONS = [
  { value: 1, label: '已发布' },
  { value: 2, label: '已下架' }
]
function typeLabel(t: number) {
  return TYPE_OPTIONS.find((o) => o.value === t)?.label ?? `类型 ${t}`
}
function statusLabel(s: number) {
  return STATUS_OPTIONS.find((o) => o.value === s)?.label ?? `状态 ${s}`
}
function fmtDate(v?: string | null) {
  if (!v) return '—'
  const d = new Date(v)
  if (isNaN(d.getTime())) return String(v).slice(0, 10)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const isSuperAdmin = computed(() => store.authUser?.role === 2)

const list = ref<AnnouncementItem[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const statusFilter = ref<number | ''>('')
const keyword = ref('')
const loading = ref(false)
const busyId = ref<number | null>(null)

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
const filtered = computed(() => {
  const k = keyword.value.trim().toLowerCase()
  if (!k) return list.value
  return list.value.filter(
    (a) => a.title.toLowerCase().includes(k) || a.content.toLowerCase().includes(k)
  )
})

async function load() {
  if (!isSuperAdmin.value) return
  loading.value = true
  try {
    const res = await adminGetAnnouncements({
      page: page.value,
      page_size: pageSize.value,
      status: statusFilter.value === '' ? undefined : statusFilter.value
    })
    list.value = res.data?.announcements ?? []
    total.value = res.data?.total ?? 0
  } catch (e: any) {
    ElMessage.error('加载公告失败：' + (e?.message || '请稍后重试'))
  } finally {
    loading.value = false
  }
}

function onStatusFilterChange(e: Event) {
  const v = (e.target as HTMLSelectElement).value
  statusFilter.value = v === '' ? '' : Number(v)
  page.value = 1
  load()
}
function goPage(p: number) {
  if (p < 1 || p > totalPages.value || p === page.value) return
  page.value = p
  load()
}

// —— 新建 / 编辑弹窗 ——
const dialog = ref(false)
const editingId = ref<number | null>(null)
const submitting = ref(false)
const form = ref({ title: '', content: '', type: 0, is_top: 0, status: 1 })

function openCreate() {
  editingId.value = null
  form.value = { title: '', content: '', type: 0, is_top: 0, status: 1 }
  dialog.value = true
}
function openEdit(a: AnnouncementItem) {
  editingId.value = a.id
  form.value = { title: a.title, content: a.content, type: a.type, is_top: a.is_top, status: a.status }
  dialog.value = true
}

async function submit() {
  const title = form.value.title.trim()
  const content = form.value.content.trim()
  if (!title) return ElMessage.warning('请填写公告标题')
  if (title.length > 100) return ElMessage.warning('标题不能超过 100 个字符')
  if (!content) return ElMessage.warning('请填写公告内容')
  submitting.value = true
  try {
    if (editingId.value == null) {
      await createAnnouncement({
        title,
        content,
        type: form.value.type,
        is_top: form.value.is_top
      })
      ElMessage.success('公告已发布')
    } else {
      await updateAnnouncement({
        id: editingId.value,
        title,
        content,
        type: form.value.type,
        is_top: form.value.is_top,
        status: form.value.status
      })
      ElMessage.success('公告已更新')
    }
    dialog.value = false
    await load()
  } catch (e: any) {
    ElMessage.error('保存失败：' + (e?.message || '请稍后重试'))
  } finally {
    submitting.value = false
  }
}

async function toggleTop(a: AnnouncementItem) {
  const next = a.is_top ? 0 : 1
  busyId.value = a.id
  try {
    await updateAnnouncement({ id: a.id, is_top: next })
    a.is_top = next
    ElMessage.success(next ? '已置顶' : '已取消置顶')
  } catch (e: any) {
    ElMessage.error('操作失败：' + (e?.message || '请稍后重试'))
  } finally {
    busyId.value = null
  }
}

async function toggleStatus(a: AnnouncementItem) {
  const next = a.status === 1 ? 2 : 1
  busyId.value = a.id
  try {
    await updateAnnouncement({ id: a.id, status: next })
    a.status = next
    ElMessage.success(next === 1 ? '已重新上架' : '已下架')
  } catch (e: any) {
    ElMessage.error('操作失败：' + (e?.message || '请稍后重试'))
  } finally {
    busyId.value = null
  }
}

async function remove(a: AnnouncementItem) {
  try {
    await ElMessageBox.confirm(`确定删除公告「${a.title}」？删除后不可恢复。`, '删除公告', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    })
  } catch {
    return
  }
  busyId.value = a.id
  try {
    await deleteAnnouncement(a.id)
    ElMessage.success('已删除')
    // 删掉当前页最后一条时回退一页
    if (list.value.length === 1 && page.value > 1) page.value -= 1
    await load()
  } catch (e: any) {
    ElMessage.error('删除失败：' + (e?.message || '请稍后重试'))
  } finally {
    busyId.value = null
  }
}

onMounted(load)
</script>

<template>
  <div class="announcement-manager">
    <div class="section-intro">
      <span class="eyebrow">SYSTEM SETTINGS</span>
      <h1>公告管理</h1>
      <p>让重要消息抵达每一位同学。</p>
    </div>

    <div v-if="!isSuperAdmin" class="am-guard">
      仅「系统管理员」可管理公告。请使用系统管理员账号登录。
    </div>

    <template v-else>
      <div class="am-toolbar">
        <select class="am-select" :value="statusFilter" @change="onStatusFilterChange">
          <option value="">全部状态</option>
          <option :value="1">已发布</option>
          <option :value="2">已下架</option>
        </select>
        <input v-model="keyword" class="am-search" type="text" placeholder="搜索公告标题或内容" />
        <span class="am-count">共 {{ total }} 条</span>
        <button class="am-btn" @click="openCreate">＋ 新建公告</button>
      </div>

      <div v-if="!list.length && !loading" class="am-empty">暂无公告，点「新建公告」发布第一条。</div>

      <div v-else class="table-panel">
        <div v-for="a in filtered" :key="a.id" class="table-row am-row">
          <div class="mini-visual mint">✦</div>
          <div class="row-main">
            <strong>
              {{ a.title }}
              <span v-if="a.is_top" class="am-top-flag">置顶</span>
            </strong>
            <small>{{ fmtDate(a.published_at || a.created_at) }} · 浏览 {{ a.view_count }}</small>
          </div>

          <div class="am-ops">
            <span class="am-tag type" :class="'t' + a.type">{{ typeLabel(a.type) }}</span>
            <span class="am-tag" :class="a.status === 1 ? 'on' : 'off'">{{ statusLabel(a.status) }}</span>
            <button class="am-btn ghost" :disabled="busyId === a.id" @click="openEdit(a)">编辑</button>
            <button class="am-btn ghost" :disabled="busyId === a.id" @click="toggleTop(a)">
              {{ a.is_top ? '取消置顶' : '置顶' }}
            </button>
            <button class="am-btn ghost" :disabled="busyId === a.id" @click="toggleStatus(a)">
              {{ a.status === 1 ? '下架' : '上架' }}
            </button>
            <button class="am-btn danger" :disabled="busyId === a.id" @click="remove(a)">删除</button>
          </div>
        </div>

        <div v-if="filtered.length === 0" class="am-empty">没有匹配「{{ keyword }}」的公告。</div>
      </div>

      <div v-if="totalPages > 1" class="am-pager">
        <button class="am-btn ghost" :disabled="page <= 1 || loading" @click="goPage(page - 1)">上一页</button>
        <span class="am-page-info">{{ page }} / {{ totalPages }}</span>
        <button class="am-btn ghost" :disabled="page >= totalPages || loading" @click="goPage(page + 1)">下一页</button>
      </div>
    </template>

    <el-dialog v-model="dialog" :title="editingId == null ? '新建公告' : '编辑公告'" width="560px" align-center>
      <div class="am-dialog-body">
        <label class="am-field">
          <span>标题</span>
          <input v-model="form.title" class="am-search wide" type="text" maxlength="100" placeholder="不超过 100 个字符" />
        </label>
        <label class="am-field">
          <span>内容</span>
          <textarea v-model="form.content" class="am-textarea" rows="6" placeholder="公告正文，支持 Markdown 语法"></textarea>
        </label>
        <div class="am-field-row">
          <label class="am-field">
            <span>类型</span>
            <select v-model.number="form.type" class="am-select wide">
              <option v-for="o in TYPE_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </label>
          <label class="am-field" v-if="editingId != null">
            <span>状态</span>
            <select v-model.number="form.status" class="am-select wide">
              <option v-for="o in STATUS_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </label>
        </div>
        <label class="am-checkbox">
          <input v-model.number="form.is_top" type="checkbox" :true-value="1" :false-value="0" />
          <span>置顶显示</span>
        </label>
        <p class="am-hint">新建即发布，保存后同学端立即可见。</p>
      </div>
      <template #footer>
        <button class="am-btn ghost" @click="dialog = false">取消</button>
        <button class="am-btn" :disabled="submitting" @click="submit">
          {{ submitting ? '保存中…' : '保存' }}
        </button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.announcement-manager { display: flex; flex-direction: column; gap: 18px; }
.am-guard {
  padding: 18px 20px; border: 1px solid var(--line); border-radius: 12px;
  background: #fbfcfa; color: #6b7a72; font-size: 14px;
}
.am-toolbar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.am-search {
  flex: 1 1 220px; min-width: 180px; height: 38px; padding: 0 14px;
  border: 1px solid var(--line); border-radius: 10px; background: #fff;
  font-size: 14px; color: var(--ink); outline: none;
}
.am-search:focus { border-color: #8fbf9f; box-shadow: 0 0 0 3px rgba(143, 191, 159, 0.15); }
.am-search.wide { flex: 1 1 auto; width: 100%; height: 36px; }
.am-count { font-size: 12px; color: #93a09a; }
.am-empty { padding: 26px 18px; text-align: center; color: #93a09a; font-size: 13px; }

.am-btn {
  height: 38px; padding: 0 18px; border: none; border-radius: 10px; cursor: pointer;
  background: linear-gradient(135deg, #7fc396, #5aa87a); color: #fff;
  font-size: 13px; font-weight: 600; letter-spacing: 0.4px;
  transition: transform 0.16s ease, box-shadow 0.16s ease, opacity 0.16s ease;
}
.am-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 8px 18px rgba(90, 168, 122, 0.28); }
.am-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.am-btn.ghost { background: #fff; color: #4f7a63; border: 1px solid var(--line); height: 34px; padding: 0 14px; font-weight: 500; }
.am-btn.ghost:hover:not(:disabled) { background: #f2f8f4; box-shadow: none; }
.am-btn.danger { background: #fff; color: #c0392b; border: 1px solid #f3d3d0; height: 34px; padding: 0 14px; font-weight: 500; }
.am-btn.danger:hover:not(:disabled) { background: #fdecec; box-shadow: none; }

.am-row { align-items: center; }
.am-row strong { display: inline-flex; align-items: center; gap: 6px; }
.am-top-flag {
  font-size: 11px; font-weight: 600; color: #b07d2b; background: #fdf3e0;
  border-radius: 6px; padding: 1px 6px;
}
.am-ops { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.am-tag {
  font-size: 12px; padding: 3px 10px; border-radius: 8px; white-space: nowrap;
  background: #f1f4f2; color: #6b7a72;
}
.am-tag.on { background: #e6f4ea; color: #2f7d52; }
.am-tag.off { background: #eee; color: #8a9490; }
.am-tag.type { background: #eef3fb; color: #3b6ea5; }

.am-pager { display: flex; align-items: center; justify-content: center; gap: 14px; }
.am-page-info { font-size: 13px; color: #6b7a72; }

.am-dialog-body { display: flex; flex-direction: column; gap: 14px; }
.am-field { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: #6b7a72; }
.am-field > span { font-weight: 600; color: var(--ink); }
.am-field-row { display: flex; gap: 14px; }
.am-field-row .am-field { flex: 1; }
.am-textarea {
  width: 100%; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px;
  background: #fff; font-size: 13px; color: var(--ink); outline: none; resize: vertical;
  font-family: inherit; line-height: 1.6;
}
.am-textarea:focus { border-color: #8fbf9f; box-shadow: 0 0 0 3px rgba(143, 191, 159, 0.15); }
.am-select {
  height: 38px; padding: 0 10px; border: 1px solid var(--line); border-radius: 10px;
  background: #fff; font-size: 13px; color: var(--ink); outline: none; cursor: pointer;
}
.am-select.wide { width: 100%; height: 36px; }
.am-checkbox { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--ink); cursor: pointer; }
.am-hint { font-size: 12px; color: #a0aaa5; margin: 0; }
</style>
