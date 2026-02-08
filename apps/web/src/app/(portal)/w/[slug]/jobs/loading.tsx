const RUN_ROWS = Array.from({ length: 4 }, (_, idx) => `run-${idx}`);

export default function Loading() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="sb-card p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="sb-skeleton h-6 w-44 rounded-lg" />
            <div className="mt-2 sb-skeleton h-4 w-full rounded-lg" />
            <div className="mt-2 sb-skeleton h-4 w-11/12 rounded-lg" />
          </div>
          <div className="sb-skeleton h-6 w-20 rounded-full" />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div className="sb-skeleton h-11 w-28 rounded-full" />
          <div className="sb-skeleton h-4 w-52 rounded-lg" />
        </div>

        <div className="mt-7">
          <div className="sb-skeleton h-3 w-28 rounded-lg" />
          <div className="mt-3 grid gap-2">
            {RUN_ROWS.map((key) => (
              <div key={key} className="sb-card-inset px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="sb-skeleton h-4 w-28 rounded-lg" />
                  <div className="sb-skeleton h-6 w-32 rounded-full" />
                </div>
                <div className="mt-2 sb-skeleton h-3 w-2/3 rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="sb-card p-7">
        <div className="sb-skeleton h-6 w-44 rounded-lg" />
        <div className="mt-3 grid gap-3">
          <div className="sb-skeleton h-4 w-full rounded-lg" />
          <div className="sb-skeleton h-4 w-11/12 rounded-lg" />
          <div className="sb-skeleton h-4 w-5/6 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
