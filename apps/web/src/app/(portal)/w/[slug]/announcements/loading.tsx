const ANNOUNCEMENT_ITEMS = Array.from({ length: 3 }, (_, idx) => `ann-${idx}`);

export default function Loading() {
  return (
    <div className="sb-card p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="sb-skeleton h-6 w-44 rounded-lg" />
          <div className="mt-2 sb-skeleton h-4 w-96 max-w-full rounded-lg" />
        </div>
        <div className="flex items-center gap-3">
          <div className="sb-skeleton h-4 w-28 rounded-lg" />
          <div className="sb-skeleton h-10 w-10 rounded-xl" />
        </div>
      </div>

      <div className="mt-6 grid gap-3">
        {ANNOUNCEMENT_ITEMS.map((key) => (
          <div key={key} className="sb-card-inset p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="sb-skeleton h-5 w-2/3 rounded-lg" />
                <div className="mt-2 sb-skeleton h-4 w-56 rounded-lg" />
              </div>
              <div className="sb-skeleton h-9 w-24 rounded-full" />
            </div>
            <div className="mt-4 grid gap-2">
              <div className="sb-skeleton h-4 w-full rounded-lg" />
              <div className="sb-skeleton h-4 w-5/6 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
