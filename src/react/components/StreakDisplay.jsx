/**
 * Streak Display Component
 *
 * Shows the user's current streak with fire animations
 * and motivational messaging.
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGamificationStore } from '../stores/gamificationStore.js';
import { useDevice } from '../hooks/useDevice.js';

/**
 * Fire particle for streak animation
 */
function FireParticle({ delay = 0 }) {
  return (
    <motion.div
      className="streak-fire-particle"
      initial={{ y: 0, x: 0, opacity: 0.8, scale: 1 }}
      animate={{
        y: [-20, -40],
        x: [0, Math.random() * 20 - 10],
        opacity: [0.8, 0],
        scale: [1, 0.5],
      }}
      transition={{
        duration: 1,
        delay,
        repeat: Infinity,
        repeatDelay: Math.random() * 0.5,
      }}
    />
  );
}

/**
 * Streak flame icon with intensity based on streak length
 */
function StreakFlame({ streak }) {
  const intensity = Math.min(streak / 30, 1); // Max intensity at 30-day streak

  return (
    <motion.div
      className="streak-flame"
      style={{
        '--intensity': intensity,
      }}
      animate={{
        scale: [1, 1.05, 1],
        rotate: [0, 2, -2, 0],
      }}
      transition={{
        duration: 0.5,
        repeat: Infinity,
        repeatDelay: 0.5,
      }}
    >
      <span className="streak-flame-emoji">🔥</span>
      {streak >= 3 && (
        <div className="streak-fire-particles">
          {[...Array(Math.min(streak, 10))].map((_, i) => (
            <FireParticle key={i} delay={i * 0.1} />
          ))}
        </div>
      )}
    </motion.div>
  );
}

/**
 * Get motivational message based on streak
 */
function getStreakMessage(streak, longest) {
  if (streak === 0) {
    return 'Start your streak today!';
  }
  if (streak === 1) {
    return 'Great start! Keep it going!';
  }
  if (streak === 2) {
    return "Two days strong! You're building momentum!";
  }
  if (streak < 7) {
    return `${streak} days! Almost a week!`;
  }
  if (streak === 7) {
    return "One week streak! You're on fire! 🔥";
  }
  if (streak < 14) {
    return `${streak} days! Incredible consistency!`;
  }
  if (streak === 14) {
    return 'Two weeks! Unstoppable! 💪';
  }
  if (streak < 30) {
    return `${streak} days! Legendary dedication!`;
  }
  if (streak === 30) {
    return "30 days! You're a true Commander! 👑";
  }
  if (streak === longest) {
    return `${streak} days - Your best streak ever! 🏆`;
  }
  return `${streak} day streak! Keep the fire burning!`;
}

/**
 * Get next streak milestone
 */
function getNextMilestone(streak) {
  const milestones = [3, 7, 14, 30, 60, 100, 365];
  for (const m of milestones) {
    if (streak < m) {
      return { days: m, remaining: m - streak };
    }
  }
  return null;
}

/**
 * Calendar view showing recent activity
 */
function StreakCalendar({ currentStreak }) {
  const days = [];
  const today = new Date();

  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const isActive = i < currentStreak;
    const isToday = i === 0;

    days.push({
      date,
      day: date.toLocaleDateString('en-US', { weekday: 'short' }).charAt(0),
      isActive,
      isToday,
    });
  }

  return (
    <div className="streak-calendar">
      {days.map((d, i) => (
        <motion.div
          key={i}
          className={`streak-calendar-day ${d.isActive ? 'active' : ''} ${d.isToday ? 'today' : ''}`}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: i * 0.05 }}
        >
          <span className="streak-calendar-label">{d.day}</span>
          {d.isActive && <span className="streak-calendar-fire">🔥</span>}
        </motion.div>
      ))}
    </div>
  );
}

/**
 * Main Streak Display Component
 */
export function StreakDisplay({ compact = false }) {
  const device = useDevice();
  const { currentStreak, longestStreak, updateActivity } = useGamificationStore();
  const [showDetails, setShowDetails] = useState(false);

  // Update activity on mount
  useEffect(() => {
    updateActivity();
  }, [updateActivity]);

  const message = getStreakMessage(currentStreak, longestStreak);
  const nextMilestone = getNextMilestone(currentStreak);

  // Compact mode for header
  if (compact || device.isMobile) {
    return (
      <motion.button
        className="streak-compact"
        onClick={() => setShowDetails(!showDetails)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <StreakFlame streak={currentStreak} />
        <span className="streak-compact-count">{currentStreak}</span>

        <AnimatePresence>
          {showDetails && (
            <motion.div
              className="streak-compact-popup"
              initial={{ opacity: 0, y: 10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.9 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="streak-compact-popup-header">
                <span className="streak-compact-popup-count">{currentStreak}</span>
                <span className="streak-compact-popup-label">day streak</span>
              </div>
              <div className="streak-compact-popup-message">{message}</div>
              {nextMilestone && (
                <div className="streak-compact-popup-milestone">
                  {nextMilestone.remaining} days to {nextMilestone.days}-day milestone
                </div>
              )}
              <div className="streak-compact-popup-best">
                Best: {longestStreak} days
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>
    );
  }

  // Full display
  return (
    <motion.div
      className="streak-display"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="streak-header">
        <StreakFlame streak={currentStreak} />
        <div className="streak-info">
          <motion.div
            className="streak-count"
            key={currentStreak}
            initial={{ scale: 1.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
          >
            {currentStreak}
          </motion.div>
          <div className="streak-label">
            {currentStreak === 1 ? 'day streak' : 'day streak'}
          </div>
        </div>
      </div>

      <div className="streak-message">{message}</div>

      <StreakCalendar currentStreak={currentStreak} />

      <div className="streak-stats">
        <div className="streak-stat">
          <span className="streak-stat-icon">🏆</span>
          <span className="streak-stat-value">{longestStreak}</span>
          <span className="streak-stat-label">Best streak</span>
        </div>
        {nextMilestone && (
          <div className="streak-stat milestone">
            <span className="streak-stat-icon">🎯</span>
            <span className="streak-stat-value">{nextMilestone.remaining}</span>
            <span className="streak-stat-label">
              days to {nextMilestone.days}-day milestone
            </span>
          </div>
        )}
      </div>

      {/* Streak protection reminder */}
      <AnimatePresence>
        {currentStreak > 0 && (
          <motion.div
            className="streak-reminder"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <span className="streak-reminder-icon">⏰</span>
            <span className="streak-reminder-text">
              Complete a task today to keep your streak alive!
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/**
 * Streak lost notification
 */
export function StreakLostNotification({ previousStreak, onDismiss }) {
  return (
    <motion.div
      className="streak-lost-notification"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
    >
      <div className="streak-lost-icon">😢</div>
      <div className="streak-lost-content">
        <div className="streak-lost-title">Streak Lost</div>
        <div className="streak-lost-message">
          Your {previousStreak}-day streak has ended.
        </div>
        <div className="streak-lost-encourage">
          Start a new streak today!
        </div>
      </div>
      <button className="streak-lost-button" onClick={onDismiss}>
        Let's go! 🔥
      </button>
    </motion.div>
  );
}

export default StreakDisplay;
