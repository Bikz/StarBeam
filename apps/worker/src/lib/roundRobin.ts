export type WorkspaceUserPair = { workspaceId: string; userId: string };

function pairKey(p: WorkspaceUserPair): string {
  return `${p.workspaceId}:${p.userId}`;
}

export function selectPairsRoundRobin(args: {
  lists: WorkspaceUserPair[][];
  limit: number;
}): WorkspaceUserPair[] {
  const out: WorkspaceUserPair[] = [];
  const seen = new Set<string>();
  const cursors = args.lists.map(() => 0);

  // Pick one pair from each list per round, skipping duplicates. This prevents
  // a single connector type from starving others when batch is capped.
  while (out.length < args.limit) {
    let progressed = false;

    for (let i = 0; i < args.lists.length && out.length < args.limit; i += 1) {
      const list = args.lists[i] ?? [];
      let cursor = cursors[i] ?? 0;

      while (cursor < list.length && out.length < args.limit) {
        const p = list[cursor];
        cursor += 1;
        if (!p) continue;
        const key = pairKey(p);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(p);
        progressed = true;
        break;
      }

      cursors[i] = cursor;
    }

    if (!progressed) break;
  }

  return out;
}
