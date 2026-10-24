function parseTime(value) {
    const t = Date.parse(value);
    return Number.isNaN(t) ? 0 : t;
}

// Curate the N most recent items, round-robin across sources so one
// source can't fill the whole quota with its freshest burst.
export function takeNewestBySource(items, limit = 6) {
    const sorted = [...items].sort((a, b) => parseTime(b.published_at) - parseTime(a.published_at));
    const bySource = new Map();
    for (const item of sorted) {
        const queue = bySource.get(item.source_name) || [];
        queue.push(item);
        bySource.set(item.source_name, queue);
    }

    const out = [];
    const queues = [...bySource.values()];
    while (out.length < limit && queues.some(q => q.length > 0)) {
        for (const queue of queues) {
            if (queue.length > 0 && out.length < limit) out.push(queue.shift());
        }
    }
    return out.sort((a, b) => parseTime(b.published_at) - parseTime(a.published_at));
}

export { parseTime };
