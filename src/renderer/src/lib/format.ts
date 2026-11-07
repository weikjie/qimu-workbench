const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

export function formatLongDate(date = new Date()): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 · ${WEEKDAYS[date.getDay()]}`
}

export function formatDayChip(date = new Date()): string {
  return `${date.getMonth() + 1}月${date.getDate()}日 ${WEEKDAYS[date.getDay()]}`
}

export function formatClock(date = new Date()): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function formatRelativeTime(value: string, now = new Date()): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const diff = now.getTime() - date.getTime()
  if (diff < 60_000) return '刚刚'
  if (diff < 60 * 60_000) return `${Math.max(1, Math.floor(diff / 60_000))} 分钟前`

  const today = startOfDay(now)
  const target = startOfDay(date)
  const dayDiff = Math.round((today - target) / 86_400_000)

  if (dayDiff === 0) return `今天 ${formatClock(date)}`
  if (dayDiff === 1) return `昨天 ${formatClock(date)}`
  if (dayDiff > 1 && dayDiff < 7) return `${WEEKDAYS[date.getDay()]} ${formatClock(date)}`
  if (date.getFullYear() === now.getFullYear()) return `${date.getMonth() + 1}月${date.getDate()}日`
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}

export function getGreeting(date = new Date()): string {
  const hour = date.getHours()
  if (hour < 6) return '夜深了'
  if (hour < 11) return '早上好'
  if (hour < 13) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

export function countCharacters(value: string): number {
  return value.replace(/\s/g, '').length
}
