import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden="true" />;
}

export function TableSkeleton({
  rows = 5,
  columns = 5,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="divide-y divide-ink-100" aria-busy="true" aria-label="Loading data">
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="flex items-center gap-4 px-5 py-4">
          {Array.from({ length: columns }).map((__, column) => (
            <Skeleton
              key={column}
              className={cn(
                "h-4",
                column === 0 ? "w-1/3" : "flex-1",
                column === columns - 1 && "max-w-24",
              )}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
