import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import {
  ArrowUpRight,
  Circle,
  Copy,
  Download,
  Grid3x3,
  LoaderCircle,
  Minus,
  Pencil,
  Pin,
  Redo2,
  Square,
  Type,
  Undo2,
  X
} from 'lucide-react'
import type { ScreenshotAction, ScreenshotTool } from '@shared/screenshot'
import { cn } from '../../lib/cn'

const TOOLS = [
  { id: 'rectangle', label: '矩形', shortcut: 'R', icon: Square },
  { id: 'line', label: '直线', shortcut: 'L', icon: Minus },
  { id: 'ellipse', label: '圆形', shortcut: 'E', icon: Circle },
  { id: 'pen', label: '画笔', shortcut: 'P', icon: Pencil },
  { id: 'arrow', label: '箭头', shortcut: 'A', icon: ArrowUpRight },
  { id: 'text', label: '插入文本', shortcut: 'T', icon: Type },
  { id: 'mosaic', label: '马赛克', shortcut: 'M', icon: Grid3x3 }
] as const satisfies ReadonlyArray<{ id: ScreenshotTool; label: string; shortcut: string; icon: typeof Square }>

const COLORS = [
  '#ff4d4f',
  '#ff9f0a',
  '#ffd60a',
  '#34c759',
  '#0a84ff',
  '#bf5af2',
  '#ffffff',
  '#111813'
] as const

interface ScreenshotToolbarProps {
  tool: ScreenshotTool
  color: string
  thickness: number
  fontSize: number
  mosaicBlock: number
  canUndo: boolean
  canRedo: boolean
  busy: ScreenshotAction | null
  error: string | null
  toolbarRef: RefObject<HTMLDivElement | null>
  style?: CSSProperties
  onToolChange: (tool: ScreenshotTool) => void
  onColorChange: (color: string) => void
  onThicknessChange: (thickness: number) => void
  onFontSizeChange: (fontSize: number) => void
  onMosaicBlockChange: (block: number) => void
  onUndo: () => void
  onRedo: () => void
  onAction: (action: ScreenshotAction) => void
  onCancel: () => void
}

export function ScreenshotToolbar({
  tool,
  color,
  thickness,
  fontSize,
  mosaicBlock,
  canUndo,
  canRedo,
  busy,
  error,
  toolbarRef,
  style,
  onToolChange,
  onColorChange,
  onThicknessChange,
  onFontSizeChange,
  onMosaicBlockChange,
  onUndo,
  onRedo,
  onAction,
  onCancel
}: ScreenshotToolbarProps): React.JSX.Element {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const paletteRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setPaletteOpen(false)
  }, [tool])

  useEffect(() => {
    if (!paletteOpen) return
    const handlePointerDown = (event: PointerEvent): void => {
      const target = event.target
      if (target instanceof Node && paletteRef.current?.contains(target)) return
      setPaletteOpen(false)
    }
    window.addEventListener('pointerdown', handlePointerDown, true)
    return () => window.removeEventListener('pointerdown', handlePointerDown, true)
  }, [paletteOpen])

  const disabled = busy !== null
  const showColor = tool !== 'mosaic'
  const showThickness = tool !== 'mosaic' && tool !== 'text'
  const showFontSize = tool === 'text'
  const showMosaicBlock = tool === 'mosaic'

  return (
    <div
      ref={toolbarRef}
      className="shot-toolbar shot-ui"
      style={style}
      role="toolbar"
      aria-label="截图标注工具"
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
    >
      <div className="shot-toolbar__tools">
        {TOOLS.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              className={cn('shot-tool', tool === item.id && 'is-active')}
              title={`${item.label}（${item.shortcut}）`}
              aria-label={item.label}
              aria-pressed={tool === item.id}
              disabled={disabled}
              onClick={() => onToolChange(item.id)}
            >
              <Icon size={15} strokeWidth={1.9} />
            </button>
          )
        })}
      </div>

      <span className="shot-divider" aria-hidden="true" />

      <div className="shot-toolbar__history">
        <button
          type="button"
          className="shot-tool"
          title="撤销（Ctrl+Z）"
          aria-label="撤销"
          disabled={disabled || !canUndo}
          onClick={onUndo}
        >
          <Undo2 size={15} strokeWidth={1.9} />
        </button>
        <button
          type="button"
          className="shot-tool"
          title="重做（Ctrl+Shift+Z）"
          aria-label="重做"
          disabled={disabled || !canRedo}
          onClick={onRedo}
        >
          <Redo2 size={15} strokeWidth={1.9} />
        </button>
      </div>

      <span className="shot-divider" aria-hidden="true" />

      <div className="shot-toolbar__options">
        {showColor ? (
          <div className="shot-color" ref={paletteRef}>
            <button
              type="button"
              className="shot-color__swatch"
              style={{ background: color }}
              title="标注颜色"
              aria-label="标注颜色"
              aria-expanded={paletteOpen}
              disabled={disabled}
              onClick={() => setPaletteOpen((open) => !open)}
            />
            {paletteOpen ? (
              <div className="shot-palette" role="group" aria-label="选择颜色">
                {COLORS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={cn('shot-palette__color', item === color && 'is-active')}
                    style={{ background: item }}
                    title={item}
                    aria-label={item}
                    onClick={() => {
                      onColorChange(item)
                      setPaletteOpen(false)
                    }}
                  />
                ))}
                <label className="shot-palette__custom" title="自定义颜色">
                  <input
                    type="color"
                    value={color}
                    aria-label="自定义颜色"
                    onChange={(event) => onColorChange(event.target.value)}
                  />
                  <span>+</span>
                </label>
              </div>
            ) : null}
          </div>
        ) : null}

        {showThickness ? (
          <label className="shot-range" title="线条粗细">
            <span className="shot-range__label">粗细</span>
            <input
              type="range"
              min={1}
              max={12}
              step={1}
              value={thickness}
              disabled={disabled}
              aria-label="线条粗细"
              onChange={(event) => onThicknessChange(Number(event.target.value))}
            />
            <span className="shot-range__value">{thickness}</span>
          </label>
        ) : null}

        {showFontSize ? (
          <label className="shot-range" title="字体大小">
            <span className="shot-range__label">字号</span>
            <input
              type="range"
              min={12}
              max={48}
              step={1}
              value={fontSize}
              disabled={disabled}
              aria-label="字体大小"
              onChange={(event) => onFontSizeChange(Number(event.target.value))}
            />
            <span className="shot-range__value">{fontSize}</span>
          </label>
        ) : null}

        {showMosaicBlock ? (
          <label className="shot-range" title="马赛克颗粒大小">
            <span className="shot-range__label">程度</span>
            <input
              type="range"
              min={4}
              max={32}
              step={2}
              value={mosaicBlock}
              disabled={disabled}
              aria-label="马赛克程度"
              onChange={(event) => onMosaicBlockChange(Number(event.target.value))}
            />
            <span className="shot-range__value">{mosaicBlock}</span>
          </label>
        ) : null}
      </div>

      <span className="shot-divider" aria-hidden="true" />

      <div className="shot-toolbar__actions">
        <button
          type="button"
          className="shot-action shot-action--primary"
          title="复制到剪贴板"
          disabled={disabled}
          onClick={() => onAction('copy')}
        >
          {busy === 'copy' ? (
            <LoaderCircle size={15} className="spin" />
          ) : (
            <Copy size={15} strokeWidth={1.9} />
          )}
          <span>复制</span>
        </button>
        <button
          type="button"
          className="shot-action"
          title="钉住"
          disabled={disabled}
          onClick={() => onAction('pin')}
        >
          {busy === 'pin' ? (
            <LoaderCircle size={15} className="spin" />
          ) : (
            <Pin size={15} strokeWidth={1.9} />
          )}
          <span>钉住</span>
        </button>
        <button
          type="button"
          className="shot-action"
          title="保存到本地"
          disabled={disabled}
          onClick={() => onAction('save')}
        >
          {busy === 'save' ? (
            <LoaderCircle size={15} className="spin" />
          ) : (
            <Download size={15} strokeWidth={1.9} />
          )}
          <span>保存</span>
        </button>
        <button
          type="button"
          className="shot-action shot-action--close"
          title="取消（Esc）"
          aria-label="取消截图"
          disabled={disabled}
          onClick={onCancel}
        >
          <X size={16} strokeWidth={2} />
        </button>
      </div>

      {error ? (
        <div className="shot-toolbar__error" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  )
}
