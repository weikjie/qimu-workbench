import { useCallback, useState } from 'react'
import { ArrowUpRight, Globe2, Link2, Pencil, Plus, Trash2 } from 'lucide-react'
import type { BrowserInfo, QuickLink } from '@shared/types'
import { useWorkspace } from '../../app/WorkspaceProvider'
import { PageHeader } from '../../components/layout/PageHeader'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { IconButton } from '../../components/ui/IconButton'
import { useToast } from '../../components/ui/Toast'
import { useBrowsers } from '../../hooks/useBrowsers'
import { getHostname, getLinkInitial, getLinkTone } from '../../lib/url'
import { desktop } from '../../services/desktop'
import { LinkDialog } from './LinkDialog'
import './links.css'

function browserName(browsers: BrowserInfo[], browserId: string | null): string {
  if (!browserId) return '系统默认'
  return browsers.find((browser) => browser.id === browserId)?.name ?? '默认浏览器'
}

function browserFamily(browsers: BrowserInfo[], browserId: string | null): BrowserInfo['family'] {
  if (!browserId) return 'other'
  return browsers.find((browser) => browser.id === browserId)?.family ?? 'other'
}

export function LinksView(): React.JSX.Element {
  const { data, addLink, updateLink, removeLink } = useWorkspace()
  const { notify } = useToast()
  const { browsers, loading: browsersLoading } = useBrowsers()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingLink, setEditingLink] = useState<QuickLink | null>(null)
  const [deletingLink, setDeletingLink] = useState<QuickLink | null>(null)

  const openDialog = useCallback((link: QuickLink | null) => {
    setEditingLink(link)
    setDialogOpen(true)
  }, [])

  const closeDialog = useCallback(() => {
    setDialogOpen(false)
    setEditingLink(null)
  }, [])

  async function openLink(link: QuickLink): Promise<void> {
    const result = await desktop.openLink(link.url, link.browserId)
    if (!result.ok) notify(result.message ?? '暂时无法打开这个链接。', 'error')
  }

  function handleSave(input: { title: string; url: string; browserId: string | null }): void {
    if (editingLink) {
      updateLink(editingLink.id, input)
      notify('链接已更新', 'success')
    } else {
      addLink(input)
      notify('已添加新的快捷链接', 'success')
    }
  }

  return (
    <div className="links-page">
      <PageHeader
        eyebrow="SHORTCUTS"
        title="快捷链接"
        description="把每天都会打开的网页安放在这里，点一下就能出发。"
        actions={
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => openDialog(null)}>
            添加链接
          </Button>
        }
      />

      <div className="links-toolbar">
        <span className="links-toolbar__hint">
          <Globe2 size={13} />
          每张卡片都可以指定用哪个浏览器打开
        </span>
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

      {data.links.length > 0 ? (
        <div className="link-grid">
          {data.links.map((link) => (
            <article key={link.id} className="link-card" data-tone={getLinkTone(link.url)}>
              <button
                type="button"
                className="link-card__open"
                aria-label={`打开 ${link.title}`}
                onClick={() => void openLink(link)}
              >
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
              </button>

              <div className="link-card__actions">
                <IconButton
                  label={`编辑「${link.title}」`}
                  icon={<Pencil size={14} />}
                  size="sm"
                  onClick={() => openDialog(link)}
                />
                <IconButton
                  label={`删除「${link.title}」`}
                  icon={<Trash2 size={14} />}
                  size="sm"
                  variant="danger"
                  onClick={() => setDeletingLink(link)}
                />
              </div>
            </article>
          ))}

          <button type="button" className="link-card link-card--add" onClick={() => openDialog(null)}>
            <span className="link-card--add__icon">
              <Plus size={18} />
            </span>
            <span>添加一个常去的网页</span>
          </button>
        </div>
      ) : (
        <div className="links-empty surface-card">
          <EmptyState
            icon={<Link2 size={24} strokeWidth={1.7} />}
            title="快捷入口还空着"
            description="收藏一个常看的网站，下次就能从这里一键打开。"
            action={
              <Button variant="primary" icon={<Plus size={15} />} onClick={() => openDialog(null)}>
                添加第一个链接
              </Button>
            }
          />
        </div>
      )}

      <LinkDialog
        open={dialogOpen}
        link={editingLink}
        browsers={browsers}
        browsersLoading={browsersLoading}
        onSave={handleSave}
        onClose={closeDialog}
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
    </div>
  )
}
