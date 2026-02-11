const LEFT_CARDS = Array.from({ length: 3 }, (_, idx) => `left-${idx}`);
const CONNECTION_ROWS = Array.from({ length: 2 }, (_, idx) => `conn-${idx}`);
const RIGHT_CARDS = Array.from({ length: 1 }, (_, idx) => `right-${idx}`);

export default function Loading() {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="grid gap-6">
        {LEFT_CARDS.map((key) => (
          <div key={key} className="sb-card p-7">
            <div className="sb-skeleton h-6 w-64 max-w-full rounded-lg" />
            <div className="mt-2 sb-skeleton h-4 w-full rounded-lg" />
            <div className="mt-2 sb-skeleton h-4 w-11/12 rounded-lg" />
            <div className="mt-6 sb-skeleton h-11 w-44 rounded-full" />
            <div className="mt-7">
              <div className="sb-skeleton h-3 w-28 rounded-lg" />
              <div className="mt-3 grid gap-2">
                {CONNECTION_ROWS.map((rowKey) => (
                  <div
                    key={rowKey}
                    className="sb-skeleton h-12 w-full rounded-xl"
                  />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid content-start gap-6">
        {RIGHT_CARDS.map((key) => (
          <div key={key} className="sb-card p-6 sm:p-7">
            <div className="sb-skeleton h-5 w-28 rounded-lg" />
            <div className="mt-4 grid gap-4">
              <div className="sb-card-inset p-4">
                <div className="sb-skeleton h-3 w-20 rounded-lg" />
                <div className="mt-3 grid gap-2">
                  <div className="sb-skeleton h-4 w-full rounded-lg" />
                  <div className="sb-skeleton h-4 w-5/6 rounded-lg" />
                </div>
              </div>
              <div className="sb-card-inset p-4">
                <div className="sb-skeleton h-3 w-16 rounded-lg" />
                <div className="mt-3 grid gap-2">
                  <div className="sb-skeleton h-4 w-full rounded-lg" />
                  <div className="sb-skeleton h-4 w-3/4 rounded-lg" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
