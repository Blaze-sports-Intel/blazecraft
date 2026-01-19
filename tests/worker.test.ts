import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chicagoTimestamp,
  normalizeDate,
  summarizeMlbAggregate,
  summarizeMlbSchedule,
} from '../workers/api.ts';

test('chicagoTimestamp returns ISO-like string', () => {
  const stamp = chicagoTimestamp(new Date('2024-07-04T12:00:00Z'), 'America/Chicago');
  assert.match(stamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
});

test('normalizeDate accepts valid input or defaults to today', () => {
  assert.equal(normalizeDate('2024-09-10', 'America/Chicago'), '2024-09-10');
  const today = normalizeDate(null, 'America/Chicago');
  assert.match(today, /^\d{4}-\d{2}-\d{2}$/);
});

test('summarizeMlbSchedule extracts game summaries', () => {
  const games = summarizeMlbSchedule({
    dates: [
      {
        games: [
          {
            gamePk: 123,
            status: { detailedState: 'Final' },
            gameDate: '2024-04-01T19:05:00Z',
            venue: { name: 'Wrigley Field' },
            teams: {
              away: { team: { name: 'Cardinals' }, score: 3 },
              home: { team: { name: 'Cubs' }, score: 4 },
            },
          },
        ],
      },
    ],
  });

  assert.equal(games.length, 1);
  assert.equal(games[0].gameId, 123);
  assert.equal(games[0].teams.away.name, 'Cardinals');
  assert.equal(games[0].teams.home.score, 4);
});

test('summarizeMlbAggregate counts totals', () => {
  const aggregate = summarizeMlbAggregate([
    {
      gameId: 1,
      status: 'Final',
      startTime: '2024-04-01T19:05:00Z',
      venue: 'Wrigley Field',
      teams: {
        away: { name: 'A', score: 1 },
        home: { name: 'B', score: 2 },
      },
    },
    {
      gameId: 2,
      status: 'In Progress',
      startTime: '2024-04-01T19:05:00Z',
      venue: 'Fenway Park',
      teams: {
        away: { name: 'C', score: 0 },
        home: { name: 'D', score: 0 },
      },
    },
  ]);

  assert.equal(aggregate.totalGames, 2);
  assert.equal(aggregate.finals, 1);
  assert.equal(aggregate.inProgress, 1);
});
