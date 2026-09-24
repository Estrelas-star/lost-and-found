<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'

interface CampusOption { label: string, value: string }
interface PlaceDef {
  label: string
  type: 'dorm' | 'teaching' | 'canteen' | 'landmark'
  buildings?: string[]
  floors?: string[]
}

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()

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

const state = reactive({
  campus: '',
  place: '',
  buildingNo: '', // 第几栋（仅宿舍楼）
  floor: '',      // 几楼
  detail: ''      // 详细地址
})

const campusLabel = computed(() => campusOptions.find((o) => o.value === state.campus)?.label ?? '')
const placeKeys = computed(() => (state.campus ? campusPlaces[state.campus] ?? [] : [] as string[]))
const currentPlace = computed(() => (state.place ? placeDefs[state.place] : null))
const placeType = computed(() => currentPlace.value?.type ?? '')
const showBuildingNo = computed(() => placeType.value === 'dorm')
const showFloor = computed(() => ['dorm', 'teaching', 'canteen'].includes(placeType.value))
const buildingNoOptions = computed(() => currentPlace.value?.buildings ?? [])
const floorOptions = computed(() => currentPlace.value?.floors ?? [])

const locationText = computed(() => {
  const parts = [campusLabel.value, state.place, state.buildingNo, state.floor, state.detail]
  return parts.filter(Boolean).join(' · ')
})

watch(() => state.campus, () => { state.place = ''; state.buildingNo = ''; state.floor = ''; state.detail = '' })
watch(() => state.place, () => { state.buildingNo = ''; state.floor = ''; state.detail = '' })
watch(() => state.buildingNo, () => { state.floor = ''; state.detail = '' })
watch(() => state.floor, () => { state.detail = '' })

watch(locationText, (value) => emit('update:modelValue', value), { immediate: true })

function validate() {
  if (!state.campus) return { valid: false, message: '请选择校区' }
  if (!state.place) return { valid: false, message: '请选择建筑/地点' }
  if (showBuildingNo.value && !state.buildingNo) return { valid: false, message: '请选择楼栋' }
  if (showFloor.value && !state.floor) return { valid: false, message: '请选择楼层' }
  if (!state.detail.trim()) return { valid: false, message: '请输入详细地址' }
  return { valid: true, message: '' }
}

function reset() {
  state.campus = ''
  state.place = ''
  state.buildingNo = ''
  state.floor = ''
  state.detail = ''
}

defineExpose({ validate, reset })
</script>

<template>
  <div class="location-selector">
    <el-select v-model="state.campus" placeholder="请选择校区" class="loc-col">
      <el-option v-for="o in campusOptions" :key="o.value" :label="o.label" :value="o.value" />
    </el-select>

    <el-select v-model="state.place" placeholder="请选择建筑/地点" :disabled="!state.campus" class="loc-col">
      <el-option v-for="p in placeKeys" :key="p" :label="placeDefs[p].label" :value="p" />
    </el-select>

    <el-select v-if="showBuildingNo" v-model="state.buildingNo" :placeholder="`请选择${currentPlace?.label}栋`" :disabled="!state.place" class="loc-col">
      <el-option v-for="b in buildingNoOptions" :key="b" :label="b" :value="b" />
    </el-select>

    <el-select v-if="showFloor" v-model="state.floor" placeholder="请选择楼层" :disabled="!state.place || (showBuildingNo && !state.buildingNo)" class="loc-col">
      <el-option v-for="f in floorOptions" :key="f" :label="f" :value="f" />
    </el-select>

    <el-input v-model="state.detail" placeholder="请输入详细地址（如：靠窗自习室 / 桥头左侧）" :disabled="!state.place" class="loc-col" />
  </div>
</template>

<style scoped>
.location-selector{display:flex;flex-wrap:wrap;gap:8px;width:100%}
.location-selector .loc-col{flex:1 1 130px;min-width:120px;max-width:100%}
@media(max-width:420px){.location-selector .loc-col{flex:1 1 100%;min-width:100%}}
</style>