import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { ChevronDown, Globe2 } from 'lucide-react'
import type { BrowserInfo, QuickLink } from '@shared/types'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { getHostname, normalizeUrlInput } from '../../lib/url'

interface LinkInput {
  title: string
  url: string
  browserId: string | null
}

interface LinkDialogProps {
  open: boolean
  link: QuickLink | null
  browsers: BrowserInfo[]
  browsersLoading: boolean
  onSave: (input: LinkInput) => void
  onClose: () => void
}

export function LinkDialog({
  open,
  link,
  browsers,
  browsersLoading,
  onSave,
  onClose
}: LinkDialogProps): React.JSX.Element {
  const formId = useId()
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [browserId, setBrowserId] = useState('default')
  const [error, setError] = useState('')
  const urlRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setTitle(link?.title ?? '')
    setUrl(link?.url ?? '')
    setBrowserId(link?.browserId ?? 'default')
    setError('')
  }, [open, link])

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const normalized = normalizeUrlInput(url)
    if (!normalized) {
      setError('请填写一个有效的网页地址，例如 https://example.com。')
      urlRef.current?.focus()
      return
    }

    const cleanTitle = title.trim() || getHostname(normalized)
    const browserStillInstalled = browsers.some((browser) => browser.id === browserId)
    onSave({
      title: cleanTitle.slice(0, 200),
      url: normalized,
      browserId: browserStillInstalled ? browserId : null
    })
    onClose()
  }

  function fillTitleFromUrl(): void {
    if (title.trim()) return
    const normalized = normalizeUrlInput(url)
    if (normalized) setTitle(getHostname(normalized))
  }

  const knownBrowserExists = browserId === 'default' || browsers.some((browser) => browser.id === browserId)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={link ? '编辑快捷链接' : '添加快捷链接'}
      description={
        link
          ? '调整名称、地址或默认打开方式。'
          : '把常去的网页放在触手可及的地方。'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" form={formId} variant="primary">
            {link ? '保存更改' : '添加链接'}
          </Button>
        </>
      }
    >
      <form id={formId} className="form-stack" onSubmit={handleSubmit}>
        <label className="field">
          <span className="field__label">名称</span>
          <input
            className="field__input"
            value={title}
            maxLength={200}
            placeholder="例如：项目看板"
            data-autofocus
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>

        <label className="field">
          <span className="field__label">网页地址</span>
          <input
            ref={urlRef}
            className="field__input"
            value={url}
            maxLength={2048}
            placeholder="https://example.com"
            inputMode="url"
            spellCheck={false}
            onChange={(event) => {
              setUrl(event.target.value)
              if (error) setError('')
            }}
            onBlur={fillTitleFromUrl}
          />
          <span className="field__hint">如果不写前缀，会自动补全为 https://。</span>
        </label>

        <label className="field">
          <span className="field__label">用哪个浏览器打开</span>
          <span className="select-wrap">
            <Globe2 size={15} className="select-wrap__icon" aria-hidden="true" />
            <select
              className="field__input field__select"
              value={knownBrowserExists ? browserId : 'default'}
              disabled={browsersLoading}
              onChange={(event) => setBrowserId(event.target.value)}
            >
              <option value="default">系统默认浏览器</option>
              {browsers.map((browser) => (
                <option key={browser.id} value={browser.id}>
                  {browser.name}
                </option>
              ))}
            </select>
            <ChevronDown size={15} className="select-wrap__chevron" aria-hidden="true" />
          </span>
          <span className="field__hint">
            {browsersLoading
              ? '正在查找本机已安装的浏览器…'
              : browsers.length > 0
                ? `已找到 ${browsers.length} 个可用浏览器，也可以交给系统决定。`
                : '暂未找到其他浏览器，将使用系统默认浏览器。'}
          </span>
        </label>

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </Modal>
  )
}
