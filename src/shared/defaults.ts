import type { WorkspaceData } from './types'

const DAY = 24 * 60 * 60 * 1000

const WELCOME_NOTE = `# 欢迎来到栖木

栖木是一间安静的数字工作台，把每天要做的事、常去的地方和正在生长的想法，收在同一个屋檐下。

## 三条小径

1. **待办清单**：写下今天真正重要的事，一次只做一件。
2. **快捷链接**：把常看的网页放在触手可及的地方，还能指定用哪个浏览器打开。
3. **Markdown 笔记**：左边书写，右边预览，文字会安静地自动保存。

> 所有内容都只保存在这台设备上。没有账号，也没有云端同步。

## 今日小练习

- [ ] 添加一件待办
- [ ] 收藏一个常用网站
- [ ] 在这里写下今天的一点感受

愿你的每一天，都有清晰的开始和从容的结束。
`

const CHEATSHEET_NOTE = `# Markdown 语法速查

## 常用格式

**加粗**、*斜体*、~~删除线~~，以及 \`行内代码\`。

> 引用一段想记住的话。

## 列表

- 一件小事
- 另一件小事
  - 可以缩进

1. 第一步
2. 第二步

## 代码块

\`\`\`ts
function greet(name: string) {
  return \`你好，\${name}。\`
}
\`\`\`

## 小表格

| 快捷键 | 功能 |
| --- | --- |
| Ctrl + S | 立即保存 |
| Tab | 缩进两格 |

---

写完以后，切到“预览”看看最终的样子。
`

/**
 * First-run content. It gives every feature a friendly place to start from
 * and can be edited or removed freely by the user.
 */
export function createDefaultWorkspace(now = Date.now()): WorkspaceData {
  const iso = (offsetMs: number): string => new Date(now - offsetMs).toISOString()

  return {
    version: 1,
    todos: [
      {
        id: 'seed-todo-focus',
        title: '整理今天最重要的三件事',
        done: false,
        createdAt: iso(DAY * 0.1),
        completedAt: null
      },
      {
        id: 'seed-todo-links',
        title: '把常看的网站收进快捷链接',
        done: false,
        createdAt: iso(DAY * 0.2),
        completedAt: null
      },
      {
        id: 'seed-todo-note',
        title: '打开 Markdown 笔记，写下第一个想法',
        done: false,
        createdAt: iso(DAY * 0.3),
        completedAt: null
      },
      {
        id: 'seed-todo-tour',
        title: '逛一逛栖木的每个角落',
        done: true,
        createdAt: iso(DAY * 0.8),
        completedAt: iso(DAY * 0.4)
      }
    ],
    links: [
      {
        id: 'seed-link-github',
        title: 'GitHub',
        url: 'https://github.com',
        browserId: null,
        createdAt: iso(DAY * 2)
      },
      {
        id: 'seed-link-deepseek',
        title: 'DeepSeek',
        url: 'https://chat.deepseek.com',
        browserId: null,
        createdAt: iso(DAY * 2)
      },
      {
        id: 'seed-link-figma',
        title: 'Figma',
        url: 'https://www.figma.com',
        browserId: null,
        createdAt: iso(DAY * 2)
      },
      {
        id: 'seed-link-mdn',
        title: 'MDN Web Docs',
        url: 'https://developer.mozilla.org',
        browserId: null,
        createdAt: iso(DAY * 2)
      }
    ],
    notes: [
      {
        id: 'seed-note-welcome',
        title: '欢迎来到栖木',
        content: WELCOME_NOTE,
        createdAt: iso(DAY * 0.1),
        updatedAt: iso(DAY * 0.1)
      },
      {
        id: 'seed-note-cheatsheet',
        title: 'Markdown 语法速查',
        content: CHEATSHEET_NOTE,
        createdAt: iso(DAY * 4),
        updatedAt: iso(DAY * 1.2)
      }
    ]
  }
}

export const EMPTY_WORKSPACE: WorkspaceData = {
  version: 1,
  todos: [],
  links: [],
  notes: []
}
