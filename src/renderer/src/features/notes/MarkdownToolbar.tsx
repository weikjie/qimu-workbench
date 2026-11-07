import {
  Bold,
  Code2,
  Heading2,
  Italic,
  Link,
  List,
  ListChecks,
  Quote,
  Strikethrough
} from 'lucide-react'

interface MarkdownToolbarProps {
  onWrap: (before: string, after: string, placeholder: string) => void
  onPrefix: (prefix: string) => void
  disabled?: boolean
}

interface ToolDefinition {
  label: string
  shortcut?: string
  icon: typeof Bold
  action: () => void
}

export function MarkdownToolbar({ onWrap, onPrefix, disabled = false }: MarkdownToolbarProps): React.JSX.Element {
  const groups: ToolDefinition[][] = [
    [
      {
        label: '加粗',
        shortcut: 'Ctrl+B',
        icon: Bold,
        action: () => onWrap('**', '**', '加粗文字')
      },
      {
        label: '斜体',
        shortcut: 'Ctrl+I',
        icon: Italic,
        action: () => onWrap('*', '*', '斜体文字')
      },
      {
        label: '删除线',
        icon: Strikethrough,
        action: () => onWrap('~~', '~~', '删除文字')
      }
    ],
    [
      {
        label: '标题',
        icon: Heading2,
        action: () => onPrefix('## ')
      },
      {
        label: '引用',
        icon: Quote,
        action: () => onPrefix('> ')
      }
    ],
    [
      {
        label: '行内代码',
        icon: Code2,
        action: () => onWrap('`', '`', '代码')
      },
      {
        label: '链接',
        icon: Link,
        action: () => onWrap('[', '](https://)', '链接文字')
      }
    ],
    [
      {
        label: '无序列表',
        icon: List,
        action: () => onPrefix('- ')
      },
      {
        label: '任务列表',
        icon: ListChecks,
        action: () => onPrefix('- [ ] ')
      }
    ]
  ]

  return (
    <div className="md-toolbar" role="toolbar" aria-label="Markdown 格式工具">
      {groups.map((group, groupIndex) => (
        <div className="md-toolbar__group" key={groupIndex}>
          {group.map((tool) => {
            const Icon = tool.icon
            return (
              <button
                key={tool.label}
                type="button"
                className="md-tool"
                aria-label={tool.label}
                title={tool.shortcut ? `${tool.label} (${tool.shortcut})` : tool.label}
                disabled={disabled}
                onMouseDown={(event) => event.preventDefault()}
                onClick={tool.action}
              >
                <Icon size={15} strokeWidth={1.9} />
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
