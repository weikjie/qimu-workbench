import { TODO_PRIORITIES, type TodoPriority } from '@shared/priorities'

export interface TodoPriorityMeta {
  label: string
  hint: string
}

export const TODO_PRIORITY_META: Record<TodoPriority, TodoPriorityMeta> = {
  P0: { label: '紧急', hint: '现在处理' },
  P1: { label: '重要', hint: '尽快安排' },
  P2: { label: '普通', hint: '按计划推进' },
  P3: { label: '稍后', hint: '有空再做' }
}

export function todoPriorityRank(priority: TodoPriority): number {
  return TODO_PRIORITIES.indexOf(priority)
}

/** Stable sort: tasks with the same priority keep their saved manual order. */
export function sortTodosByPriority<T extends { priority: TodoPriority }>(todos: readonly T[]): T[] {
  return [...todos].sort((left, right) => todoPriorityRank(left.priority) - todoPriorityRank(right.priority))
}
