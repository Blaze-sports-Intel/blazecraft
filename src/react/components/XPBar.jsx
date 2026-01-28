/**
 * XP Bar Component
 *
 * Displays player's XP progress, level, and title with animations.
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGamificationStore } from '../stores/gamificationStore.js';
import { useDevice } from '../hooks/useDevice.js';

/**
 * Animated number counter
 */
function AnimatedNumber({ value, duration = 500 }) {
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const start = display;
    const diff = value - start;
    if (diff === 0) return;

    const startTime = performance.now();
    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      setDisplay(Math.round(start + diff * eased));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [value, duration]);

  return <span>{display.toLocaleString()}</span>;
}

/**
 * XP gained popup
 */
function XPPopup({ amount, onComplete }) {
  return (
    <motion.div
      className="xp-popup"
      initial={{ opacity: 0, y: 20, scale: 0.8 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -30, scale: 0.6 }}
      onAnimationComplete={onComplete}
    >
      <span className="xp-popup-icon">+</span>
      <span className="xp-popup-amount">{amount}</span>
      <span className="xp-popup-label">XP</span>
    </motion.div>
  );
}

/**
 * Level up celebration
 */
function LevelUpCelebration({ level, title, onComplete }) {
  useEffect(() => {
    const timer = setTimeout(onComplete, 3000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <motion.div
      className="level-up-celebration"
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.2 }}
    >
      <motion.div
        className="level-up-glow"
        animate={{
          boxShadow: [
            '0 0 20px rgba(212, 175, 55, 0.5)',
            '0 0 60px rgba(212, 175, 55, 0.8)',
            '0 0 20px rgba(212, 175, 55, 0.5)',
          ],
        }}
        transition={{ duration: 1, repeat: Infinity }}
      />
      <div className="level-up-content">
        <motion.div
          className="level-up-icon"
          animate={{ rotate: [0, 10, -10, 0], scale: [1, 1.2, 1] }}
          transition={{ duration: 0.5, repeat: 2 }}
        >
          ⬆️
        </motion.div>
        <div className="level-up-text">LEVEL UP!</div>
        <div className="level-up-level">Level {level}</div>
        <div className="level-up-title">{title}</div>
      </div>
    </motion.div>
  );
}

/**
 * Main XP Bar component
 */
export function XPBar({ compact = false }) {
  const device = useDevice();
  const { xp, level, title, getProgress } = useGamificationStore();
  const progress = getProgress();

  const [prevXP, setPrevXP] = useState(xp);
  const [prevLevel, setPrevLevel] = useState(level);
  const [xpGains, setXpGains] = useState([]);
  const [showLevelUp, setShowLevelUp] = useState(false);

  // Track XP gains
  useEffect(() => {
    if (xp > prevXP) {
      const gain = xp - prevXP;
      setXpGains((prev) => [...prev, { id: Date.now(), amount: gain }]);
    }
    setPrevXP(xp);
  }, [xp, prevXP]);

  // Track level ups
  useEffect(() => {
    if (level > prevLevel) {
      setShowLevelUp(true);
    }
    setPrevLevel(level);
  }, [level, prevLevel]);

  const removeXPGain = (id) => {
    setXpGains((prev) => prev.filter((g) => g.id !== id));
  };

  // Compact mode for mobile
  if (compact || device.isMobile) {
    return (
      <div className="xp-bar-compact">
        <div className="xp-bar-compact-level">
          <span className="xp-level-badge">{level}</span>
        </div>
        <div className="xp-bar-compact-bar">
          <motion.div
            className="xp-bar-fill"
            initial={{ width: 0 }}
            animate={{ width: `${progress.percentage}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>
        <span className="xp-bar-compact-pct">{progress.percentage}%</span>

        {/* XP Popups */}
        <AnimatePresence>
          {xpGains.map((gain) => (
            <XPPopup
              key={gain.id}
              amount={gain.amount}
              onComplete={() => removeXPGain(gain.id)}
            />
          ))}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="xp-bar-container">
      {/* Level badge */}
      <motion.div
        className="xp-level-badge-container"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <div className="xp-level-badge-frame">
          <span className="xp-level-badge-number">{level}</span>
        </div>
        <span className="xp-level-title">{title}</span>
      </motion.div>

      {/* XP Progress bar */}
      <div className="xp-bar-wrapper">
        <div className="xp-bar-track">
          <motion.div
            className="xp-bar-fill"
            initial={{ width: 0 }}
            animate={{ width: `${progress.percentage}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
          <motion.div
            className="xp-bar-glow"
            style={{ width: `${progress.percentage}%` }}
            animate={{
              opacity: [0.5, 1, 0.5],
            }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        </div>
        <div className="xp-bar-labels">
          <span className="xp-bar-current">
            <AnimatedNumber value={progress.current} /> XP
          </span>
          <span className="xp-bar-required">
            {progress.required.toLocaleString()} XP to next level
          </span>
        </div>
      </div>

      {/* XP Popups */}
      <AnimatePresence>
        {xpGains.map((gain) => (
          <XPPopup
            key={gain.id}
            amount={gain.amount}
            onComplete={() => removeXPGain(gain.id)}
          />
        ))}
      </AnimatePresence>

      {/* Level up celebration */}
      <AnimatePresence>
        {showLevelUp && (
          <LevelUpCelebration
            level={level}
            title={title}
            onComplete={() => setShowLevelUp(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default XPBar;
