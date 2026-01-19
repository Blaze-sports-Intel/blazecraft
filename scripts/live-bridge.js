import { REGIONS, randomPointIn } from './map.js';
const DEFAULT_POLL_INTERVAL = 15000;
const REGION_BY_LEAGUE = {
    MLB: 'src_core',
    NCAA_BASEBALL: 'config',
    NCAA_FOOTBALL: 'tests',
    NFL: 'src_ui',
    NBA: 'docs',
};
export class LiveBridge {
    constructor(state, options = {}) {
        this.running = false;
        this.timerId = null;
        this.statusCache = new Map();
        this.state = state;
        this.baseUrl = options.apiBaseUrl ?? window.location.origin;
        this.pollInterval = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL;
    }
    async connect() {
        this.running = true;
        await this.refresh();
        this.timerId = window.setInterval(() => {
            void this.refresh();
        }, this.pollInterval);
    }
    disconnect() {
        this.running = false;
        if (this.timerId !== null) {
            clearInterval(this.timerId);
            this.timerId = null;
        }
    }
    manualAssign(workerIds, region) {
        for (const workerId of workerIds) {
            const worker = this.state.workers.get(workerId);
            if (!worker)
                continue;
            worker.targetRegion = region.id;
            worker.updatedAt = Date.now();
            this.state.upsertWorker({ ...worker });
        }
        if (workerIds.length) {
            this.state.pushEvent({
                type: 'command',
                workerId: workerIds[0],
                details: `Assigned to ${region.name}.`,
                timestamp: Date.now(),
            });
        }
    }
    async refresh() {
        if (!this.running)
            return;
        try {
            const response = await fetch(`${this.baseUrl}/api/events`, {
                headers: { 'Accept': 'application/json' },
            });
            if (!response.ok) {
                throw new Error(`API returned ${response.status}`);
            }
            const payload = (await response.json());
            this.applyEvents(payload.events, payload.warnings);
        }
        catch (error) {
            this.state.pushScoutLine(`Live feed paused: ${error instanceof Error ? error.message : String(error)}.`);
        }
    }
    applyEvents(events, warnings) {
        const seenIds = new Set();
        for (const event of events) {
            const workerId = `event-${event.league}-${event.id}`;
            seenIds.add(workerId);
            const existing = this.state.workers.get(workerId);
            const worker = existing ?? this.createWorker(event, workerId);
            const status = mapStatusToWorker(event.status);
            const tokensUsed = computeTokens(event);
            const nextWorker = {
                ...worker,
                status,
                tokensUsed,
                currentTask: `${event.away.name} @ ${event.home.name}`,
                progress: event.status === 'final' ? 100 : 0,
                errorMessage: event.status === 'postponed' || event.status === 'canceled' ? 'Status update required.' : null,
                updatedAt: Date.now(),
            };
            this.state.upsertWorker(nextWorker);
            this.maybeLogStatusChange(workerId, event, status);
        }
        for (const workerId of Array.from(this.state.workers.keys())) {
            if (!workerId.startsWith('event-'))
                continue;
            if (!seenIds.has(workerId)) {
                this.state.removeWorker(workerId);
            }
        }
        const warningText = warnings.length ? `Warnings: ${warnings.join(' | ')}` : null;
        const summary = events.length
            ? `${events.length} live events synchronized.`
            : 'No live events reported.';
        this.state.pushScoutLine(warningText ? `${summary} ${warningText}` : summary);
    }
    createWorker(event, workerId) {
        const regionId = REGION_BY_LEAGUE[event.league] ?? 'townhall';
        const region = REGIONS.find((r) => r.id === regionId) ?? REGIONS[0];
        const position = positionFromSeed(workerId, region);
        return {
            id: workerId,
            name: `${event.league}`,
            status: mapStatusToWorker(event.status),
            currentTask: `${event.away.name} @ ${event.home.name}`,
            targetRegion: region.id,
            position,
            spawnedAt: Date.now(),
            tokensUsed: computeTokens(event),
            progress: event.status === 'final' ? 100 : 0,
            errorMessage: null,
            updatedAt: Date.now(),
        };
    }
    maybeLogStatusChange(workerId, event, status) {
        const previous = this.statusCache.get(workerId);
        this.statusCache.set(workerId, event.status);
        if (previous && previous === event.status)
            return;
        const detail = `${event.league}: ${event.away.name} @ ${event.home.name} is ${event.status}.`;
        this.state.pushEvent({
            type: status === 'complete' ? 'task_complete' : status === 'working' ? 'task_start' : 'status',
            workerId,
            details: detail,
            timestamp: Date.now(),
        });
    }
}
function mapStatusToWorker(status) {
    if (status === 'final')
        return 'complete';
    if (status === 'live')
        return 'working';
    if (status === 'postponed' || status === 'canceled')
        return 'blocked';
    return 'idle';
}
function computeTokens(event) {
    const scores = [event.home.score, event.away.score].filter((value) => typeof value === 'number');
    return scores.reduce((sum, value) => sum + value, 0);
}
function positionFromSeed(seed, region) {
    const hash = hashString(seed);
    const regionPoint = randomPointIn(region);
    const jitterX = (hash % 30) - 15;
    const jitterY = ((hash >> 3) % 30) - 15;
    return {
        x: regionPoint.x + jitterX,
        y: regionPoint.y + jitterY,
    };
}
function hashString(value) {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
        hash = (hash << 5) - hash + value.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}
