import {
  Children,
  forwardRef,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <label className="label" htmlFor={htmlFor}>
        {label}
        {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
      </label>
      {children}
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="hint">{hint}</p>
      ) : null}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, ...props }, ref) => (
    <input
      ref={ref}
      className={cn("input", invalid && "border-rose-300 focus:border-rose-500", className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  ),
);
Input.displayName = "Input";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid, rows = 4, ...props }, ref) => (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        "input min-h-24 resize-y leading-relaxed",
        invalid && "border-rose-300 focus:border-rose-500",
        className,
      )}
      aria-invalid={invalid || undefined}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      className,
      invalid,
      children,
      multiple = false,
      id,
      value,
      defaultValue,
      disabled,
      required,
      ...props
    },
    forwardedRef,
  ) => {
    const nativeRef = useRef<HTMLSelectElement | null>(null);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const [open, setOpen] = useState(false);
    const normalizeValue = (item: string | number | readonly string[] | undefined) =>
      item === undefined
        ? multiple
          ? []
          : ""
        : Array.isArray(item)
          ? item.map(String)
          : String(item);
    const [uncontrolledValue, setUncontrolledValue] = useState<string | string[]>(
      normalizeValue(defaultValue),
    );
    const options = Children.toArray(children).flatMap((child) => {
      if (
        !isValidElement<{
          value?: string | number;
          disabled?: boolean;
          children?: ReactNode;
        }>(child)
      ) {
        return [];
      }
      return [
        {
          value: String(child.props.value ?? ""),
          label: child.props.children,
          disabled: Boolean(child.props.disabled),
        },
      ];
    });
    const selectedValue =
      value === undefined ? uncontrolledValue : normalizeValue(value);
    const selectedValues = multiple
      ? Array.isArray(selectedValue)
        ? selectedValue.map(String)
        : selectedValue
          ? [String(selectedValue)]
          : []
      : [
          String(
            Array.isArray(selectedValue)
              ? selectedValue[0] ?? ""
              : selectedValue,
          ),
        ];
    const selectedOptions = options.filter((option) =>
      selectedValues.includes(option.value),
    );
    const displayedValue = multiple
      ? selectedOptions.map((option) => option.label).join(", ") ||
        "Select options"
      : selectedOptions[0]?.label ?? "Select an option";

    useEffect(() => {
      if (typeof forwardedRef === "function") {
        forwardedRef(nativeRef.current);
      } else if (forwardedRef) {
        forwardedRef.current = nativeRef.current;
      }
    }, [forwardedRef]);

    useEffect(() => {
      const nativeSelect = nativeRef.current;
      if (!nativeSelect) return;
      if (value !== undefined) {
        for (const option of Array.from(nativeSelect.options)) {
          option.selected = selectedValues.includes(option.value);
        }
        return;
      }
      const nativeValues = Array.from(nativeSelect.selectedOptions).map(
        (option) => option.value,
      );
      const localValues = Array.isArray(uncontrolledValue)
        ? uncontrolledValue
        : uncontrolledValue
          ? [uncontrolledValue]
          : [];
      if (nativeValues.join("\u0000") !== localValues.join("\u0000")) {
        setUncontrolledValue(multiple ? nativeValues : nativeValues[0] ?? "");
      }
    });

    const changeSelection = (optionValue: string) => {
      const next = multiple
        ? selectedValues.includes(optionValue)
          ? selectedValues.filter((item) => item !== optionValue)
          : [...selectedValues, optionValue]
        : optionValue;
      setUncontrolledValue(next);
      const nativeSelect = nativeRef.current;
      if (nativeSelect) {
        for (const option of Array.from(nativeSelect.options)) {
          option.selected = multiple
            ? Array.isArray(next) && next.includes(option.value)
            : option.value === next;
        }
        nativeSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
      if (!multiple) {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    return (
      <div className="relative">
        <select
          ref={nativeRef}
          multiple={multiple}
          tabIndex={-1}
          aria-hidden="true"
          className="pointer-events-none absolute size-px opacity-0"
          {...props}
        >
          {children}
        </select>
        <button
          ref={triggerRef}
          id={id}
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          aria-required={required || undefined}
          aria-label={props["aria-label"]}
          aria-labelledby={props["aria-labelledby"]}
          className={cn(
            "input flex min-h-10 items-center justify-between gap-2 text-left",
            multiple && "min-h-28 items-start",
            invalid && "border-rose-300 focus:border-rose-500",
            disabled && "cursor-not-allowed bg-ink-100 text-ink-600",
            className,
          )}
          onClick={() => setOpen((current) => !current)}
          onBlur={() => {
            nativeRef.current?.dispatchEvent(
              new FocusEvent("focusout", { bubbles: true }),
            );
            window.setTimeout(() => setOpen(false), 100);
          }}
          onKeyDown={(event) => {
            if (
              event.key === "ArrowDown" ||
              event.key === "ArrowUp" ||
              event.key === "Enter" ||
              event.key === " "
            ) {
              event.preventDefault();
              setOpen(true);
            } else if (event.key === "Escape") {
              setOpen(false);
            }
          }}
        >
          <span className="truncate">{displayedValue}</span>
          <ChevronDown className="size-4 shrink-0 text-ink-500" />
        </button>
        {open && !disabled ? (
          <div
            role="listbox"
            aria-labelledby={id}
            aria-multiselectable={multiple || undefined}
            className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto border border-ink-300 bg-white py-1 text-sm text-ink-900"
            onMouseDown={(event) => event.preventDefault()}
          >
            {options.map((option) => {
              const selected = selectedValues.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  disabled={option.disabled}
                  className={cn(
                    "block w-full bg-white px-3.5 py-2 text-left text-ink-900 hover:bg-ink-950 hover:text-white focus:bg-ink-950 focus:text-white focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
                    selected && "bg-white",
                  )}
                  onClick={() => changeSelection(option.value)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  },
);
Select.displayName = "Select";
