export class GameState {
    constructor() {
        this.workers = new Map();
        this.events = [];
        this.selected = new Set();
        this.startedAt = Date.now();
        this.scout = [
            'No threats detected.',
            'Demo mode is generating worker activity.',
        ];
        this.stats = {
            completed: 0,
            files: 0,
            failed: 0,
            tokens: 0,
        };
        this.listeners = new Set();
    }
    bumpCompleted(n) {
        this.stats.completed += n;
        this.notify();
    }
    bumpFiles(n) {
        this.stats.files += n;
        this.notify();
    }
    bumpFailed(n) {
        this.stats.failed += n;
        this.notify();
    }
    pushScoutLine(line) {
        // newest first
        this.scout = [line, ...this.scout].slice(0, 3);
        this.notify();
    }
    subscribe(fn) {
        this.listeners.add(fn);
        fn(this);
        return () => this.listeners.delete(fn);
    }
    notify() {
        for (const fn of this.listeners)
            fn(this);
    }
    pushEvent(evt) {
        const withTimestamp = {
            ...evt,
            timestamp: evt.timestamp ?? Date.now(),
        };
        this.events.unshift(withTimestamp);
        if (this.events.length > 250)
            this.events.length = 250;
        this.notify();
    }
    upsertWorker(worker) {
        this.workers.set(worker.id, worker);
        this.notify();
    }
    removeWorker(workerId) {
        this.workers.delete(workerId);
        this.selected.delete(workerId);
        this.notify();
    }
    setSelected(ids) {
        this.selected = new Set(ids);
        this.notify();
    }
    getSelectedWorkers() {
        const out = [];
        for (const id of this.selected) {
            const w = this.workers.get(id);
            if (w)
                out.push(w);
        }
        return out;
    }
    getIdleOrBlocked() {
        const out = [];
        for (const w of this.workers.values()) {
            if (w.status === 'idle' || w.status === 'blocked')
                out.push(w);
        }
        return out;
    }
    tickStats() {
        // aggregate tokens from worker objects
        let tokens = 0;
        for (const w of this.workers.values())
            tokens += w.tokensUsed;
        this.stats.tokens = tokens;
    }
    getSessionDurationMs() {
        return Date.now() - this.startedAt;
    }
}
export function formatDuration(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
