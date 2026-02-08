const MEMBER_ROWS = Array.from({ length: 6 }, (_, idx) => `member-${idx}`);
const INVITE_ROWS = Array.from({ length: 3 }, (_, idx) => `invite-${idx}`);

export default function Loading() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
      <div className="sb-card p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="sb-skeleton h-6 w-44 rounded-lg" />
          <div className="sb-skeleton h-4 w-24 rounded-lg" />
        </div>

        <div className="mt-5 grid gap-2">
          {MEMBER_ROWS.map((key) => (
            <div key={key} className="sb-card-inset px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="sb-skeleton h-4 w-2/3 rounded-lg" />
                  <div className="mt-2 sb-skeleton h-3 w-40 rounded-lg" />
                </div>
                <div className="sb-skeleton h-6 w-20 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="sb-card p-7">
        <div>
          <div className="sb-skeleton h-6 w-40 rounded-lg" />
          <div className="mt-2 sb-skeleton h-4 w-full rounded-lg" />
        </div>

        <div className="mt-6 grid gap-3">
          <div>
            <div className="sb-skeleton h-3 w-16 rounded-lg" />
            <div className="mt-2 sb-skeleton h-11 w-full rounded-xl" />
          </div>
          <div>
            <div className="sb-skeleton h-3 w-14 rounded-lg" />
            <div className="mt-2 sb-skeleton h-11 w-full rounded-xl" />
          </div>
          <div className="sb-skeleton h-11 w-full rounded-full" />

          <div className="mt-4">
            <div className="sb-skeleton h-3 w-28 rounded-lg" />
            <div className="mt-3 grid gap-2">
              {INVITE_ROWS.map((key) => (
                <div key={key} className="sb-skeleton h-12 w-full rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
