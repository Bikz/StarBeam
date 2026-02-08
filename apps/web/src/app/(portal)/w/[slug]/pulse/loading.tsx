const CARD_ITEMS = Array.from({ length: 3 }, (_, idx) => `card-${idx}`);

export default function Loading() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr] lg:items-start">
      <section className="sb-card p-7">
        <div>
          <div className="sb-skeleton h-6 w-44 rounded-lg" />
          <div className="mt-2 sb-skeleton h-4 w-72 max-w-full rounded-lg" />
        </div>

        <div className="mt-6 grid gap-3">
          {CARD_ITEMS.map((key) => (
            <div key={key} className="sb-card-inset p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="sb-skeleton h-5 w-3/4 rounded-lg" />
                  <div className="mt-2 sb-skeleton h-4 w-40 rounded-lg" />
                </div>
                <div className="sb-skeleton h-9 w-24 rounded-full" />
              </div>
              <div className="mt-4 grid gap-2">
                <div className="sb-skeleton h-4 w-full rounded-lg" />
                <div className="sb-skeleton h-4 w-11/12 rounded-lg" />
                <div className="sb-skeleton h-4 w-5/6 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </section>

      <aside className="sb-card p-7">
        <div className="sb-skeleton h-6 w-32 rounded-lg" />
        <div className="mt-4 grid gap-3">
          <div className="sb-skeleton h-4 w-full rounded-lg" />
          <div className="sb-skeleton h-4 w-11/12 rounded-lg" />
          <div className="sb-skeleton h-4 w-5/6 rounded-lg" />
        </div>
      </aside>
    </div>
  );
}
