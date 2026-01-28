/**
 * Gamification Store
 *
 * Manages XP, levels, achievements, streaks, and rewards
 * using Zustand for state management with localStorage persistence.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// XP required for each level (exponential curve)
const XP_PER_LEVEL = [
  0,      // Level 0 (not used)
  0,      // Level 1 - starting level
  100,    // Level 2
  250,    // Level 3
  500,    // Level 4
  850,    // Level 5
  1300,   // Level 6
  1900,   // Level 7
  2650,   // Level 8
  3550,   // Level 9
  4600,   // Level 10 - "Commander"
  5800,   // Level 11
  7200,   // Level 12
  8800,   // Level 13
  10600,  // Level 14
  12600,  // Level 15
  14800,  // Level 16
  17200,  // Level 17
  19800,  // Level 18
  22600,  // Level 19
  25600,  // Level 20 - "Grand Marshal"
];

const MAX_LEVEL = XP_PER_LEVEL.length - 1;

// Achievement definitions
const ACHIEVEMENTS = {
  // Onboarding
  first_steps: {
    id: 'first_steps',
    name: 'First Steps',
    description: 'Complete the tutorial',
    icon: '🎓',
    xp: 50,
    category: 'onboarding',
  },
  curious_commander: {
    id: 'curious_commander',
    name: 'Curious Commander',
    description: 'Explore all UI panels',
    icon: '🔍',
    xp: 25,
    category: 'onboarding',
  },

  // Worker Management
  first_worker: {
    id: 'first_worker',
    name: 'First Command',
    description: 'Select your first worker',
    icon: '👆',
    xp: 10,
    category: 'workers',
  },
  squad_leader: {
    id: 'squad_leader',
    name: 'Squad Leader',
    description: 'Select 5 workers at once',
    icon: '👥',
    xp: 50,
    category: 'workers',
  },
  army_commander: {
    id: 'army_commander',
    name: 'Army Commander',
    description: 'Have 10+ active workers',
    icon: '⚔️',
    xp: 100,
    category: 'workers',
  },
  efficiency_expert: {
    id: 'efficiency_expert',
    name: 'Efficiency Expert',
    description: 'Complete 100 tasks',
    icon: '⚡',
    xp: 200,
    category: 'workers',
  },

  // Task Completion
  task_rookie: {
    id: 'task_rookie',
    name: 'Task Rookie',
    description: 'Complete your first task',
    icon: '✅',
    xp: 15,
    category: 'tasks',
  },
  task_veteran: {
    id: 'task_veteran',
    name: 'Task Veteran',
    description: 'Complete 50 tasks',
    icon: '🏆',
    xp: 150,
    category: 'tasks',
  },
  perfectionist: {
    id: 'perfectionist',
    name: 'Perfectionist',
    description: 'Complete 10 tasks without failures',
    icon: '💎',
    xp: 100,
    category: 'tasks',
  },

  // Streaks
  streak_starter: {
    id: 'streak_starter',
    name: 'Streak Starter',
    description: 'Maintain a 3-day streak',
    icon: '🔥',
    xp: 30,
    category: 'streaks',
  },
  on_fire: {
    id: 'on_fire',
    name: 'On Fire',
    description: 'Maintain a 7-day streak',
    icon: '🔥🔥',
    xp: 100,
    category: 'streaks',
  },
  unstoppable: {
    id: 'unstoppable',
    name: 'Unstoppable',
    description: 'Maintain a 30-day streak',
    icon: '🌟',
    xp: 500,
    category: 'streaks',
  },

  // Time-based
  night_owl: {
    id: 'night_owl',
    name: 'Night Owl',
    description: 'Use BlazeCraft after midnight',
    icon: '🦉',
    xp: 20,
    category: 'time',
  },
  early_bird: {
    id: 'early_bird',
    name: 'Early Bird',
    description: 'Use BlazeCraft before 6 AM',
    icon: '🐦',
    xp: 20,
    category: 'time',
  },
  weekend_warrior: {
    id: 'weekend_warrior',
    name: 'Weekend Warrior',
    description: 'Complete tasks on a weekend',
    icon: '🎮',
    xp: 25,
    category: 'time',
  },

  // Exploration
  map_explorer: {
    id: 'map_explorer',
    name: 'Map Explorer',
    description: 'Pan and zoom across the entire map',
    icon: '🗺️',
    xp: 30,
    category: 'exploration',
  },
  hotkey_master: {
    id: 'hotkey_master',
    name: 'Hotkey Master',
    description: 'Use 10 different hotkeys',
    icon: '⌨️',
    xp: 75,
    category: 'exploration',
  },

  // Special
  level_up: {
    id: 'level_up',
    name: 'Level Up!',
    description: 'Reach Level 5',
    icon: '⬆️',
    xp: 0, // No XP to prevent loops
    category: 'special',
  },
  elite_commander: {
    id: 'elite_commander',
    name: 'Elite Commander',
    description: 'Reach Level 10',
    icon: '👑',
    xp: 0,
    category: 'special',
  },
  grand_marshal: {
    id: 'grand_marshal',
    name: 'Grand Marshal',
    description: 'Reach Level 20',
    icon: '🎖️',
    xp: 0,
    category: 'special',
  },
};

// Titles based on level
const TITLES = {
  1: 'Recruit',
  2: 'Private',
  3: 'Corporal',
  4: 'Sergeant',
  5: 'Lieutenant',
  6: 'Captain',
  7: 'Major',
  8: 'Colonel',
  9: 'General',
  10: 'Commander',
  15: 'Field Marshal',
  20: 'Grand Marshal',
};

/**
 * Calculate level from total XP
 * @param {number} xp
 * @returns {number}
 */
function calculateLevel(xp) {
  for (let i = MAX_LEVEL; i >= 1; i--) {
    if (xp >= XP_PER_LEVEL[i]) {
      return i;
    }
  }
  return 1;
}

/**
 * Get XP progress within current level
 * @param {number} xp
 * @param {number} level
 * @returns {{ current: number, required: number, percentage: number }}
 */
function getLevelProgress(xp, level) {
  if (level >= MAX_LEVEL) {
    return { current: 0, required: 0, percentage: 100 };
  }
  const currentLevelXP = XP_PER_LEVEL[level];
  const nextLevelXP = XP_PER_LEVEL[level + 1];
  const current = xp - currentLevelXP;
  const required = nextLevelXP - currentLevelXP;
  const percentage = Math.min(100, Math.round((current / required) * 100));
  return { current, required, percentage };
}

/**
 * Get title for a level
 * @param {number} level
 * @returns {string}
 */
function getTitleForLevel(level) {
  const levels = Object.keys(TITLES).map(Number).sort((a, b) => b - a);
  for (const lvl of levels) {
    if (level >= lvl) {
      return TITLES[lvl];
    }
  }
  return 'Recruit';
}

/**
 * Check if today is a new day compared to last activity
 * @param {string|null} lastDate - ISO date string
 * @returns {boolean}
 */
function isNewDay(lastDate) {
  if (!lastDate) return true;
  const last = new Date(lastDate).toDateString();
  const today = new Date().toDateString();
  return last !== today;
}

/**
 * Check if streak is still valid (within 48 hours of last activity)
 * @param {string|null} lastDate
 * @returns {boolean}
 */
function isStreakValid(lastDate) {
  if (!lastDate) return false;
  const last = new Date(lastDate);
  const now = new Date();
  const diffHours = (now - last) / (1000 * 60 * 60);
  return diffHours < 48;
}

/**
 * Create the gamification store
 */
export const useGamificationStore = create(
  persist(
    (set, get) => ({
      // Core stats
      xp: 0,
      level: 1,
      title: 'Recruit',

      // Achievements
      achievements: [], // Array of achievement IDs
      recentAchievements: [], // For notifications

      // Streaks
      currentStreak: 0,
      longestStreak: 0,
      lastActivityDate: null,

      // Stats
      stats: {
        tasksCompleted: 0,
        tasksFailedInRow: 0,
        perfectStreak: 0,
        workersSelected: 0,
        maxWorkersAtOnce: 0,
        hotkeysUsed: new Set(),
        panelsExplored: new Set(),
        totalTokensSpent: 0,
        totalSessionTime: 0,
      },

      // Tutorial progress
      tutorialCompleted: false,
      tutorialStep: 0,

      // Session tracking
      sessionStart: Date.now(),

      /**
       * Add XP and check for level up
       * @param {number} amount
       * @param {string} reason
       */
      addXP: (amount, reason = '') => {
        set((state) => {
          const newXP = state.xp + amount;
          const oldLevel = state.level;
          const newLevel = calculateLevel(newXP);
          const leveledUp = newLevel > oldLevel;

          // Check for level-based achievements
          const newAchievements = [...state.recentAchievements];
          if (leveledUp) {
            if (newLevel >= 5 && !state.achievements.includes('level_up')) {
              newAchievements.push(ACHIEVEMENTS.level_up);
            }
            if (newLevel >= 10 && !state.achievements.includes('elite_commander')) {
              newAchievements.push(ACHIEVEMENTS.elite_commander);
            }
            if (newLevel >= 20 && !state.achievements.includes('grand_marshal')) {
              newAchievements.push(ACHIEVEMENTS.grand_marshal);
            }
          }

          return {
            xp: newXP,
            level: newLevel,
            title: getTitleForLevel(newLevel),
            recentAchievements: newAchievements,
          };
        });
      },

      /**
       * Unlock an achievement
       * @param {string} achievementId
       */
      unlockAchievement: (achievementId) => {
        const state = get();
        if (state.achievements.includes(achievementId)) return;

        const achievement = ACHIEVEMENTS[achievementId];
        if (!achievement) return;

        set((s) => ({
          achievements: [...s.achievements, achievementId],
          recentAchievements: [...s.recentAchievements, achievement],
        }));

        // Add XP for the achievement
        if (achievement.xp > 0) {
          get().addXP(achievement.xp, `Achievement: ${achievement.name}`);
        }
      },

      /**
       * Clear recent achievements (after showing notifications)
       */
      clearRecentAchievements: () => {
        set({ recentAchievements: [] });
      },

      /**
       * Update activity and streak
       */
      updateActivity: () => {
        set((state) => {
          const now = new Date().toISOString();
          const wasNewDay = isNewDay(state.lastActivityDate);
          const streakValid = isStreakValid(state.lastActivityDate);

          let newStreak = state.currentStreak;
          if (wasNewDay) {
            newStreak = streakValid ? state.currentStreak + 1 : 1;
          }

          const longestStreak = Math.max(state.longestStreak, newStreak);

          return {
            lastActivityDate: now,
            currentStreak: newStreak,
            longestStreak,
          };
        });

        // Check streak achievements
        const { currentStreak, achievements, unlockAchievement } = get();
        if (currentStreak >= 3 && !achievements.includes('streak_starter')) {
          unlockAchievement('streak_starter');
        }
        if (currentStreak >= 7 && !achievements.includes('on_fire')) {
          unlockAchievement('on_fire');
        }
        if (currentStreak >= 30 && !achievements.includes('unstoppable')) {
          unlockAchievement('unstoppable');
        }
      },

      /**
       * Track task completion
       */
      completeTask: () => {
        set((state) => ({
          stats: {
            ...state.stats,
            tasksCompleted: state.stats.tasksCompleted + 1,
            tasksFailedInRow: 0,
            perfectStreak: state.stats.perfectStreak + 1,
          },
        }));

        const { stats, achievements, unlockAchievement, addXP, updateActivity } = get();

        // Add XP for task completion
        addXP(10, 'Task completed');
        updateActivity();

        // Check achievements
        if (stats.tasksCompleted === 1 && !achievements.includes('task_rookie')) {
          unlockAchievement('task_rookie');
        }
        if (stats.tasksCompleted >= 50 && !achievements.includes('task_veteran')) {
          unlockAchievement('task_veteran');
        }
        if (stats.tasksCompleted >= 100 && !achievements.includes('efficiency_expert')) {
          unlockAchievement('efficiency_expert');
        }
        if (stats.perfectStreak >= 10 && !achievements.includes('perfectionist')) {
          unlockAchievement('perfectionist');
        }
      },

      /**
       * Track task failure
       */
      failTask: () => {
        set((state) => ({
          stats: {
            ...state.stats,
            tasksFailedInRow: state.stats.tasksFailedInRow + 1,
            perfectStreak: 0,
          },
        }));
      },

      /**
       * Track worker selection
       * @param {number} count
       */
      selectWorkers: (count) => {
        set((state) => ({
          stats: {
            ...state.stats,
            workersSelected: state.stats.workersSelected + count,
            maxWorkersAtOnce: Math.max(state.stats.maxWorkersAtOnce, count),
          },
        }));

        const { stats, achievements, unlockAchievement } = get();
        if (count >= 1 && !achievements.includes('first_worker')) {
          unlockAchievement('first_worker');
        }
        if (count >= 5 && !achievements.includes('squad_leader')) {
          unlockAchievement('squad_leader');
        }
      },

      /**
       * Track hotkey usage
       * @param {string} key
       */
      useHotkey: (key) => {
        set((state) => {
          const newSet = new Set(state.stats.hotkeysUsed);
          newSet.add(key);
          return {
            stats: {
              ...state.stats,
              hotkeysUsed: newSet,
            },
          };
        });

        const { stats, achievements, unlockAchievement } = get();
        if (stats.hotkeysUsed.size >= 10 && !achievements.includes('hotkey_master')) {
          unlockAchievement('hotkey_master');
        }
      },

      /**
       * Track panel exploration
       * @param {string} panelId
       */
      explorePanel: (panelId) => {
        set((state) => {
          const newSet = new Set(state.stats.panelsExplored);
          newSet.add(panelId);
          return {
            stats: {
              ...state.stats,
              panelsExplored: newSet,
            },
          };
        });

        const { stats, achievements, unlockAchievement } = get();
        // Assuming we have 6 main panels
        if (stats.panelsExplored.size >= 6 && !achievements.includes('curious_commander')) {
          unlockAchievement('curious_commander');
        }
      },

      /**
       * Complete tutorial
       */
      completeTutorial: () => {
        set({ tutorialCompleted: true });
        get().unlockAchievement('first_steps');
        get().addXP(50, 'Tutorial completed');
      },

      /**
       * Set tutorial step
       * @param {number} step
       */
      setTutorialStep: (step) => {
        set({ tutorialStep: step });
      },

      /**
       * Check time-based achievements
       */
      checkTimeAchievements: () => {
        const hour = new Date().getHours();
        const day = new Date().getDay();
        const { achievements, unlockAchievement } = get();

        // Night owl (after midnight, before 4 AM)
        if (hour >= 0 && hour < 4 && !achievements.includes('night_owl')) {
          unlockAchievement('night_owl');
        }

        // Early bird (before 6 AM)
        if (hour >= 4 && hour < 6 && !achievements.includes('early_bird')) {
          unlockAchievement('early_bird');
        }

        // Weekend warrior
        if ((day === 0 || day === 6) && !achievements.includes('weekend_warrior')) {
          unlockAchievement('weekend_warrior');
        }
      },

      /**
       * Get progress summary
       */
      getProgress: () => {
        const state = get();
        const progress = getLevelProgress(state.xp, state.level);
        return {
          level: state.level,
          title: state.title,
          xp: state.xp,
          ...progress,
          achievementCount: state.achievements.length,
          totalAchievements: Object.keys(ACHIEVEMENTS).length,
          currentStreak: state.currentStreak,
          longestStreak: state.longestStreak,
        };
      },

      /**
       * Get all achievements with unlock status
       */
      getAllAchievements: () => {
        const state = get();
        return Object.values(ACHIEVEMENTS).map((achievement) => ({
          ...achievement,
          unlocked: state.achievements.includes(achievement.id),
        }));
      },

      /**
       * Reset all progress (for testing)
       */
      resetProgress: () => {
        set({
          xp: 0,
          level: 1,
          title: 'Recruit',
          achievements: [],
          recentAchievements: [],
          currentStreak: 0,
          longestStreak: 0,
          lastActivityDate: null,
          stats: {
            tasksCompleted: 0,
            tasksFailedInRow: 0,
            perfectStreak: 0,
            workersSelected: 0,
            maxWorkersAtOnce: 0,
            hotkeysUsed: new Set(),
            panelsExplored: new Set(),
            totalTokensSpent: 0,
            totalSessionTime: 0,
          },
          tutorialCompleted: false,
          tutorialStep: 0,
        });
      },
    }),
    {
      name: 'blazecraft-gamification',
      // Custom serialization for Sets
      serialize: (state) => {
        return JSON.stringify({
          ...state.state,
          stats: {
            ...state.state.stats,
            hotkeysUsed: Array.from(state.state.stats.hotkeysUsed || []),
            panelsExplored: Array.from(state.state.stats.panelsExplored || []),
          },
        });
      },
      deserialize: (str) => {
        const parsed = JSON.parse(str);
        return {
          state: {
            ...parsed,
            stats: {
              ...parsed.stats,
              hotkeysUsed: new Set(parsed.stats?.hotkeysUsed || []),
              panelsExplored: new Set(parsed.stats?.panelsExplored || []),
            },
          },
        };
      },
    }
  )
);

export { ACHIEVEMENTS, TITLES, XP_PER_LEVEL, MAX_LEVEL };
export default useGamificationStore;
