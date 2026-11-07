export const TODO_PRIORITIES = ['P0', 'P1', 'P2', 'P3'] as const

export type TodoPriority = (typeof TODO_PRIORITIES)[number]

export const DEFAULT_TODO_PRIORITY: TodoPriority = 'P2'

export function isTodoPriority(value: unknown): value is TodoPriority {
  return typeof value === 'string' && (TODO_PRIORITIES as readonly string[]).includes(value)
}
