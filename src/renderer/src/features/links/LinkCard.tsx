import { createPortal } from 'react-dom'
import { ArrowUpRight, GripVertical, Pencil, Trash2 } from 'lucide-react'
import type { BrowserInfo, QuickLink } from '@shared/types'
import { IconButton } from '../../components/ui/IconButton'
import { cn } from '../../lib/cn'
import { getHostname, getLinkInitial, getLinkTone } from '../../lib/url'
import type { LinkDropPosition } from './useLinkDrag'

function browserName(browsers: BrowserInfo[], browserId: string | null): string {
  if (!browserId) return '系统默认'
  return browsers.find((browser) => browser.id === browserId)?.name ?? '默认浏览器'
}

function browserFamily(browsers: BrowserInfo[], browserId: string | null): BrowserInfo['family'] {
  if (!browserId) return 'other'
  return browsers.find((browser) => browser.id === browserId)?.family ?? 'other'
}

function LinkCardContent({
  link,
  browsers
}: {
  link: QuickLink
  browsers: BrowserInfo[]
}): React.JSX.Element {
  return (
    <>
      <span className="link-card__top">
        <span className="link-card__icon">{getLinkInitial(link.title, link.url)}</span>
        <span className="link-card__launch">
          <ArrowUpRight size={15} />
        </span>
      </span>
      <span className="link-card__copy">
        <strong>{link.title}</strong>
        <span className="link-card__host">{getHostname(link.url)}</span>
      </span>
      <span className="link-card__footer">
        <span className="link-card__browser">
          <span
            className="browser-chip__dot"
            data-family={browserFamily(browsers, link.browserId)}
          />
          {browserName(browsers, link.browserId)}
        </span>
        <span className="link-card__cta">打开</span>
      </span>
    </>
  )
}

interface LinkCardProps {
  link: QuickLink
  browsers: BrowserInfo[]
  dropPosition: LinkDropPosition | null
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
  onPressStart: (event: React.PointerEvent<HTMLElement>) => void
  onMoveUp: () => void
  onMoveDown: () => void
}

export function LinkCard({
  link,
  browsers,
  dropPosition,
  onOpen,
  onEdit,
  onDelete,
  onPressStart,
  onMoveUp,
  onMoveDown
}: LinkCardProps): React.JSX.Element {
  return (
    <article
      className={cn(
        'link-card',
        dropPosition === 'before' && 'is-drop-before',
        dropPosition === 'after' && 'is-drop-after'
      )}
      data-tone={getLinkTone(link.url)}
      data-link-card={link.id}
      data-flip-id={link.id}
      onPointerDown={(event) => onPressStart(event)}
    >
      <button
        type="button"
        className="link-card__open"
        aria-label={`打开 ${link.title}`}
        onClick={onOpen}
      >
        <LinkCardContent link={link} browsers={browsers} />
      </button>

      <div className="link-card__actions" data-no-drag>
        <IconButton
          label={`调整「${link.title}」的顺序`}
          title="拖动调整顺序；聚焦后按 ↑ / ↓ 在同组内移动"
          icon={<GripVertical size={14} />}
          size="sm"
          className="link-card__grip"
          onPointerDown={(event) => onPressStart(event)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              onMoveUp()
            } else if (event.key === 'ArrowDown') {
              event.preventDefault()
              onMoveDown()
            }
          }}
        />
        <IconButton
          label={`编辑「${link.title}」`}
          icon={<Pencil size={14} />}
          size="sm"
          onClick={onEdit}
        />
        <IconButton
          label={`删除「${link.title}」`}
          icon={<Trash2 size={14} />}
          size="sm"
          variant="danger"
          onClick={onDelete}
        />
      </div>
    </article>
  )
}

interface LinkDragPreviewProps {
  link: QuickLink
  browsers: BrowserInfo[]
  width: number
  height: number
  previewRef: React.RefObject<HTMLDivElement | null>
}

/** The card that follows the pointer while it is being dragged. */
export function LinkDragPreview({
  link,
  browsers,
  width,
  height,
  previewRef
}: LinkDragPreviewProps): React.ReactPortal {
  return createPortal(
    <article
      ref={previewRef}
      className="link-card link-card--drag-preview"
      data-tone={getLinkTone(link.url)}
      style={{ width, height }}
      aria-hidden="true"
    >
      <div className="link-card__open">
        <LinkCardContent link={link} browsers={browsers} />
      </div>
    </article>,
    document.body
  )
}
