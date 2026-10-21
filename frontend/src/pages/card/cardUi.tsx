import type { Dayjs } from "dayjs"
import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react"
import { Modal } from "../../components/ui/Modal"
import { icons, Svg } from "./pictograms"

// --- поля ввода и кнопки в стиле исходной системы ---------------------------------------------------

type AnesInputProps = InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string; adornment?: ReactNode }

export function AnesInput({ label, error, adornment, className = "", ...rest }: AnesInputProps) {
  const id = useId()
  return (
    <div className={className}>
      {label && <label htmlFor={id} className="anes-label">{label}</label>}
      <div className="relative">
        <input id={id} aria-invalid={Boolean(error)} className={`anes-input ${error ? "invalid" : ""} ${adornment ? "pr-10" : ""}`} {...rest} />
        {adornment && <span className="anes-adornment">{adornment}</span>}
      </div>
      {error && <p role="alert" className="anes-error">{error}</p>}
    </div>
  )
}

type AnesSelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string
  error?: string
  placeholder?: string
  options: Array<{ value: string | number; label: string }>
}

export function AnesSelect({ label, error, placeholder = "Выберите", options, className = "", ...rest }: AnesSelectProps) {
  const id = useId()
  return (
    <div className={className}>
      {label && <label htmlFor={id} className="anes-label">{label}</label>}
      <select id={id} aria-invalid={Boolean(error)} className={`anes-input ${error ? "invalid" : ""}`} {...rest}>
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {error && <p role="alert" className="anes-error">{error}</p>}
    </div>
  )
}

export function AnesButton({ kind = "primary", icon, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: "primary" | "secondary"; icon?: ReactNode }) {
  return (
    <button type="button" className={`anes-btn ${kind}`} {...rest}>
      {icon}
      {children}
    </button>
  )
}

/** Модальное окно «Внимание» с одной кнопкой ОК (сообщения валидации таблиц). */
export function NoticeModal({ message, onClose }: { message: string | null; onClose: () => void }) {
  return (
    <Modal open={message !== null} title="Внимание" onClose={onClose} footer={<AnesButton onClick={onClose}>ОК</AnesButton>}>
      <p className="text-center text-sm text-[#5068a5]">{message}</p>
    </Modal>
  )
}

export function ConfirmModal({ open, title = "Внимание", message, onYes, onNo, yes = "Да", no = "Нет" }: {
  open: boolean; title?: string; message: ReactNode; onYes: () => void; onNo: () => void; yes?: string; no?: string
}) {
  return (
    <Modal open={open} title={title} onClose={onNo}
           footer={<><AnesButton onClick={onYes}>{yes}</AnesButton><AnesButton kind="secondary" onClick={onNo}>{no}</AnesButton></>}>
      <div className="text-sm text-[#5068a5]">{message}</div>
    </Modal>
  )
}

// --- аккордеон: общий компонент приложения ------------------------------------------------------------

export { Accordion } from "../../components/ui/Accordion"

// --- переключатель интервала ячеек 05 / 10 / 15 -------------------------------------------------------

export interface GridContext {
  /** Ячейки времени; null — дата и время поступления не заданы. */
  cells: Dayjs[] | null
  interval: number
  setInterval: (value: number) => void
  /** Причина, по которой ячейки не сгенерированы. */
  conditionMessage: string
}

export function IntervalControl({ grid }: { grid: GridContext }) {
  const disabled = grid.cells === null
  return (
    <div className="anes-interval">
      <button type="button" aria-label="Уменьшить интервал" title={!disabled && grid.interval !== 5 ? "Уменьшить интервал" : ""}
              disabled={disabled || grid.interval === 5} onClick={() => grid.setInterval(grid.interval - 5)}>
        <Svg src={icons.decrement} />
      </button>
      <span data-testid="intervalCounter">{String(grid.interval).padStart(2, "0")}</span>
      <button type="button" aria-label="Увеличить интервал" title={!disabled && grid.interval !== 15 ? "Увеличить интервал" : ""}
              disabled={disabled || grid.interval === 15} onClick={() => grid.setInterval(grid.interval + 5)}>
        <Svg src={icons.increment} />
      </button>
    </div>
  )
}

// --- три связанные таблицы: подписи строк, ячейки времени, итог ----------------------------------------

const PLACEHOLDER_CELLS = Array.from({ length: 11 }, () => "-")

export interface GridRow {
  key: string
  label: ReactNode
  active?: boolean
  className?: string
  /** Содержимое ячейки времени. */
  cell: (time: Dayjs, index: number) => ReactNode
  cellProps?: (time: Dayjs) => { className?: string; onClick?: () => void; onDoubleClick?: () => void; title?: string; "data-testid"?: string }
  total?: ReactNode
  totalBlocked?: boolean
}

interface GridTablesProps {
  grid: GridContext
  corner: string
  rows: GridRow[]
  totalTitle?: string
  /** Последняя строка «Добавить …». */
  addRow?: { label: string; onAdd: () => void; testId?: string }
  /** Щелчок по ячейке, когда время поступления не задано. */
  onUndefinedCell?: () => void
}

export function GridTables({ grid, corner, rows, totalTitle = "", addRow, onUndefinedCell }: GridTablesProps) {
  const cells = grid.cells
  return (
    <div className="anes-tables">
      <div className="left">
        <table>
          <thead>
            <tr>
              <th>
                <div className="flex items-center justify-between">
                  <span>{corner}</span>
                  <IntervalControl grid={grid} />
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className={row.className}>
                <td>
                  <div className={`anes-cell-inner ${row.active ? "active" : ""}`}>{typeof row.label === "string" ? <span title={row.label}>{row.label}</span> : row.label}</div>
                </td>
              </tr>
            ))}
            {addRow && (
              <tr>
                <td>
                  <div className="anes-cell-inner">
                    <span>{addRow.label}</span>
                    <button type="button" className="anes-add" aria-label={addRow.label} data-testid={addRow.testId} onClick={addRow.onAdd}>
                      <Svg src={icons.add} />
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              {cells ? cells.map((cell) => <th key={cell.valueOf()}>{cell.format("HH:mm")}</th>) : PLACEHOLDER_CELLS.map((p, i) => <th key={i}>{p}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className={row.className}>
                {cells
                  ? cells.map((cell, index) => {
                      const props = row.cellProps?.(cell) ?? {}
                      return <td key={cell.valueOf()} {...props}>{row.cell(cell, index)}</td>
                    })
                  : PLACEHOLDER_CELLS.map((p, i) => <td key={i} className="clickable" onClick={onUndefinedCell}>{p}</td>)}
              </tr>
            ))}
            {addRow && (
              <tr>
                {cells
                  ? cells.map((cell) => <td key={cell.valueOf()} className="clickable" onClick={addRow.onAdd}>-</td>)
                  : PLACEHOLDER_CELLS.map((p, i) => <td key={i} className="clickable" onClick={onUndefinedCell}>{p}</td>)}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="right">
        <table>
          <thead>
            <tr><th>{totalTitle}</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className={row.className}>
                <td className={row.totalBlocked ? "blocked" : ""} title={typeof row.total === "string" ? row.total : undefined}>{row.total}</td>
              </tr>
            ))}
            {addRow && (
              <tr><td className={rows[0]?.totalBlocked || !totalTitle ? "blocked" : ""}>{totalTitle ? "-" : ""}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Пиктограмма в ячейке с всплывающей подсказкой. */
export function CellIcon({ svg, title, className = "" }: { svg: string; title?: string; className?: string }) {
  return <Svg src={svg} title={title} className={`anes-cell-icon ${className}`} />
}
