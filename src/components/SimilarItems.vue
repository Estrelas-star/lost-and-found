<script setup lang="ts">
// 详情页「相似帖子」：GET /item/:itemID/similar?limit=5
// 该接口是公开的纯 SQL 排序（标签命中 + 地点全链 + 全文相关度 + 时间），不调用 LLM、无额外成本；
// 物品不存在/已删除 → 20001；任何失败都静默隐藏，不打扰详情阅读。
import { ref, watch } from 'vue'
import { getSimilarItems } from '../api/agent'
import type { ItemDTO } from '../api/item'
import { resolveImageUrl } from '../utils/image'

const props = defineProps<{ itemId: number }>()
const emit = defineEmits<{ open: [id: number] }>()

const list = ref<ItemDTO[]>([])
const loading = ref(false)

function locationText(it: ItemDTO) {
  return (it.locations && it.locations.length)
    ? it.locations.map((l) => l.name).join(' · ')
    : (it.location_detail || '')
}

async function load(id: number) {
  if (!id) { list.value = []; return }
  loading.value = true
  try {
    const res = await getSimilarItems(id, 5)
    // 后端已保证不含自身，这里再兜一层
    list.value = Array.isArray(res.data) ? res.data.filter((it) => it.id !== id) : []
  } catch {
    list.value = []
  } finally {
    loading.value = false
  }
}

watch(() => props.itemId, (id) => { load(id) }, { immediate: true })
</script>

<template>
  <section v-if="loading || list.length" class="similar-section">
    <h3 class="similar-heading">相似帖子</h3>
    <el-skeleton v-if="loading" :rows="2" animated />
    <div v-else class="similar-list">
      <button v-for="it in list" :key="it.id" type="button" class="similar-card" @click="emit('open', it.id)">
        <span class="similar-cover">
          <img v-if="it.images?.[0]?.image_url" :src="resolveImageUrl(it.images[0].image_url)" alt="" />
          <template v-else>{{ it.type === 0 ? '◌' : '◉' }}</template>
        </span>
        <span class="similar-body">
          <strong>{{ it.title }}</strong>
          <small>{{ it.type === 0 ? '寻物' : '招领' }} · {{ locationText(it) || '地点未填' }}</small>
        </span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.similar-section{margin-top:22px;padding-top:18px;border-top:1px dashed #e4e9e4}
.similar-heading{margin:0 0 12px;font-size:14px}
.similar-list{display:flex;flex-direction:column;gap:8px}
.similar-card{display:flex;align-items:center;gap:10px;width:100%;padding:10px;border:1px solid var(--line);border-radius:var(--radius-md);background:var(--surface);text-align:left;box-shadow:var(--shadow-xs);transition:border-color var(--dur) var(--ease),box-shadow var(--dur) var(--ease)}
.similar-card:hover{border-color:var(--green);box-shadow:var(--shadow-card)}
.similar-cover{width:42px;height:42px;flex:0 0 42px;display:grid;place-items:center;overflow:hidden;border-radius:9px;background:#edf5ee;color:#96b3a6;font-size:16px}
.similar-cover img{width:100%;height:100%;object-fit:cover}
.similar-body{display:flex;flex-direction:column;gap:3px;min-width:0}
.similar-body strong{font-size:13px;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.similar-body small{color:var(--muted);font-size:11px}
</style>
