import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

function pageWindow(page: number, pages: number): Array<number | "ellipsis"> {
  if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1);
  const visible = new Set([1, pages, page - 1, page, page + 1]);
  const sorted = [...visible]
    .filter((value) => value >= 1 && value <= pages)
    .sort((a, b) => a - b);
  const result: Array<number | "ellipsis"> = [];
  sorted.forEach((value, index) => {
    const previous = sorted[index - 1];
    if (previous !== undefined && value - previous > 1) result.push("ellipsis");
    result.push(value);
  });
  return result;
}

export function Pagination({
  page,
  pages,
  total,
  pageSize,
  onPageChange,
  className,
}: {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  if (pages <= 1) {
    return (
      <div className={cn("text-xs text-ink-500", className)}>
        {total} {total === 1 ? "result" : "results"}
      </div>
    );
  }

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 text-xs text-ink-500",
        className,
      )}
    >
      <span>
        Showing <strong className="font-semibold text-ink-700">{from}–{to}</strong> of{" "}
        <strong className="font-semibold text-ink-700">{total}</strong>
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="inline-flex size-8 items-center justify-center rounded-lg border border-ink-200 bg-white text-ink-600 transition hover:bg-ink-50 disabled:pointer-events-none disabled:opacity-40"
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" />
        </button>
        {pageWindow(page, pages).map((item, index) =>
          item === "ellipsis" ? (
            <span key={`ellipsis-${index}`} className="px-1.5 text-ink-400">
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => onPageChange(item)}
              aria-current={item === page ? "page" : undefined}
              className={cn(
                "inline-flex size-8 items-center justify-center rounded-lg border text-xs font-medium transition",
                item === page
                  ? "border-brand-600 bg-brand-600 text-white shadow-sm"
                  : "border-ink-200 bg-white text-ink-600 hover:bg-ink-50",
              )}
            >
              {item}
            </button>
          ),
        )}
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pages}
          className="inline-flex size-8 items-center justify-center rounded-lg border border-ink-200 bg-white text-ink-600 transition hover:bg-ink-50 disabled:pointer-events-none disabled:opacity-40"
          aria-label="Next page"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}
