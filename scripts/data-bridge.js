/**
 * @typedef {import('./game-state.js').GameState} GameState
 */

const DEFAULT_INTERVAL_MS = 60000;
const DEFAULT_TIMEZONE = 'America/Chicago';

/**
 * @param {Date} date
 * @param {string} timeZone
 */
function toDateString(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

/**
 * @param {unknown} value
 */
function isObject(value) {
  return typeof value === 'object' && value !== null;
}

/**
 * @param {unknown} value
 */
function toStringSafe(value) {
  return typeof value === 'string' ? value : '';
}

/**
 * @param {unknown} value
 */
function toNumberSafe(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * @param {any[]} games
 */
function formatGameLine(games) {
  if (!Array.isArray(games) || games.length === 0) {
    return 'MLB: No games scheduled.';
  }

  const pick = games.slice(0, 2).map((game) => {
    const away = game?.teams?.away;
    const home = game?.teams?.home;
    const awayName = toStringSafe(away?.name) || 'Away';
    const homeName = toStringSafe(home?.name) || 'Home';
    const awayScore = toNumberSafe(away?.score);
    const homeScore = toNumberSafe(home?.score);
    const status = toStringSafe(game?.status) || 'Unknown';
    const scoreText =
      awayScore !== null && homeScore !== null ? `${awayScore}-${homeScore}` : 'TBD';
    return `${awayName} ${scoreText} ${homeName} (${status})`;
  });

  return `MLB: ${pick.join(' • ')}`;
}

export class DataBridge {
  /**
   * @param {GameState} state
   * @param {{ baseUrl?: string, intervalMs?: number, timezone?: string }} [options]
   */
  constructor(state, options = {}) {
    this.state = state;
    this.baseUrl = options.baseUrl ?? window.location.origin;
    this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.timezone = options.timezone ?? DEFAULT_TIMEZONE;
    this.timer = null;
    this.lastLine = '';
  }

  async start() {
    await this.refresh();
    this.timer = window.setInterval(() => {
      void this.refresh();
    }, this.intervalMs);
  }

  stop() {
    if (this.timer) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  async refresh() {
    const date = toDateString(new Date(), this.timezone);
    try {
      const response = await fetch(`${this.baseUrl}/api/mlb/scoreboard?date=${date}`);
      if (!response.ok) {
        this.pushLine(`MLB feed unavailable (${response.status}).`);
        return;
      }
      const payload = await response.json();
      const games = isObject(payload) ? payload.games : [];
      const line = formatGameLine(games);
      this.pushLine(line);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.pushLine(`MLB feed unavailable (${message}).`);
    }
  }

  /**
   * @param {string} line
   */
  pushLine(line) {
    if (line && line !== this.lastLine) {
      this.lastLine = line;
      this.state.pushScoutLine(line);
    }
  }
}
