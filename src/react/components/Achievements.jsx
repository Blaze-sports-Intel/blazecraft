/**
 * Achievements Component
 *
 * Displays achievements panel with categories and unlock status.
 * Shows celebratory notifications when achievements are unlocked.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGamificationStore, ACHIEVEMENTS } from '../stores/gamificationStore.js';
import { useDevice } from '../hooks/useDevice.js';

/**
 * Achievement notification toast
 */
function AchievementToast({ achievement, onComplete }) {
  useEffect(() => {
    // Play unlock sound if available
    try {
      const audio = new Audio('/assets/sounds/achievement.mp3');
      audio.volume = 0.3;
      audio.play().catch(() => {});
    } catch {}

    const timer = setTimeout(onComplete, 4000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <motion.div
      className="achievement-toast"
      initial={{ x: 100, opacity: 0, scale: 0.8 }}
      animate={{ x: 0, opacity: 1, scale: 1 }}
      exit={{ x: 100, opacity: 0, scale: 0.8 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
    >
      <motion.div
        className="achievement-toast-glow"
        animate={{
          boxShadow: [
            '0 0 20px rgba(212, 175, 55, 0.3)',
            '0 0 40px rgba(212, 175, 55, 0.6)',
            '0 0 20px rgba(212, 175, 55, 0.3)',
          ],
        }}
        transition={{ duration: 1.5, repeat: Infinity }}
      />
      <div className="achievement-toast-icon">
        <motion.span
          animate={{ scale: [1, 1.3, 1], rotate: [0, 10, -10, 0] }}
          transition={{ duration: 0.6 }}
        >
          {achievement.icon}
        </motion.span>
      </div>
      <div className="achievement-toast-content">
        <div className="achievement-toast-header">Achievement Unlocked!</div>
        <div className="achievement-toast-name">{achievement.name}</div>
        <div className="achievement-toast-desc">{achievement.description}</div>
        {achievement.xp > 0 && (
          <div className="achievement-toast-xp">+{achievement.xp} XP</div>
        )}
      </div>
    </motion.div>
  );
}

/**
 * Single achievement card
 */
function AchievementCard({ achievement, unlocked, onClick }) {
  return (
    <motion.button
      className={`achievement-card ${unlocked ? 'unlocked' : 'locked'}`}
      onClick={onClick}
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      layout
    >
      <div className="achievement-card-icon">
        <span className={unlocked ? '' : 'grayscale'}>{achievement.icon}</span>
        {!unlocked && <div className="achievement-card-lock">🔒</div>}
      </div>
      <div className="achievement-card-info">
        <div className="achievement-card-name">{achievement.name}</div>
        <div className="achievement-card-desc">
          {unlocked ? achievement.description : '???'}
        </div>
        {unlocked && achievement.xp > 0 && (
          <div className="achievement-card-xp">+{achievement.xp} XP</div>
        )}
      </div>
      {unlocked && (
        <motion.div
          className="achievement-card-check"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 500 }}
        >
          ✓
        </motion.div>
      )}
    </motion.button>
  );
}

/**
 * Achievement category section
 */
function AchievementCategory({ category, achievements, expanded, onToggle }) {
  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  const totalCount = achievements.length;
  const percentage = Math.round((unlockedCount / totalCount) * 100);

  const categoryLabels = {
    onboarding: { name: 'Getting Started', icon: '🎓' },
    workers: { name: 'Worker Management', icon: '👥' },
    tasks: { name: 'Task Completion', icon: '✅' },
    streaks: { name: 'Streaks', icon: '🔥' },
    time: { name: 'Time-Based', icon: '⏰' },
    exploration: { name: 'Exploration', icon: '🗺️' },
    special: { name: 'Special', icon: '⭐' },
  };

  const label = categoryLabels[category] || { name: category, icon: '📦' };

  return (
    <div className="achievement-category">
      <motion.button
        className="achievement-category-header"
        onClick={onToggle}
        whileHover={{ backgroundColor: 'rgba(255, 255, 255, 0.05)' }}
      >
        <div className="achievement-category-icon">{label.icon}</div>
        <div className="achievement-category-info">
          <div className="achievement-category-name">{label.name}</div>
          <div className="achievement-category-progress">
            <div className="achievement-category-bar">
              <motion.div
                className="achievement-category-bar-fill"
                initial={{ width: 0 }}
                animate={{ width: `${percentage}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
            <span className="achievement-category-count">
              {unlockedCount}/{totalCount}
            </span>
          </div>
        </div>
        <motion.div
          className="achievement-category-arrow"
          animate={{ rotate: expanded ? 180 : 0 }}
        >
          ▼
        </motion.div>
      </motion.button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            className="achievement-category-list"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {achievements.map((achievement) => (
              <AchievementCard
                key={achievement.id}
                achievement={achievement}
                unlocked={achievement.unlocked}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Main Achievements Panel
 */
export function AchievementsPanel({ onClose }) {
  const device = useDevice();
  const { getAllAchievements, recentAchievements, clearRecentAchievements } =
    useGamificationStore();

  const [expandedCategories, setExpandedCategories] = useState(new Set(['onboarding']));
  const [toasts, setToasts] = useState([]);

  // Group achievements by category
  const achievements = getAllAchievements();
  const byCategory = achievements.reduce((acc, achievement) => {
    const cat = achievement.category || 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(achievement);
    return acc;
  }, {});

  // Calculate totals
  const totalUnlocked = achievements.filter((a) => a.unlocked).length;
  const totalCount = achievements.length;
  const totalXP = achievements
    .filter((a) => a.unlocked)
    .reduce((sum, a) => sum + a.xp, 0);

  // Handle category toggle
  const toggleCategory = useCallback((category) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  // Show toasts for recent achievements
  useEffect(() => {
    if (recentAchievements.length > 0) {
      setToasts((prev) => [
        ...prev,
        ...recentAchievements.map((a, i) => ({
          ...a,
          id: `${a.id}-${Date.now()}-${i}`,
        })),
      ]);
      clearRecentAchievements();
    }
  }, [recentAchievements, clearRecentAchievements]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <>
      {/* Toast notifications */}
      <div className="achievement-toasts">
        <AnimatePresence>
          {toasts.map((toast) => (
            <AchievementToast
              key={toast.id}
              achievement={toast}
              onComplete={() => removeToast(toast.id)}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Main panel */}
      <motion.div
        className={`achievements-panel ${device.isMobile ? 'mobile' : ''}`}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
      >
        <div className="achievements-header">
          <h2 className="achievements-title">
            <span className="achievements-title-icon">🏆</span>
            Achievements
          </h2>
          {onClose && (
            <button className="achievements-close" onClick={onClose}>
              ×
            </button>
          )}
        </div>

        <div className="achievements-summary">
          <div className="achievements-stat">
            <span className="achievements-stat-value">{totalUnlocked}</span>
            <span className="achievements-stat-label">
              of {totalCount} unlocked
            </span>
          </div>
          <div className="achievements-stat">
            <span className="achievements-stat-value">{totalXP}</span>
            <span className="achievements-stat-label">XP earned</span>
          </div>
          <div className="achievements-progress-ring">
            <svg viewBox="0 0 36 36" className="achievements-ring">
              <path
                className="achievements-ring-bg"
                d="M18 2.0845
                   a 15.9155 15.9155 0 0 1 0 31.831
                   a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <motion.path
                className="achievements-ring-fill"
                strokeDasharray={`${(totalUnlocked / totalCount) * 100}, 100`}
                initial={{ strokeDasharray: '0, 100' }}
                animate={{
                  strokeDasharray: `${(totalUnlocked / totalCount) * 100}, 100`,
                }}
                transition={{ duration: 1, ease: 'easeOut' }}
                d="M18 2.0845
                   a 15.9155 15.9155 0 0 1 0 31.831
                   a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <span className="achievements-ring-text">
              {Math.round((totalUnlocked / totalCount) * 100)}%
            </span>
          </div>
        </div>

        <div className="achievements-categories">
          {Object.entries(byCategory).map(([category, categoryAchievements]) => (
            <AchievementCategory
              key={category}
              category={category}
              achievements={categoryAchievements}
              expanded={expandedCategories.has(category)}
              onToggle={() => toggleCategory(category)}
            />
          ))}
        </div>
      </motion.div>
    </>
  );
}

/**
 * Floating achievements button
 */
export function AchievementsButton({ onClick }) {
  const { achievements, getAllAchievements } = useGamificationStore();
  const allAchievements = getAllAchievements();
  const unlockedCount = allAchievements.filter((a) => a.unlocked).length;

  return (
    <motion.button
      className="achievements-button"
      onClick={onClick}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
    >
      <span className="achievements-button-icon">🏆</span>
      <span className="achievements-button-count">
        {unlockedCount}/{allAchievements.length}
      </span>
    </motion.button>
  );
}

export default AchievementsPanel;
