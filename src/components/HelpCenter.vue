<script setup lang="ts">
// 帮助中心（左下角「帮助与反馈」入口）：按「用户组（角色）→ 目录」组织
// 内容来源：src/utils/helpContent.ts（依据后端 api_guide.md / api_agent.md 维护）
import { computed, ref, watch } from 'vue'
import { useAppStore } from '../stores/app'
import { helpGroups } from '../utils/helpContent'

const store = useAppStore()

// 默认定位到「当前登录角色」对应的分组，映射不到就落到「通用」
const roleGroup: Record<string, string> = {
  student: 'student',
  itemAdmin: 'itemAdmin',
  systemAdmin: 'systemAdmin',
}
const activeGroup = ref(roleGroup[store.role] ?? 'common')
const group = computed(() => helpGroups.find((g) => g.key === activeGroup.value) ?? helpGroups[0])
const activeSection = ref(group.value.sections[0]?.id ?? '')

watch(activeGroup, () => {
  activeSection.value = group.value.sections[0]?.id ?? ''
  window.scrollTo({ top: 0, behavior: 'smooth' })
})

function goSection(id: string) {
  activeSection.value = id
  document.getElementById(`help-sec-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// 内容里只用到 **加粗** 一种标记：先转义再替换，避免 v-html 注入
function inlineHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
}

const pad2 = (n: number) => String(n).padStart(2, '0')
</script>

<template>
  <section class="help-page">
    <div class="section-intro">
      <span class="eyebrow">HELP CENTER</span>
      <h1>帮助中心</h1>
      <p>按用户组与功能目录整理的操作说明；内容中的接口限制与错误码与后端文档保持同步。</p>
    </div>

    <!-- 用户组 -->
    <div class="help-groups">
      <button
        v-for="g in helpGroups"
        :key="g.key"
        type="button"
        class="help-group"
        :class="{ active: g.key === activeGroup }"
        @click="activeGroup = g.key"
      >
        <strong>{{ g.label }}</strong>
        <small>{{ g.who }}</small>
      </button>
    </div>

    <p class="help-intro">{{ group.intro }}</p>

    <div class="help-layout">
      <!-- 目录 -->
      <nav class="help-toc">
        <span class="help-toc-title">目录 · {{ group.label }}</span>
        <button
          v-for="(s, i) in group.sections"
          :key="s.id"
          type="button"
          class="help-toc-item"
          :class="{ active: s.id === activeSection }"
          @click="goSection(s.id)"
        >
          <em>{{ pad2(i + 1) }}</em>{{ s.title }}
        </button>
      </nav>

      <!-- 内容 -->
      <div class="help-content">
        <article v-for="(s, i) in group.sections" :id="'help-sec-' + s.id" :key="s.id" class="help-article">
          <h3><em>{{ pad2(i + 1) }}</em>{{ s.title }}</h3>
          <ol class="help-steps">
            <li v-for="(step, si) in s.steps" :key="si" v-html="inlineHtml(step)"></li>
          </ol>
          <div v-if="s.notes?.length" class="help-notes">
            <span class="help-notes-title">注意</span>
            <ul>
              <li v-for="(n, ni) in s.notes" :key="ni" v-html="inlineHtml(n)"></li>
            </ul>
          </div>
          <div v-if="s.codes?.length" class="help-codes">
            <span class="help-codes-title">常见提示</span>
            <div class="help-code-list">
              <span v-for="c in s.codes" :key="c.code" class="help-code"><b>{{ c.code }}</b>{{ c.message }}</span>
            </div>
          </div>
        </article>
        <p class="help-foot">还有疑问？可联系管理员，或查看顶栏「公告」了解最新变更。</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.help-page{max-width:1080px}
/* 用户组切换 */
.help-groups{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;margin:22px 0 14px}
.help-group{display:flex;flex-direction:column;gap:3px;padding:12px 15px;border:1px solid var(--line);border-radius:var(--radius-lg);background:var(--surface);text-align:left;transition:border-color var(--dur) var(--ease),box-shadow var(--dur) var(--ease),background var(--dur) var(--ease)}
.help-group strong{font-size:13px}
.help-group small{color:var(--muted);font-size:11px}
.help-group:hover{border-color:var(--green-light);box-shadow:var(--shadow-xs)}
.help-group.active{border-color:var(--green);background:var(--green-soft)}
.help-group.active strong{color:var(--green)}
.help-intro{margin:0 0 18px;color:var(--muted);font-size:12px;line-height:1.7}
/* 目录 + 内容 */
.help-layout{display:grid;grid-template-columns:224px minmax(0,1fr);gap:20px;align-items:start}
.help-toc{position:sticky;top:92px;display:flex;flex-direction:column;gap:4px;padding:14px;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-lg);box-shadow:var(--shadow-xs)}
.help-toc-title{padding:0 8px 8px;color:#9aa9a1;font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase}
.help-toc-item{display:flex;align-items:center;gap:8px;padding:8px 9px;border-radius:var(--radius-sm);color:#5c6d66;font-size:12px;text-align:left;transition:background var(--dur) var(--ease),color var(--dur) var(--ease)}
.help-toc-item em{font-style:normal;font-size:10px;color:#b3bfb9;letter-spacing:.5px}
.help-toc-item:hover{background:var(--surface-accent)}
.help-toc-item.active{background:var(--green-soft);color:var(--green);font-weight:700}
.help-toc-item.active em{color:var(--green)}
.help-content{min-width:0}
.help-article{padding:20px 22px;margin-bottom:14px;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-lg);box-shadow:var(--shadow-xs);scroll-margin-top:92px}
.help-article h3{display:flex;align-items:center;gap:9px;margin:0 0 14px;font-size:16px}
.help-article h3 em{font-style:normal;font-size:11px;font-weight:700;color:var(--green);background:var(--green-soft);border-radius:6px;padding:3px 7px}
.help-steps{margin:0;padding-left:0;list-style:none;counter-reset:help-step}
.help-steps li{position:relative;padding:0 0 10px 26px;color:#4b5563;font-size:13px;line-height:1.75}
.help-steps li:last-child{padding-bottom:0}
.help-steps li::before{counter-increment:help-step;content:counter(help-step);position:absolute;left:0;top:1px;width:18px;height:18px;border-radius:50%;background:var(--surface-accent);color:#6b7a73;font-size:10px;font-weight:700;display:grid;place-items:center}
.help-steps strong,.help-notes strong{color:var(--green)}
/* 注意事项 */
.help-notes{margin-top:14px;padding:12px 14px;border-radius:var(--radius-md);background:#fffaf0;border:1px solid #f3e3bd}
.help-notes-title{display:block;margin-bottom:6px;color:#a2812f;font-size:11px;font-weight:700;letter-spacing:.6px}
.help-notes ul{margin:0;padding-left:18px}
.help-notes li{color:#7a6529;font-size:12px;line-height:1.8}
/* 错误码 */
.help-codes{margin-top:14px}
.help-codes-title{display:block;margin-bottom:8px;color:#9aa9a1;font-size:11px;font-weight:700;letter-spacing:.6px}
.help-code-list{display:flex;flex-wrap:wrap;gap:6px}
.help-code{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border:1px solid var(--line);border-radius:var(--radius-pill);background:var(--surface-soft);color:#5c6d66;font-size:11px}
.help-code b{color:var(--danger);font-size:11px;font-weight:700}
.help-foot{margin:4px 0 0;padding:14px 4px;color:#9aa9a1;font-size:12px;text-align:center}
@media(max-width:900px){
  .help-layout{grid-template-columns:1fr}
  .help-toc{position:static;flex-direction:row;flex-wrap:wrap;gap:6px;padding:10px}
  .help-toc-title{flex-basis:100%;padding-bottom:4px}
  .help-article{scroll-margin-top:84px}
}
@media(max-width:700px){
  .help-groups{grid-template-columns:1fr}
  .help-article{padding:16px}
}
</style>
