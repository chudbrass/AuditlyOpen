type SkeletonProps = { className?: string };

export function Skeleton({ className = "" }: SkeletonProps) {
  return <div aria-hidden="true" className={`animate-pulse rounded-md bg-slate-200 ${className}`} />;
}

export function PageSkeleton({ variant = "table" }: { variant?: "dashboard" | "table" | "detail" | "form" | "cards" }) {
  if (variant === "dashboard") {
    return (
      <div className="mx-auto max-w-[1600px] px-4 py-4 sm:px-6 lg:px-6 lg:py-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 min-[1400px]:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-52" />)}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-12">
          <Skeleton className="h-72 xl:col-span-6" /><Skeleton className="h-72 xl:col-span-2" />
          <Skeleton className="h-72 xl:col-span-2" /><Skeleton className="h-72 xl:col-span-2" />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-12">
          <Skeleton className="h-64 xl:col-span-7" /><Skeleton className="h-64 xl:col-span-3" /><Skeleton className="h-64 xl:col-span-2" />
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
      <Skeleton className="h-8 w-52" />
      <Skeleton className="mt-2 h-4 w-full max-w-md" />
      {variant === "cards" && (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-48" />)}
        </div>
      )}
      {variant === "form" && <Skeleton className="mt-6 h-[34rem] w-full max-w-4xl" />}
      {variant === "detail" && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-6">
            {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3"><Skeleton className="h-72 xl:col-span-2" /><Skeleton className="h-72" /></div>
          <Skeleton className="mt-4 h-72" />
        </>
      )}
      {variant === "table" && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-20" />)}
          </div>
          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
            <Skeleton className="h-10 w-full" />
            {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="mt-3 h-12 w-full" />)}
          </div>
        </>
      )}
    </div>
  );
}
