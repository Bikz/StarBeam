const TRACK_ITEMS = Array.from({ length: 6 }, (_, idx) => `track-${idx}`);
const GOAL_ITEMS = Array.from({ length: 3 }, (_, idx) => `goal-${idx}`);

export default function Loading() {
  return (
    <div className="grid gap-6 lg:grid-cols-[0.42fr_0.58fr]">
      <div className="sb-card p-6">
        <div>
          <div className="sb-skeleton h-5 w-28 rounded-lg" />
          <div className="mt-2 sb-skeleton h-3 w-20 rounded-lg" />
        </div>

        <div className="mt-4 grid gap-2">
          {TRACK_ITEMS.map((key) => (
            <div key={key} className="sb-skeleton h-12 w-full rounded-xl" />
          ))}
        </div>

        <div className="mt-6">
          <div className="sb-skeleton h-3 w-24 rounded-lg" />
          <div className="mt-2 sb-skeleton h-10 w-full rounded-xl" />
          <div className="mt-2 sb-skeleton h-10 w-full rounded-full" />
        </div>
      </div>

      <div className="sb-card p-7">
        <div>
          <div className="sb-skeleton h-6 w-2/3 rounded-lg" />
          <div className="mt-2 sb-skeleton h-3 w-32 rounded-lg" />
        </div>

        <div className="mt-6 grid gap-3">
          {GOAL_ITEMS.map((key) => (
            <div key={key} className="sb-card-inset p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="sb-skeleton h-5 w-4/5 rounded-lg" />
                  <div className="mt-2 sb-skeleton h-4 w-2/5 rounded-lg" />
                </div>
                <div className="sb-skeleton h-9 w-28 rounded-full" />
              </div>
              <div className="mt-4 grid gap-2">
                <div className="sb-skeleton h-4 w-full rounded-lg" />
                <div className="sb-skeleton h-4 w-11/12 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
