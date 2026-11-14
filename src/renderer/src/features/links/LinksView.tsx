import { useCallback, useMemo, useState } from 'react'
import {
  Folder,
  FolderPlus,
  Globe2,
  GripVertical,
  Link2,
  Pencil,
  Plus,
  Trash2
} from 'lucide-react'
import type { QuickLink, QuickLinkGroup, QuickLinkInput } from '@shared/types'
import { useWorkspace } from '../../app/WorkspaceProvider'
import { PageHeader } from '../../components/layout/PageHeader'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { IconButton } from '../../components/ui/IconButton'
import { useToast } from '../../components/ui/Toast'
import { useBrowsers } from '../../hooks/useBrowsers'
import { useFlipLayout } from '../../hooks/useFlipLayout'
import { cn } from '../../lib/cn'
import { desktop } from '../../services/desktop'
import { LinkCard, LinkDragPreview } from './LinkCard'
import { LinkDialog } from './LinkDialog'
import { LinkGroupDialog } from './LinkGroupDialog'
import { useLinkDrag } from './useLinkDrag'
import './links.css'

interface LinkSection {
  group: QuickLinkGroup | null
  links: QuickLink[]
}

type LinkGridItem = { kind: 'link'; link: QuickLink } | { kind: 'placeholder' }

export function LinksView(): React.JSX.Element {
  const {
    data,
    addLink,
    updateLink,
    removeLink,
    reorderLink,
    addLinkGroup,
    renameLinkGroup,
    removeLinkGroup
  } = useWorkspace()
  const { notify } = useToast()
  const { browsers, loading: browsersLoading } = useBrowsers()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingLink, setEditingLink] = useState<QuickLink | null>(null)
  const [dialogGroupId, setDialogGroupId] = useState<string | null>(null)
  const [deletingLink, setDeletingLink] = useState<QuickLink | null>(null)
  const [groupDialogOpen, setGroupDialogOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState<QuickLinkGroup | null>(null)
  const [deletingGroup, setDeletingGroup] = useState<QuickLinkGroup | null>(null)

  const drag = useLinkDrag((link, result) => {
    if (result.kind === 'card') {
      reorderLink(link.id, result.linkId, result.position, result.groupId)
      return
    }

    // A live drop names the slot the placeholder occupies among this group's
    // other cards; turn it back into a before/after neighbor.
    const siblings = data.links.filter(
      (item) => item.groupId === result.groupId && item.id !== link.id
    )
    if (siblings.length === 0) {
      reorderLink(link.id, null, 'after', result.groupId)
      return
    }
    const index = Math.min(Math.max(result.index, 0), siblings.length)
    if (index < siblings.length) {
      reorderLink(link.id, siblings[index].id, 'before', result.groupId)
    } else {
      reorderLink(link.id, siblings[siblings.length - 1].id, 'after', result.groupId)
    }
  })

  useFlipLayout('.link-grid')

  const openDialog = useCallback((link: QuickLink | null, groupId: string | null) => {
    setEditingLink(link)
    setDialogGroupId(link?.groupId ?? groupId)
    setDialogOpen(true)
  }, [])

  const closeDialog = useCallback(() => {
    setDialogOpen(false)
    setEditingLink(null)
  }, [])

  const openGroupDialog = useCallback((group: QuickLinkGroup | null) => {
    setEditingGroup(group)
    setGroupDialogOpen(true)
  }, [])

  const closeGroupDialog = useCallback(() => {
    setGroupDialogOpen(false)
    setEditingGroup(null)
  }, [])

  async function openLink(link: QuickLink): Promise<void> {
    // A drag that ends on the card must not also launch the page.
    if (drag.justDragged()) return
    const result = await desktop.openLink(link.url, link.browserId)
    if (!result.ok) notify(result.message ?? '暂时无法打开这个链接。', 'error')
  }

  function handleSave(input: QuickLinkInput): void {
    if (editingLink) {
      updateLink(editingLink.id, input)
      notify('链接已更新', 'success')
    } else {
      addLink(input)
      notify('已添加新的快捷链接', 'success')
    }
  }

  function handleGroupSave(name: string): void {
    if (editingGroup) {
      renameLinkGroup(editingGroup.id, name)
      notify('分组已重命名', 'success')
    } else {
      addLinkGroup(name)
      notify('已创建新的分组', 'success')
    }
  }

  function moveWithinGroup(link: QuickLink, direction: 'up' | 'down'): void {
    const siblings = data.links.filter((item) => item.groupId === link.groupId)
    const index = siblings.findIndex((item) => item.id === link.id)
    const neighbor = siblings[index + (direction === 'up' ? -1 : 1)]
    if (!neighbor) return
    reorderLink(link.id, neighbor.id, direction === 'up' ? 'before' : 'after', link.groupId)
  }

  const sections = useMemo<LinkSection[]>(() => {
    // Without groups the page keeps its single, familiar grid.
    if (data.linkGroups.length === 0) return [{ group: null, links: data.links }]

    const grouped = data.linkGroups.map<LinkSection>((group) => ({
      group,
      links: data.links.filter((link) => link.groupId === group.id)
    }))
    const ungrouped = data.links.filter((link) => link.groupId === null)
    if (ungrouped.length > 0) grouped.push({ group: null, links: ungrouped })
    return grouped
  }, [data.linkGroups, data.links])

  const hasGroups = data.linkGroups.length > 0
  const isEmpty = data.links.length === 0 && !hasGroups
  const groupNames = data.linkGroups
    .filter((group) => group.id !== editingGroup?.id)
    .map((group) => group.name)
  const deletingGroupLinkCount = deletingGroup
    ? data.links.filter((link) => link.groupId === deletingGroup.id).length
    : 0

  return (
    <div className="links-page">
      <PageHeader
        eyebrow="SHORTCUTS"
        title="快捷链接"
        description="把每天都会打开的网页安放在这里，点一下就能出发。"
        actions={
          <>
            <Button
              variant="secondary"
              icon={<FolderPlus size={16} />}
              onClick={() => openGroupDialog(null)}
            >
              添加分组
            </Button>
            <Button variant="primary" icon={<Plus size={16} />} onClick={() => openDialog(null, null)}>
              添加链接
            </Button>
          </>
        }
      />

      <div className="links-toolbar">
        <div className="links-toolbar__notes">
          <span className="links-toolbar__hint">
            <GripVertical size={13} />
            {hasGroups ? '按住卡片拖动排序，拖到其他分组可以移动过去' : '按住卡片拖动排序'}
          </span>
          <span className="links-toolbar__hint links-toolbar__hint--quiet">
            <Globe2 size={13} />
            每张卡片都可以指定用哪个浏览器打开
          </span>
        </div>
        <div className="browser-chips" aria-label="已检测到的浏览器">
          {browsersLoading ? (
            <span className="browser-chip browser-chip--muted">正在检测浏览器…</span>
          ) : browsers.length > 0 ? (
            <>
              {browsers.map((browser) => (
                <span key={browser.id} className="browser-chip">
                  <span className="browser-chip__dot" data-family={browser.family} />
                  {browser.name}
                </span>
              ))}
              <span className="browser-chip browser-chip--muted">系统默认</span>
            </>
          ) : (
            <span className="browser-chip browser-chip--muted">将使用系统默认浏览器</span>
          )}
        </div>
      </div>

      {isEmpty ? (
        <div className="links-empty surface-card">
          <EmptyState
            icon={<Link2 size={24} strokeWidth={1.7} />}
            title="快捷入口还空着"
            description="收藏一个常看的网站，下次就能从这里一键打开。"
            action={
              <Button variant="primary" icon={<Plus size={15} />} onClick={() => openDialog(null, null)}>
                添加第一个链接
              </Button>
            }
          />
        </div>
      ) : (
        <div className={cn('link-groups', !hasGroups && 'link-groups--flat')}>
          {sections.map(({ group, links }) => {
            const groupId = group?.id ?? null
            const isDragOver = drag.dropTarget?.groupId === groupId
            const isDropZone = isDragOver && drag.dropTarget?.linkId === null
            const isDraggingHere =
              drag.draggingId !== null && links.some((link) => link.id === drag.draggingId)
            const visibleLinks = isDraggingHere
              ? links.filter((link) => link.id !== drag.draggingId)
              : links
            const liveIndex =
              isDraggingHere && drag.livePreview && drag.livePreview.groupId === groupId
                ? Math.min(Math.max(drag.livePreview.index, 0), visibleLinks.length)
                : null

            const gridItems: LinkGridItem[] = []
            visibleLinks.forEach((link, index) => {
              if (liveIndex === index) gridItems.push({ kind: 'placeholder' })
              gridItems.push({ kind: 'link', link })
            })
            if (liveIndex === visibleLinks.length) gridItems.push({ kind: 'placeholder' })

            return (
              <section
                key={group?.id ?? 'ungrouped'}
                className={cn(
                  'link-group',
                  isDragOver && 'is-drag-over',
                  isDropZone && 'is-drop-target'
                )}
                data-link-group={group?.id ?? ''}
                aria-label={group ? `${group.name} 分组` : '未分组的快捷链接'}
              >
                {group ? (
                  <header className="link-group__head">
                    <span className="link-group__icon">
                      <Folder size={14} strokeWidth={1.9} />
                    </span>
                    <span className="link-group__name">{group.name}</span>
                    <span className="link-group__count">{links.length}</span>
                    <div className="link-group__actions" data-no-drag>
                      <IconButton
                        label={`重命名「${group.name}」分组`}
                        icon={<Pencil size={13} />}
                        size="sm"
                        onClick={() => openGroupDialog(group)}
                      />
                      <IconButton
                        label={`删除「${group.name}」分组`}
                        icon={<Trash2 size={13} />}
                        size="sm"
                        variant="danger"
                        onClick={() => setDeletingGroup(group)}
                      />
                    </div>
                  </header>
                ) : hasGroups ? (
                  <header className="link-group__head link-group__head--plain">
                    <span className="link-group__name">未分组</span>
                    <span className="link-group__count">{links.length}</span>
                  </header>
                ) : null}

                <div className="link-grid">
                  {gridItems.map((item) =>
                    item.kind === 'placeholder' ? (
                      <div
                        key="link-drop-placeholder"
                        className="link-card link-card--placeholder"
                        data-flip-id="link-drop-placeholder"
                        aria-hidden="true"
                      />
                    ) : (
                      <LinkCard
                        key={item.link.id}
                        link={item.link}
                        browsers={browsers}
                        dropPosition={
                          drag.dropTarget?.linkId === item.link.id
                            ? drag.dropTarget.position
                            : null
                        }
                        onOpen={() => void openLink(item.link)}
                        onEdit={() => openDialog(item.link, item.link.groupId)}
                        onDelete={() => setDeletingLink(item.link)}
                        onPressStart={(event) => drag.beginPress(event, item.link)}
                        onMoveUp={() => moveWithinGroup(item.link, 'up')}
                        onMoveDown={() => moveWithinGroup(item.link, 'down')}
                      />
                    )
                  )}

                  <button
                    type="button"
                    className="link-card link-card--add"
                    data-no-drag
                    data-flip-id={`link-add-${groupId ?? 'ungrouped'}`}
                    onClick={() => openDialog(null, groupId)}
                  >
                    <span className="link-card--add__icon">
                      <Plus size={18} />
                    </span>
                    <span>{group ? '添加到此分组' : '添加一个常去的网页'}</span>
                  </button>
                </div>
              </section>
            )
          })}
        </div>
      )}

      {drag.preview ? (
        <LinkDragPreview
          previewRef={drag.previewRef}
          link={drag.preview.link}
          browsers={browsers}
          width={drag.preview.width}
          height={drag.preview.height}
        />
      ) : null}

      <LinkDialog
        open={dialogOpen}
        link={editingLink}
        browsers={browsers}
        browsersLoading={browsersLoading}
        groups={data.linkGroups}
        defaultGroupId={dialogGroupId}
        onSave={handleSave}
        onClose={closeDialog}
      />

      <LinkGroupDialog
        open={groupDialogOpen}
        group={editingGroup}
        existingNames={groupNames}
        onSave={handleGroupSave}
        onClose={closeGroupDialog}
      />

      <ConfirmDialog
        open={deletingLink !== null}
        title="删除这个快捷链接？"
        description={
          deletingLink
            ? `「${deletingLink.title}」将从快捷链接中移除，网页本身不会受到影响。`
            : ''
        }
        onConfirm={() => {
          if (!deletingLink) return
          removeLink(deletingLink.id)
          notify('快捷链接已删除', 'success')
          setDeletingLink(null)
        }}
        onClose={() => setDeletingLink(null)}
      />

      <ConfirmDialog
        open={deletingGroup !== null}
        title="删除这个分组？"
        description={
          deletingGroup
            ? deletingGroupLinkCount > 0
              ? `「${deletingGroup.name}」分组将被删除，其中的 ${deletingGroupLinkCount} 个链接会移到未分组。`
              : `「${deletingGroup.name}」分组中没有链接，删除后不可恢复。`
            : ''
        }
        confirmLabel="删除分组"
        onConfirm={() => {
          if (!deletingGroup) return
          const moved = deletingGroupLinkCount
          removeLinkGroup(deletingGroup.id)
          notify(
            moved > 0 ? `分组已删除，${moved} 个链接已移到未分组` : '分组已删除',
            'success'
          )
          setDeletingGroup(null)
        }}
        onClose={() => setDeletingGroup(null)}
      />
    </div>
  )
}
