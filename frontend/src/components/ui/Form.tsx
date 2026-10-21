import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react"

const CONTROL =
  "block w-full rounded-lg border bg-app-input px-2.5 py-1.5 text-[15px] font-medium text-slate-700 placeholder:text-[13px] placeholder:font-normal placeholder:text-slate-400 " +
  "focus:border-slate-700 focus:outline-none disabled:cursor-not-allowed disabled:text-slate-400"

const border = (error?: string) => (error ? "border-red-500" : "border-slate-200")

interface FieldProps {
  label?: ReactNode
  error?: string
  hint?: string
  required?: boolean
  className?: string
  children: (id: string) => ReactNode
}

/** Обёртка поля: подпись, сообщение об ошибке, подсказка. */
export function Field({ label, error, hint, required, className = "", children }: FieldProps) {
  const id = useId()
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="mb-2 block text-[11px] font-medium leading-[13px] text-slate-700/60">
          {label}
          {required && <span className="text-red-500"> *</span>}
        </label>
      )}
      {children(id)}
      {error ? (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      ) : (
        hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>
      )}
    </div>
  )
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode; error?: string; hint?: string; wrapperClassName?: string }

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, required, wrapperClassName, className = "", ...rest },
  ref,
) {
  return (
    <Field label={label} error={error} hint={hint} required={required} className={wrapperClassName}>
      {(id) => (
        <input
          id={id}
          ref={ref}
          required={required}
          aria-invalid={Boolean(error)}
          className={`${CONTROL} ${border(error)} ${className}`}
          {...rest}
        />
      )}
    </Field>
  )
})

export interface Option {
  value: string | number
  label: string
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: ReactNode
  error?: string
  options: Option[]
  placeholder?: string
  wrapperClassName?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, options, placeholder, required, wrapperClassName, className = "", ...rest },
  ref,
) {
  return (
    <Field label={label} error={error} required={required} className={wrapperClassName}>
      {(id) => (
        <select
          id={id}
          ref={ref}
          required={required}
          aria-invalid={Boolean(error)}
          className={`${CONTROL} ${border(error)} ${className}`}
          {...rest}
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  )
})

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: ReactNode; error?: string; wrapperClassName?: string }

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, required, wrapperClassName, className = "", rows = 3, ...rest },
  ref,
) {
  return (
    <Field label={label} error={error} required={required} className={wrapperClassName}>
      {(id) => (
        <textarea
          id={id}
          ref={ref}
          rows={rows}
          aria-invalid={Boolean(error)}
          className={`${CONTROL} ${border(error)} ${className}`}
          {...rest}
        />
      )}
    </Field>
  )
})

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: ReactNode }

export function Checkbox({ label, className = "", ...rest }: CheckboxProps) {
  return (
    <label className={`inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700 ${className}`}>
      <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" {...rest} />
      {label}
    </label>
  )
}
