import assert from 'node:assert/strict';
import {
  bumpActivityDates,
  calculateStreak,
  computeProgress,
  getNextMilestone,
  sanitizeState,
  shiftChicagoDate,
  toChicagoDateString,
  type QuestStep
} from '../src/academy-logic';

const sampleSteps: QuestStep[] = [
  { id: 'a', title: 'A', description: 'A', reward: '+1', category: 'command' },
  { id: 'b', title: 'B', description: 'B', reward: '+1', category: 'review' }
];

const chicagoDay = toChicagoDateString(new Date('2024-05-10T05:00:00Z'));
assert.equal(chicagoDay, '2024-05-10');

assert.equal(shiftChicagoDate('2024-05-10', -1), '2024-05-09');

const progress = computeProgress(sampleSteps, new Set(['a']));
assert.deepEqual(progress, { total: 2, completed: 1, percent: 50 });

const streak = calculateStreak(['2024-05-09', '2024-05-10'], '2024-05-10');
assert.equal(streak, 2);

const milestone = getNextMilestone(1, 5);
assert.equal(milestone.target, 3);
assert.equal(milestone.remaining, 2);

const bumped = bumpActivityDates(['2024-05-10'], '2024-05-11');
assert.deepEqual(bumped, ['2024-05-10', '2024-05-11']);

const sanitized = sanitizeState({
  completedStepIds: ['a', 'a', 42 as unknown as string],
  activityDates: ['2024-05-10', 12 as unknown as string],
  focusMinutes: -5,
  shipWins: 2
});
assert.deepEqual(sanitized.completedStepIds, ['a']);
assert.deepEqual(sanitized.activityDates, ['2024-05-10']);
assert.equal(sanitized.focusMinutes, 0);
assert.equal(sanitized.shipWins, 2);

console.log('academy-logic tests passed');
