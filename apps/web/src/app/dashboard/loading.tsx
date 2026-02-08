const NAV_ITEMS = Array.from({ length: 7 }, (_, idx) => `nav-${idx}`);
const STAT_ITEMS = Array.from({ length: 2 }, (_, idx) => `stat-${idx}`);
const WORKSPACE_ITEMS = Array.from({ length: 4 }, (_, idx) => `ws-${idx}`);

export default function Loading() {
  return (
    <div className="sb-bg">
      <div className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
        <div className="flex items-start gap-6">
          <aside className="hidden lg:block shrink-0 sticky top-6 w-72">
            <div className="sb-card p-4">
              <div className="sb-skeleton h-10 w-44 rounded-xl" />
              <div className="mt-4 grid gap-2">
                {NAV_ITEMS.map((key) => (
                  <div key={key} className="sb-skeleton h-10 w-full rounded-xl" />
                ))}
              </div>
              <div className="mt-5 sb-skeleton h-10 w-full rounded-xl" />
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            <div className="sb-card px-4 py-3 sm:px-5 sm:py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="sb-skeleton h-3 w-24 rounded-lg" />
                  <div className="mt-2 sb-skeleton h-6 w-36 rounded-lg" />
                </div>
                <div className="flex items-center gap-2">
                  <div className="sb-skeleton h-10 w-28 rounded-full" />
                  <div className="hidden sm:block sb-skeleton h-4 w-40 rounded-lg" />
                </div>
              </div>
            </div>

            <main id="main" className="mt-5 min-w-0">
              <div className="grid gap-6">
                <section className="sb-card p-6 sm:p-7">
                  <div className="sb-skeleton h-7 w-32 rounded-xl" />
                  <div className="mt-3 sb-skeleton h-4 w-96 max-w-full rounded-lg" />
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {STAT_ITEMS.map((key) => (
                      <div key={key} className="sb-card-inset px-4 py-3">
                        <div className="sb-skeleton h-3 w-24 rounded-lg" />
                        <div className="mt-2 sb-skeleton h-7 w-12 rounded-lg" />
                      </div>
                    ))}
                  </div>
                </section>

                <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr] lg:items-start">
                  <section className="sb-card p-6 sm:p-7">
                    <div className="sb-skeleton h-6 w-44 rounded-xl" />
                    <div className="mt-4 grid gap-3">
                      {WORKSPACE_ITEMS.map((key) => (
                        <div key={key} className="sb-card-inset p-5">
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <div className="min-w-[220px] flex-1">
                              <div className="sb-skeleton h-5 w-64 max-w-full rounded-lg" />
                              <div className="mt-2 sb-skeleton h-4 w-40 max-w-full rounded-lg" />
                            </div>
                            <div className="sb-skeleton h-6 w-20 rounded-full" />
                          </div>
                          <div className="mt-4 flex items-center gap-3">
                            <div className="sb-skeleton h-10 w-20 rounded-full" />
                            <div className="sb-skeleton h-4 w-28 rounded-lg" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <aside className="sb-card p-6 sm:p-7">
                    <div className="sb-skeleton h-6 w-56 max-w-full rounded-xl" />
                    <div className="mt-3 sb-skeleton h-4 w-72 max-w-full rounded-lg" />
                    <div className="mt-5 grid gap-3">
                      <div>
                        <div className="sb-skeleton h-3 w-20 rounded-lg" />
                        <div className="mt-2 sb-skeleton h-11 w-full rounded-xl" />
                      </div>
                      <div className="sb-skeleton h-11 w-full rounded-full" />
                    </div>
                  </aside>
                </div>
              </div>
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
