const SECTION_ITEMS = Array.from({ length: 4 }, (_, idx) => `section-${idx}`);

export default function Loading() {
  return (
    <div className="grid gap-6">
      {SECTION_ITEMS.map((key) => (
        <section key={key} className="sb-card p-7">
          <div className="sb-skeleton h-6 w-40 rounded-xl" />
          <div className="mt-3 sb-skeleton h-4 w-96 max-w-full rounded-lg" />
          <div className="mt-6 grid gap-3">
            <div className="sb-skeleton h-20 w-full rounded-2xl" />
            <div className="sb-skeleton h-20 w-full rounded-2xl" />
          </div>
        </section>
      ))}
    </div>
  );
}
