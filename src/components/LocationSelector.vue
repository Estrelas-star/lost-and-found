<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useAppStore } from '../stores/app'
import type { LocationDTO } from '../api/item'

const store = useAppStore()

const props = withDefaults(defineProps<{
  modelValue: string
  locationId?: number | null
  /** 级联框占位文案：默认给足信息；智能助手页传「地点」以与「标签」对齐（不改其它页面的默认文案） */
  placeholder?: string
}>(), {
  placeholder: '请选择校区 / 建筑 / 地点',
})
const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'update:locationId', value: number | null): void
}>()

// —— 真实地点（后端 /location/list 返回的树，parent_id 串成层级）——
interface CascaderNode { value: number; label: string; children: CascaderNode[] }
const usingReal = computed(() => store.locations.length > 0)

function buildTree(list: LocationDTO[]): CascaderNode[] {
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
const cascaderOptions = computed(() => buildTree(store.locations))

const selectedPath = ref<number[]>([])
watch(selectedPath, (path) => {
  const leafId = path && path.length ? path[path.length - 1] : null
  emit('update:locationId', leafId)
  const labels = (path || []).map((id) => store.locations.find((l) => l.id === id)?.name ?? '')
  emit('update:modelValue', labels.filter(Boolean).join(' · '))
}, { immediate: true })

// —— 兜底：后端无地点数据时，继续用写死的演示地点（与之前行为一致）——
interface CampusOption { label: string; value: string }
interface PlaceDef {
  label: string
  type: 'dorm' | 'teaching' | 'canteen' | 'landmark'
  buildings?: string[]
  floors?: string[]
}
const campusOptions: CampusOption[] = [
  { label: '朝晖校区', value: '朝晖' },
  { label: '屏峰校区', value: '屏峰' },
  { label: '莫干山校区', value: '莫干山' }
]
const placeDefs: Record<string, PlaceDef> = {
  宿舍楼: { label: '宿舍楼', type: 'dorm', buildings: ['1栋', '2栋', '3栋', '4栋', '5栋', '6栋'], floors: ['1楼', '2楼', '3楼', '4楼', '5楼', '6楼'] },
  教学楼: { label: '教学楼', type: 'teaching', floors: ['1楼', '2楼', '3楼', '4楼', '5楼'] },
  食堂: { label: '食堂', type: 'canteen', floors: ['1楼', '2楼', '3楼'] },
  图书馆: { label: '图书馆', type: 'teaching', floors: ['1楼', '2楼', '3楼', '4楼'] },
  精弘桥周边: { label: '精弘桥周边', type: 'landmark' },
  操场: { label: '操场', type: 'landmark' },
  绿地广场: { label: '绿地广场', type: 'landmark' }
}
const campusPlaces: Record<string, string[]> = {
  朝晖: ['宿舍楼', '教学楼', '食堂', '图书馆', '精弘桥周边', '操场'],
  屏峰: ['宿舍楼', '教学楼', '食堂', '图书馆', '操场'],
  莫干山: ['宿舍楼', '教学楼', '食堂', '图书馆']
}
const mockState = reactive({ campus: '', place: '', buildingNo: '', floor: '', detail: '' })
const mCampusLabel = computed(() => campusOptions.find((o) => o.value === mockState.campus)?.label ?? '')
const mPlaceKeys = computed(() => (mockState.campus ? campusPlaces[mockState.campus] ?? [] : [] as string[]))
const mCurrentPlace = computed(() => (mockState.place ? placeDefs[mockState.place] : null))
const mPlaceType = computed(() => mCurrentPlace.value?.type ?? '')
const mShowBuildingNo = computed(() => mPlaceType.value === 'dorm')
const mShowFloor = computed(() => ['dorm', 'teaching', 'canteen'].includes(mPlaceType.value))
const mBuildingNoOptions = computed(() => mCurrentPlace.value?.buildings ?? [])
const mFloorOptions = computed(() => mCurrentPlace.value?.floors ?? [])
const mockLocationText = computed(() => {
  const parts = [mCampusLabel.value, mockState.place, mockState.buildingNo, mockState.floor, mockState.detail]
  return parts.filter(Boolean).join(' · ')
})
watch(() => mockState.campus, () => { mockState.place = ''; mockState.buildingNo = ''; mockState.floor = ''; mockState.detail = '' })
watch(() => mockState.place, () => { mockState.buildingNo = ''; mockState.floor = ''; mockState.detail = '' })
watch(() => mockState.buildingNo, () => { mockState.floor = ''; mockState.detail = '' })
watch(() => mockState.floor, () => { mockState.detail = '' })
watch(mockLocationText, (value) => {
  emit('update:modelValue', value)
  emit('update:locationId', null)
}, { immediate: true })

function validate() {
  if (usingReal.value) {
    if (!selectedPath.value || !selectedPath.value.length) return { valid: false, message: '请选择丢失/拾取地点' }
    return { valid: true, message: '' }
  }
  if (!mockState.campus) return { valid: false, message: '请选择校区' }
  if (!mockState.place) return { valid: false, message: '请选择建筑/地点' }
  if (mShowBuildingNo.value && !mockState.buildingNo) return { valid: false, message: '请选择楼栋' }
  if (mShowFloor.value && !mockState.floor) return { valid: false, message: '请选择楼层' }
  if (!mockState.detail.trim()) return { valid: false, message: '请输入详细地址' }
  return { valid: true, message: '' }
}
function reset() {
  if (usingReal.value) { selectedPath.value = [] }
  else { mockState.campus = ''; mockState.place = ''; mockState.buildingNo = ''; mockState.floor = ''; mockState.detail = '' }
}

// —— 外部回填（AI 帮写 / 智能助手用）——
// 直接设置级联路径；传 [] 即清空。赋值会触发上面的 watch，自动 emit locationId 与地点文案
function setPath(path: number[]) {
  if (!usingReal.value) return   // 演示兜底模式没有 location_id 语义，不支持回填
  selectedPath.value = [...path]
}
// 按叶子地点 id 反推完整链路（根 → 叶）并选中；传 null/undefined 视为清空
function setLocation(leafId?: number | null) {
  if (!usingReal.value) return
  if (leafId == null) { selectedPath.value = []; return }
  const byId = new Map(store.locations.map((l) => [l.id, l]))
  const chain: number[] = []
  let cur = byId.get(leafId)
  let guard = 0
  while (cur && guard++ < 10) {
    chain.unshift(cur.id)
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined
  }
  selectedPath.value = chain
}
defineExpose({ validate, reset, setPath, setLocation })
</script>

<template>
  <div class="location-selector">
    <el-cascader v-if="usingReal" v-model="selectedPath" :options="cascaderOptions" :props="{ expandTrigger: 'hover' }" :placeholder="props.placeholder" class="loc-cascader" clearable />
    <template v-else>
      <el-select v-model="mockState.campus" placeholder="请选择校区" class="loc-col">
        <el-option v-for="o in campusOptions" :key="o.value" :label="o.label" :value="o.value" />
      </el-select>
      <el-select v-model="mockState.place" placeholder="请选择建筑/地点" :disabled="!mockState.campus" class="loc-col">
        <el-option v-for="p in mPlaceKeys" :key="p" :label="placeDefs[p].label" :value="p" />
      </el-select>
      <el-select v-if="mShowBuildingNo" v-model="mockState.buildingNo" :placeholder="`请选择${mCurrentPlace?.label}栋`" :disabled="!mockState.place" class="loc-col">
        <el-option v-for="b in mBuildingNoOptions" :key="b" :label="b" :value="b" />
      </el-select>
      <el-select v-if="mShowFloor" v-model="mockState.floor" placeholder="请选择楼层" :disabled="!mockState.place || (mShowBuildingNo && !mockState.buildingNo)" class="loc-col">
        <el-option v-for="f in mFloorOptions" :key="f" :label="f" :value="f" />
      </el-select>
      <el-input v-model="mockState.detail" placeholder="请输入详细地址（如：靠窗自习室 / 桥头左侧）" :disabled="!mockState.place" class="loc-col" />
    </template>
  </div>
</template>

<style scoped>
.location-selector{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-start;width:100%}
.location-selector .loc-col{flex:1 1 160px;min-width:150px}
.location-selector .loc-cascader{flex:1 1 100%}
.location-selector :deep(.el-select),
.location-selector :deep(.el-cascader),
.location-selector :deep(.el-input){width:100%}
</style>
