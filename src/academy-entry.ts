import type * as ReactType from 'react';
import type * as ReactDomType from 'react-dom/client';
import {
  ACADEMY_STORAGE_KEY,
  QUEST_STEPS,
  bumpActivityDates,
  calculateStreak,
  computeProgress,
  formatChicagoTimestamp,
  getNextMilestone,
  sanitizeState,
  toChicagoDateString,
  type AcademyState,
  type QuestStep
} from './academy-logic';

const React = (window as Window & { React?: typeof ReactType }).React;
const ReactDOM = (window as Window & { ReactDOM?: typeof ReactDomType }).ReactDOM;

if (!React || !ReactDOM) {
  throw new Error('React runtime not found. Ensure React and ReactDOM are loaded before academy bundle.');
}

const { createElement, useMemo, useState } = React;

const loadState = (): AcademyState => {
  try {
    const raw = localStorage.getItem(ACADEMY_STORAGE_KEY);
    if (!raw) return sanitizeState(null);
    return sanitizeState(JSON.parse(raw) as Partial<AcademyState>);
  } catch {
    return sanitizeState(null);
  }
};

const persistState = (state: AcademyState) => {
  localStorage.setItem(ACADEMY_STORAGE_KEY, JSON.stringify(state));
};

const QuestStepCard = ({
  step,
  isComplete,
  onToggle
}: {
  step: QuestStep;
  isComplete: boolean;
  onToggle: () => void;
}) =>
  createElement(
    'div',
    {
      className: `academy-step ${isComplete ? 'is-complete' : ''}`
    },
    createElement('div', { className: 'academy-step-header' }, [
      createElement('div', { className: 'academy-step-title', key: `${step.id}-title` }, step.title),
      createElement(
        'span',
        { className: `academy-step-tag tag-${step.category}`, key: `${step.id}-tag` },
        step.category.toUpperCase()
      )
    ]),
    createElement('p', { className: 'academy-step-desc' }, step.description),
    createElement('div', { className: 'academy-step-footer' }, [
      createElement('span', { className: 'academy-step-reward', key: `${step.id}-reward` }, step.reward),
      createElement(
        'button',
        {
          className: 'academy-step-toggle',
          type: 'button',
          onClick: onToggle,
          'aria-pressed': isComplete
        },
        isComplete ? 'Completed' : 'Mark complete'
      )
    ])
  );

const AcademyPanel = () => {
  const [state, setState] = useState<AcademyState>(() => loadState());
  const completedSet = useMemo(() => new Set(state.completedStepIds), [state.completedStepIds]);
  const progress = useMemo(() => computeProgress(QUEST_STEPS, completedSet), [completedSet]);

  const today = toChicagoDateString(new Date());
  const streak = useMemo(() => calculateStreak(state.activityDates, today), [state.activityDates, today]);
  const milestone = useMemo(() => getNextMilestone(progress.completed, progress.total), [progress]);
  const lastPulse = useMemo(() => formatChicagoTimestamp(new Date()), []);

  const updateState = (next: AcademyState) => {
    setState(next);
    persistState(next);
  };

  const toggleStep = (stepId: string) => {
    const nextCompleted = completedSet.has(stepId)
      ? state.completedStepIds.filter((id) => id !== stepId)
      : [...state.completedStepIds, stepId];

    updateState({
      ...state,
      completedStepIds: nextCompleted,
      activityDates: bumpActivityDates(state.activityDates, today)
    });
  };

  const logFocusSprint = () => {
    updateState({
      ...state,
      focusMinutes: state.focusMinutes + 25,
      activityDates: bumpActivityDates(state.activityDates, today)
    });
  };

  const logShipWin = () => {
    updateState({
      ...state,
      shipWins: state.shipWins + 1,
      activityDates: bumpActivityDates(state.activityDates, today)
    });
  };

  return createElement(
    'section',
    { className: 'academy-panel-inner' },
    createElement('header', { className: 'academy-header' }, [
      createElement('div', { className: 'academy-title-group', key: 'academy-title' }, [
        createElement('span', { className: 'academy-kicker', key: 'academy-kicker' }, 'BlazeCraft Academy'),
        createElement('h2', { className: 'academy-title', key: 'academy-title-text' }, 'Command Training + Profit Loop')
      ]),
      createElement('div', { className: 'academy-meta', key: 'academy-meta' }, [
        createElement('span', { className: 'academy-meta-label', key: 'academy-meta-label' }, 'Last pulse'),
        createElement('span', { className: 'academy-meta-value', key: 'academy-meta-value' }, `${lastPulse} CT`)
      ])
    ]),
    createElement('div', { className: 'academy-progress' }, [
      createElement('div', { className: 'academy-progress-bar', key: 'academy-progress-bar' }, [
        createElement('div', {
          className: 'academy-progress-fill',
          style: { width: `${progress.percent}%` }
        })
      ]),
      createElement('div', { className: 'academy-progress-meta', key: 'academy-progress-meta' }, [
        createElement('span', { className: 'academy-progress-text', key: 'academy-progress-text' }, `${progress.completed}/${progress.total} steps complete`),
        createElement('span', { className: 'academy-progress-milestone', key: 'academy-progress-milestone' }, milestone.label)
      ])
    ]),
    createElement('div', { className: 'academy-grid' }, [
      createElement('div', { className: 'academy-steps', key: 'academy-steps' },
        QUEST_STEPS.map((step) =>
          createElement(QuestStepCard, {
            key: step.id,
            step,
            isComplete: completedSet.has(step.id),
            onToggle: () => toggleStep(step.id)
          })
        )
      ),
      createElement('div', { className: 'academy-side', key: 'academy-side' }, [
        createElement('div', { className: 'academy-card', key: 'academy-streak' }, [
          createElement('h3', { className: 'academy-card-title', key: 'academy-streak-title' }, 'Momentum streak'),
          createElement('p', { className: 'academy-card-value', key: 'academy-streak-value' }, `${streak} day${streak === 1 ? '' : 's'}`),
          createElement(
            'p',
            { className: 'academy-card-sub' },
            'Log one action every day to keep your command rhythm alive.'
          )
        ]),
        createElement('div', { className: 'academy-card', key: 'academy-focus' }, [
          createElement('h3', { className: 'academy-card-title', key: 'academy-focus-title' }, 'Focus sprints'),
          createElement('p', { className: 'academy-card-value', key: 'academy-focus-value' }, `${state.focusMinutes} minutes`),
          createElement('button', { className: 'academy-action', type: 'button', onClick: logFocusSprint }, 'Log 25-minute sprint'),
          createElement(
            'p',
            { className: 'academy-card-sub' },
            'Stack sprints to compound execution speed.'
          )
        ]),
        createElement('div', { className: 'academy-card', key: 'academy-profit' }, [
          createElement('h3', { className: 'academy-card-title', key: 'academy-profit-title' }, 'Profit wins'),
          createElement('p', { className: 'academy-card-value', key: 'academy-profit-value' }, `${state.shipWins} wins logged`),
          createElement('button', { className: 'academy-action', type: 'button', onClick: logShipWin }, 'Record a shipped win'),
          createElement(
            'p',
            { className: 'academy-card-sub' },
            'Celebrate launches, revenue saves, and momentum multipliers.'
          )
        ])
      ])
    ])
  );
};

const rootElement = document.getElementById('academyRoot');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(createElement(AcademyPanel));
}
