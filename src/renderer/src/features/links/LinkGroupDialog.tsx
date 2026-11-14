import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Folder } from 'lucide-react'
import type { QuickLinkGroup } from '@shared/types'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'

interface LinkGroupDialogProps {
  open: boolean
  /** The group being renamed, or `null` when creating a new one. */
  group: QuickLinkGroup | null
  /** Names already in use, excluding the group being renamed. */
  existingNames: readonly string[]
  onSave: (name: string) => void
  onClose: () => void
}

const MAX_NAME_LENGTH = 60

export function LinkGroupDialog({
  open,
  group,
  existingNames,
  onSave,
  onClose
}: LinkGroupDialogProps): React.JSX.Element {
  const formId = useId()
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setName(group?.name ?? '')
    setError('')
  }, [open, group])

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const clean = name.trim()
    if (!clean) {
      setError('请为分组取一个名字。')
      inputRef.current?.focus()
      return
    }
    const normalized = clean.toLocaleLowerCase()
    if (existingNames.some((existing) => existing.trim().toLocaleLowerCase() === normalized)) {
      setError('已经有同名分组了，换一个名字试试。')
      inputRef.current?.focus()
      return
    }
    onSave(clean.slice(0, MAX_NAME_LENGTH))
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={group ? '重命名分组' : '新建分组'}
      description={
        group ? '换一个更容易辨认的名字。' : '把同一类的快捷链接收在一起，页面会更清爽。'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" form={formId} variant="primary">
            {group ? '保存名称' : '创建分组'}
          </Button>
        </>
      }
    >
      <form id={formId} className="form-stack" onSubmit={handleSubmit}>
        <label className="field">
          <span className="field__label">分组名称</span>
          <span className="select-wrap">
            <Folder size={15} className="select-wrap__icon" aria-hidden="true" />
            <input
              ref={inputRef}
              className="field__input field__input--with-icon"
              value={name}
              maxLength={MAX_NAME_LENGTH}
              placeholder="例如：工作、设计、每天都要看"
              data-autofocus
              onChange={(event) => {
                setName(event.target.value)
                if (error) setError('')
              }}
            />
          </span>
          <span className="field__hint">分组只改变排列方式，不会影响网页本身。</span>
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
