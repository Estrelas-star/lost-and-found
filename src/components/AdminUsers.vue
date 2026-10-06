<script setup lang="ts">
// 系统管理员 · 账号管理（对接真实后端）
// 后端契约（已核对 handler/service/router）：
//   POST /user/batch {ids:[number]}          → data: PublicUserResponse[]（公开字段：id/昵称/角色/头像/性别/时间）
//   POST /admin/change-role  {id, role:0|1|2}         需系统管理员(role=2)
//   POST /admin/change-status{id, status:0|1}         需系统管理员
//   POST /admin/add-credit   {id, credit, type:0|1|2|3, description?, operator_id}  operator_id 必须 == 当前登录用户 id
// 限制：后端无“列出全部用户”接口，也无 admin 用户列表接口；batch 只返回公开字段
//      → 因此列表用“遍历 id 分批拉取”实现；status/credit 当前值拿不到，页面上以本次操作后的本地值呈现。
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useAppStore } from '../stores/app'
import { batchGetUsers, adminChangeRole, adminChangeStatus, adminAddCredit } from '../api/user'
import type { PublicUserResponse } from '../api/types'
import { resolveImageUrl } from '../utils/image'

const store = useAppStore()

const ROLE_OPTIONS = [
  { value: 0, label: '普通学生' },
  { value: 1, label: '失物招领管理员' },
  { value: 2, label: '系统管理员' }
]
const CREDIT_TYPE_OPTIONS = [
  { value: 0, label: '拾金不昧奖励' },
  { value: 1, label: '认领成功奖励' },
  { value: 2, label: '违规扣分' },
  { value: 3, label: '系统调整' }
]
function roleLabel(r: number) {
  return ROLE_OPTIONS.find((o) => o.value === r)?.label ?? `角色 ${r}`
}

const users = ref<PublicUserResponse[]>([])
const loading = ref(false)
const keyword = ref('')

// 遍历 id 的游标：从 1 开始，每次推进 STEP 个 id，硬上限 MAX_ID
const STEP = 100
const MAX_ID = 500
const nextId = ref(1)
const exhausted = ref(false)

const isSuperAdmin = computed(() => store.authUser?.role === 2)
const meId = computed(() => store.authUser?.id ?? 0)

const filtered = computed(() => {
  const k = keyword.value.trim().toLowerCase()
  if (!k) return users.value
  return users.value.filter(
    (u) => (u.nickname || '').toLowerCase().includes(k) || String(u.id).includes(k)
  )
})

// batch 不返回 status/credit，这里记录“本次操作后”的本地值，仅用于即时反馈
const statusMap = ref<Record<number, number>>({})
const creditMap = ref<Record<number, number>>({})
const pendingId = ref<number | null>(null)

async function loadMore() {
  if (loading.value || exhausted.value) return
  loading.value = true
  const start = nextId.value
  try {
    const ids: number[] = []
    for (let i = start; i < start + STEP; i++) ids.push(i)
    const res = await batchGetUsers(ids)
    const got = res.data ?? []
    const exist = new Set(users.value.map((u) => u.id))
    const fresh = got.filter((u) => u && u.id && !exist.has(u.id))
    users.value = [...users.value, ...fresh].sort((a, b) => a.id - b.id)
    nextId.value = start + STEP
    if (nextId.value > MAX_ID) exhausted.value = true
    if (!fresh.length && exhausted.value) ElMessage.info('已加载到上限，未发现更多用户')
  } catch (e: any) {
    ElMessage.error('加载用户失败：' + (e?.message || '请稍后重试'))
  } finally {
    loading.value = false
  }
}

async function onRoleChange(u: PublicUserResponse, role: number) {
  if (role === u.role) return
  const prev = u.role
  pendingId.value = u.id
  try {
    await adminChangeRole({ id: u.id, role })
    u.role = role
    ElMessage.success(`已将「${u.nickname}」设为${roleLabel(role)}`)
  } catch (e: any) {
    u.role = prev
    ElMessage.error('修改角色失败：' + (e?.message || '请稍后重试'))
  } finally {
    pendingId.value = null
  }
}

async function onStatusChange(u: PublicUserResponse, status: number) {
  pendingId.value = u.id
  try {
    await adminChangeStatus({ id: u.id, status })
    statusMap.value[u.id] = status
    ElMessage.success(status === 0 ? `已禁用「${u.nickname}」` : `已启用「${u.nickname}」`)
  } catch (e: any) {
    ElMessage.error('操作失败：' + (e?.message || '请稍后重试'))
  } finally {
    pendingId.value = null
  }
}

// —— 积分调整弹窗 ——
const creditDialog = ref(false)
const creditTarget = ref<PublicUserResponse | null>(null)
const creditForm = ref({ credit: 0, type: 3, description: '' })

function openCredit(u: PublicUserResponse) {
  creditTarget.value = u
  creditForm.value = { credit: 0, type: 3, description: '' }
  creditDialog.value = true
}

async function submitCredit() {
  const u = creditTarget.value
  if (!u) return
  const delta = Number(creditForm.value.credit)
  if (!Number.isFinite(delta) || delta === 0) {
    ElMessage.warning('请输入非 0 的积分变动值（正数增加 / 负数扣减）')
    return
  }
  if (!meId.value) {
    ElMessage.error('登录状态异常，请重新登录后再操作')
    return
  }
  pendingId.value = u.id
  try {
    await adminAddCredit({
      id: u.id,
      credit: delta,
      type: creditForm.value.type,
      description: creditForm.value.description || undefined,
      operator_id: meId.value
    })
    creditMap.value[u.id] = (creditMap.value[u.id] ?? 0) + delta
    ElMessage.success(`已为「${u.nickname}」${delta > 0 ? '增加' : '扣减'} ${Math.abs(delta)} 分`)
    creditDialog.value = false
  } catch (e: any) {
    ElMessage.error('积分调整失败：' + (e?.message || '请稍后重试'))
  } finally {
    pendingId.value = null
  }
}

onMounted(() => {
  if (isSuperAdmin.value) loadMore()
})
</script>

<template>
  <div class="admin-users">
    <div class="section-intro">
      <span class="eyebrow">SYSTEM SETTINGS</span>
      <h1>账号管理</h1>
      <p>管理校园账号、角色与访问权限。</p>
    </div>

    <div v-if="!isSuperAdmin" class="au-guard">
      仅「系统管理员」可管理账号。请使用系统管理员账号登录。
    </div>

    <template v-else>
      <div class="au-toolbar">
        <input v-model="keyword" class="au-search" type="text" placeholder="搜索昵称或 ID" />
        <span class="au-count">已加载 {{ users.length }} 个用户（ID {{ nextId - STEP }} 以内）</span>
        <button class="au-btn" :disabled="loading || exhausted" @click="loadMore">
          {{ exhausted ? '已到上限' : loading ? '加载中…' : '加载更多' }}
        </button>
      </div>

      <div v-if="!users.length && !loading" class="au-empty">暂无用户，点「加载更多」开始拉取。</div>

      <div v-else class="table-panel">
        <div v-for="u in filtered" :key="u.id" class="table-row au-row">
          <div class="mini-visual mint au-avatar">
            <img v-if="u.avatar" :src="resolveImageUrl(u.avatar)" :alt="`${u.nickname || '用户'}的头像`" />
            <span v-else>{{ (u.nickname || 'U').slice(0, 1) }}</span>
          </div>
          <div class="row-main">
            <strong>{{ u.nickname || '未命名用户' }}</strong>
            <small>
              ID {{ u.id }} · {{ roleLabel(u.role) }}
              <template v-if="u.last_login_at"> · 上次登录 {{ u.last_login_at.slice(0, 10) }}</template>
            </small>
          </div>

          <div class="au-ops">
            <select
              class="au-select"
              :value="u.role"
              :disabled="pendingId === u.id"
              @change="onRoleChange(u, Number(($event.target as HTMLSelectElement).value))"
            >
              <option v-for="o in ROLE_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>

            <div class="au-seg">
              <button
                class="au-seg-btn"
                :class="{ on: statusMap[u.id] === 1 }"
                :disabled="pendingId === u.id"
                @click="onStatusChange(u, 1)"
              >
                启用
              </button>
              <button
                class="au-seg-btn danger"
                :class="{ on: statusMap[u.id] === 0 }"
                :disabled="pendingId === u.id"
                @click="onStatusChange(u, 0)"
              >
                禁用
              </button>
            </div>

            <button class="au-btn ghost" :disabled="pendingId === u.id" @click="openCredit(u)">
              积分
              <template v-if="creditMap[u.id]">
                {{ creditMap[u.id] > 0 ? `+${creditMap[u.id]}` : creditMap[u.id] }}
              </template>
            </button>
          </div>
        </div>

        <div v-if="filtered.length === 0" class="au-empty">没有匹配「{{ keyword }}」的用户。</div>
      </div>
    </template>

    <el-dialog v-model="creditDialog" title="调整积分" width="420px" align-center>
      <div v-if="creditTarget" class="au-dialog-body">
        <p class="au-dialog-user">
          目标用户：<strong>{{ creditTarget.nickname || '未命名用户' }}</strong>（ID {{ creditTarget.id }}）
        </p>
        <label class="au-field">
          <span>变动值</span>
          <el-input-number v-model="creditForm.credit" :step="10" :precision="0" controls-position="right" />
          <em class="au-hint">正数增加 / 负数扣减</em>
        </label>
        <label class="au-field">
          <span>类型</span>
          <select v-model.number="creditForm.type" class="au-select wide">
            <option v-for="o in CREDIT_TYPE_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
        </label>
        <label class="au-field">
          <span>备注</span>
          <input v-model="creditForm.description" class="au-search wide" type="text" placeholder="可选" />
        </label>
      </div>
      <template #footer>
        <button class="au-btn ghost" @click="creditDialog = false">取消</button>
        <button class="au-btn" :disabled="pendingId !== null" @click="submitCredit">确认调整</button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.admin-users { display: flex; flex-direction: column; gap: 18px; }
.au-guard {
  padding: 18px 20px; border: 1px solid var(--line); border-radius: 12px;
  background: #fbfcfa; color: #6b7a72; font-size: 14px;
}
.au-toolbar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.au-search {
  flex: 1 1 220px; min-width: 180px; height: 38px; padding: 0 14px;
  border: 1px solid var(--line); border-radius: 10px; background: #fff;
  font-size: 14px; color: var(--ink); outline: none;
}
.au-search:focus { border-color: #8fbf9f; box-shadow: 0 0 0 3px rgba(143, 191, 159, 0.15); }
.au-search.wide { flex: 1 1 auto; width: 100%; height: 34px; }
.au-count { font-size: 12px; color: #93a09a; }
.au-empty { padding: 26px 18px; text-align: center; color: #93a09a; font-size: 13px; }

.au-btn {
  height: 38px; padding: 0 18px; border: none; border-radius: 10px; cursor: pointer;
  background: linear-gradient(135deg, #7fc396, #5aa87a); color: #fff;
  font-size: 13px; font-weight: 600; letter-spacing: 0.4px;
  transition: transform 0.16s ease, box-shadow 0.16s ease, opacity 0.16s ease;
}
.au-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 8px 18px rgba(90, 168, 122, 0.28); }
.au-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.au-btn.ghost {
  background: #fff; color: #4f7a63; border: 1px solid var(--line);
}
.au-btn.ghost:hover:not(:disabled) { background: #f2f8f4; box-shadow: none; }

.au-row { align-items: center; }
.au-ops { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.au-select {
  height: 34px; padding: 0 10px; border: 1px solid var(--line); border-radius: 8px;
  background: #fff; font-size: 13px; color: var(--ink); outline: none; cursor: pointer;
}
.au-select.wide { width: 100%; height: 34px; }
.au-select:disabled { opacity: 0.55; cursor: not-allowed; }

.au-seg { display: inline-flex; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
.au-seg-btn {
  border: none; background: #fff; color: #6b7a72; cursor: pointer;
  padding: 0 12px; height: 32px; font-size: 13px;
}
.au-seg-btn + .au-seg-btn { border-left: 1px solid var(--line); }
.au-seg-btn.on { background: #e6f4ea; color: #2f7d52; font-weight: 600; }
.au-seg-btn.danger.on { background: #fdecec; color: #c0392b; }
.au-seg-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.au-dialog-body { display: flex; flex-direction: column; gap: 14px; }
.au-dialog-user { font-size: 13px; color: #6b7a72; margin: 0; }
.au-field { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: #6b7a72; }
.au-field > span { font-weight: 600; color: var(--ink); }
.au-hint { font-size: 12px; color: #a0aaa5; font-style: normal; }
/* 头像：/user/batch 的公开字段含 avatar，有则展示真实图片，否则回退昵称首字母 */
.au-avatar { padding: 0; overflow: hidden; }
.au-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
</style>
