<script setup>
defineProps({ label: String, value: [String, Number], trend: String, tone: String })
</script>
<template>
  <article class="metric-card" :class="tone">
    <span class="metric-label">{{ label }}</span>
    <strong>{{ value }}</strong>
    <small>{{ trend }}</small>
  </article>
</template>
