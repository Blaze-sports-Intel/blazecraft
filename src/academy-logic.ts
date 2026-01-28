export type QuestStep = {
  id: string;
  title: string;
  description: string;
  reward: string;
  category: 'command' | 'review' | 'ship' | 'focus';
};

export type AcademyState = {
  completedStepIds: string[];
  activityDates: string[];
  focusMinutes: number;
  shipWins: number;
};

export const ACADEMY_STORAGE_KEY = 'blazecraft_academy_state';

const chicagoDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Chicago',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

const chicagoTimeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago',
  month: 'short',
  day: '2-digit',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true
});

export const DEFAULT_ACADEMY_STATE: AcademyState = {
  completedStepIds: [],
  activityDates: [],
  focusMinutes: 0,
  shipWins: 0
};

export const QUEST_STEPS: QuestStep[] = [
  {
    id: 'select-squad',
    title: 'Select your squad',
    description: 'Drag-select units on the map to build a focused task group.',
    reward: '+10 Momentum',
    category: 'command'
  },
  {
    id: 'issue-orders',
    title: 'Issue a command',
    description: 'Use the 3x3 command grid to stop, hold, or resume work.',
    reward: '+15 Momentum',
    category: 'command'
  },
  {
    id: 'review-ops',
    title: 'Review the Ops feed',
    description: 'Scan live events to spot blockers and opportunities.',
    reward: '+10 Clarity',
    category: 'review'
  },
  {
    id: 'launch-job',
    title: 'Launch a job',
    description: 'Create a new job to keep agents moving in parallel.',
    reward: '+20 Velocity',
    category: 'ship'
  },
  {
    id: 'ship-win',
    title: 'Ship a win',
    description: 'Close one measurable outcome (launch, fix, or revenue save).',
    reward: '+25 Profit',
    category: 'ship'
  }
];

export const toChicagoDateString = (date: Date): string => chicagoDateFormatter.format(date);

export const formatChicagoTimestamp = (date: Date): string => chicagoTimeFormatter.format(date);

export const sanitizeState = (state: Partial<AcademyState> | null | undefined): AcademyState => {
  if (!state) {
    return { ...DEFAULT_ACADEMY_STATE };
  }

  const completedStepIds = Array.isArray(state.completedStepIds)
    ? state.completedStepIds.filter((id) => typeof id === 'string')
    : [];
  const activityDates = Array.isArray(state.activityDates)
    ? state.activityDates.filter((date) => typeof date === 'string')
    : [];

  return {
    completedStepIds: Array.from(new Set(completedStepIds)),
    activityDates: Array.from(new Set(activityDates)),
    focusMinutes: Number.isFinite(state.focusMinutes) ? Math.max(0, state.focusMinutes ?? 0) : 0,
    shipWins: Number.isFinite(state.shipWins) ? Math.max(0, state.shipWins ?? 0) : 0
  };
};

export const computeProgress = (steps: QuestStep[], completedIds: Set<string>) => {
  const total = steps.length;
  const completed = steps.filter((step) => completedIds.has(step.id)).length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { total, completed, percent };
};

export const calculateStreak = (activityDates: string[], today: string): number => {
  if (!activityDates.length) return 0;

  const uniqueDates = Array.from(new Set(activityDates)).sort();
  let streak = 0;
  let cursor = today;

  for (let i = uniqueDates.length - 1; i >= 0; i -= 1) {
    const date = uniqueDates[i];
    if (date === cursor) {
      streak += 1;
      cursor = shiftChicagoDate(cursor, -1);
    } else if (date < cursor) {
      continue;
    } else {
      break;
    }
  }

  return streak;
};

export const shiftChicagoDate = (dateString: string, days: number): string => {
  const [year, month, day] = dateString.split('-').map((value) => Number(value));
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  date.setUTCDate(date.getUTCDate() + days);
  return chicagoDateFormatter.format(date);
};

export const getNextMilestone = (completed: number, total: number) => {
  const milestones = [1, 3, Math.max(4, Math.ceil(total * 0.6)), total];
  const target = milestones.find((value) => value > completed) ?? total;
  const remaining = Math.max(target - completed, 0);
  const label = remaining === 0 ? 'All milestones cleared' : `Next milestone in ${remaining} step${remaining === 1 ? '' : 's'}`;
  return { target, remaining, label };
};

export const bumpActivityDates = (activityDates: string[], today: string): string[] => {
  const next = Array.from(new Set([...activityDates, today]));
  return next.slice(-30);
};
