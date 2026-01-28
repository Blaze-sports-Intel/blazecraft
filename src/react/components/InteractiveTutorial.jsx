/**
 * Interactive Tutorial Component
 *
 * Step-by-step guided tutorial that teaches users how to use BlazeCraft
 * with hands-on interactions, rewards, and progress tracking.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGamificationStore } from '../stores/gamificationStore.js';
import { useDevice, getPlatformConfig } from '../hooks/useDevice.js';

/**
 * Tutorial step definitions
 */
const TUTORIAL_STEPS = [
  {
    id: 'welcome',
    title: 'Welcome, Commander!',
    description: 'BlazeCraft is your RTS-style command center for AI agents. Let\'s learn how to take control!',
    targetSelector: null,
    action: 'click_next',
    position: 'center',
    reward: 10,
    mascot: '🤖',
    tip: 'Complete all steps to earn bonus XP!',
  },
  {
    id: 'map_overview',
    title: 'The Battlefield',
    description: 'This is your command map. Workers appear here as units you can select and command.',
    targetSelector: '#mapCanvas',
    action: 'click_next',
    position: 'right',
    reward: 5,
    mascot: '🗺️',
    tip: 'Workers spawn automatically in Demo mode',
  },
  {
    id: 'select_worker',
    title: 'Select a Worker',
    description: 'Click on any worker on the map to select it. Selected workers glow with a golden highlight.',
    targetSelector: '#mapCanvas',
    action: 'select_worker',
    position: 'right',
    reward: 15,
    mascot: '👆',
    tip: 'Drag to select multiple workers at once!',
    waitFor: 'workerSelected',
  },
  {
    id: 'resource_bar',
    title: 'Resource Bar',
    description: 'Track your progress here: tasks completed, files modified, active workers, and tokens spent.',
    targetSelector: '.wc3-task-metrics',
    action: 'click_next',
    position: 'bottom',
    reward: 5,
    mascot: '📊',
  },
  {
    id: 'portrait_panel',
    title: 'Worker Details',
    description: 'When a worker is selected, see their details here: name, current task, and progress.',
    targetSelector: '.wc3-portrait-panel-enhanced',
    action: 'click_next',
    position: 'top',
    reward: 5,
    mascot: '🖼️',
  },
  {
    id: 'command_grid',
    title: 'Command Center',
    description: 'Use these buttons to control selected workers. Each command has a hotkey shown in parentheses.',
    targetSelector: '.wc3-command-grid-3x3',
    action: 'click_next',
    position: 'top',
    reward: 5,
    mascot: '🎮',
    tip: 'Try pressing S for Stop, H for Hold, R for Resume',
  },
  {
    id: 'try_command',
    title: 'Try a Command',
    description: 'Select a worker and click the "Stop" button (or press S) to halt their current task.',
    targetSelector: '[data-cmd="stop"]',
    action: 'use_command',
    position: 'top',
    reward: 20,
    mascot: '✋',
    waitFor: 'commandUsed',
  },
  {
    id: 'minimap',
    title: 'Minimap Navigation',
    description: 'Use the minimap for quick navigation. Click anywhere to jump to that location.',
    targetSelector: '.wc3-minimap-panel',
    action: 'click_next',
    position: 'top',
    reward: 5,
    mascot: '📍',
    tip: 'Toggle terrain and unit views with the buttons below',
  },
  {
    id: 'event_log',
    title: 'Event Log',
    description: 'All worker activities appear in the event log. Keep an eye on errors and completions!',
    targetSelector: '.wc3-event-log',
    action: 'click_next',
    position: 'left',
    reward: 5,
    mascot: '📜',
  },
  {
    id: 'demo_toggle',
    title: 'Demo vs Live Mode',
    description: 'Toggle between Demo (simulated) and Live (real BSI data) mode here.',
    targetSelector: '#toggleDemo',
    action: 'click_next',
    position: 'bottom',
    reward: 5,
    mascot: '🔄',
  },
  {
    id: 'complete',
    title: 'Training Complete!',
    description: 'You\'re ready to command your AI agents! Explore the interface and earn more achievements.',
    targetSelector: null,
    action: 'finish',
    position: 'center',
    reward: 50,
    mascot: '🎖️',
    tip: 'Check the Achievements panel to see what you can unlock!',
  },
];

/**
 * Spotlight overlay for highlighting elements
 */
function SpotlightOverlay({ targetRect, padding = 12 }) {
  if (!targetRect) return null;

  const { left, top, width, height } = targetRect;

  return (
    <div className="tutorial-spotlight-overlay">
      <svg width="100%" height="100%" className="tutorial-spotlight-svg">
        <defs>
          <mask id="spotlight-mask">
            <rect width="100%" height="100%" fill="white" />
            <rect
              x={left - padding}
              y={top - padding}
              width={width + padding * 2}
              height={height + padding * 2}
              rx="8"
              fill="black"
            />
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.85)"
          mask="url(#spotlight-mask)"
        />
      </svg>

      {/* Animated highlight border */}
      <motion.div
        className="tutorial-spotlight-border"
        style={{
          left: left - padding - 2,
          top: top - padding - 2,
          width: width + padding * 2 + 4,
          height: height + padding * 2 + 4,
        }}
        animate={{
          boxShadow: [
            '0 0 0 2px rgba(212, 175, 55, 0.5), 0 0 20px rgba(212, 175, 55, 0.3)',
            '0 0 0 3px rgba(212, 175, 55, 0.8), 0 0 40px rgba(212, 175, 55, 0.5)',
            '0 0 0 2px rgba(212, 175, 55, 0.5), 0 0 20px rgba(212, 175, 55, 0.3)',
          ],
        }}
        transition={{ duration: 1.5, repeat: Infinity }}
      />
    </div>
  );
}

/**
 * Tutorial tooltip positioned relative to target
 */
function TutorialTooltip({
  step,
  stepIndex,
  totalSteps,
  targetRect,
  onNext,
  onSkip,
  device,
}) {
  const tooltipRef = useRef(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });

  // Calculate tooltip position
  useEffect(() => {
    if (!tooltipRef.current) return;

    const tooltip = tooltipRef.current;
    const tooltipRect = tooltip.getBoundingClientRect();

    if (!targetRect || step.position === 'center') {
      setPosition({
        left: (window.innerWidth - tooltipRect.width) / 2,
        top: (window.innerHeight - tooltipRect.height) / 2,
      });
      return;
    }

    const margin = 20;
    let left, top;

    switch (step.position) {
      case 'top':
        left = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;
        top = targetRect.top - tooltipRect.height - margin;
        break;
      case 'bottom':
        left = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;
        top = targetRect.bottom + margin;
        break;
      case 'left':
        left = targetRect.left - tooltipRect.width - margin;
        top = targetRect.top + targetRect.height / 2 - tooltipRect.height / 2;
        break;
      case 'right':
        left = targetRect.right + margin;
        top = targetRect.top + targetRect.height / 2 - tooltipRect.height / 2;
        break;
      default:
        left = (window.innerWidth - tooltipRect.width) / 2;
        top = (window.innerHeight - tooltipRect.height) / 2;
    }

    // Keep within viewport
    left = Math.max(margin, Math.min(left, window.innerWidth - tooltipRect.width - margin));
    top = Math.max(margin, Math.min(top, window.innerHeight - tooltipRect.height - margin));

    setPosition({ left, top });
  }, [targetRect, step.position]);

  const showNextButton = step.action === 'click_next' || step.action === 'finish';
  const isLastStep = step.action === 'finish';

  return (
    <motion.div
      ref={tooltipRef}
      className={`tutorial-tooltip ${device.isMobile ? 'mobile' : ''}`}
      style={{ left: position.left, top: position.top }}
      initial={{ opacity: 0, scale: 0.9, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 10 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
    >
      {/* Progress indicator */}
      <div className="tutorial-progress">
        <div className="tutorial-progress-bar">
          <motion.div
            className="tutorial-progress-fill"
            initial={{ width: 0 }}
            animate={{ width: `${((stepIndex + 1) / totalSteps) * 100}%` }}
          />
        </div>
        <span className="tutorial-progress-text">
          {stepIndex + 1} / {totalSteps}
        </span>
      </div>

      {/* Mascot and content */}
      <div className="tutorial-content">
        <motion.div
          className="tutorial-mascot"
          animate={{ y: [0, -5, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          {step.mascot}
        </motion.div>

        <div className="tutorial-text">
          <h3 className="tutorial-title">{step.title}</h3>
          <p className="tutorial-description">{step.description}</p>

          {step.tip && (
            <div className="tutorial-tip">
              <span className="tutorial-tip-icon">💡</span>
              <span className="tutorial-tip-text">{step.tip}</span>
            </div>
          )}

          {step.waitFor && (
            <div className="tutorial-waiting">
              <motion.div
                className="tutorial-waiting-dot"
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 0.6, repeat: Infinity }}
              />
              <span>Waiting for you to complete the action...</span>
            </div>
          )}
        </div>
      </div>

      {/* Reward preview */}
      <div className="tutorial-reward">
        <span className="tutorial-reward-icon">⭐</span>
        <span className="tutorial-reward-text">+{step.reward} XP</span>
      </div>

      {/* Actions */}
      <div className="tutorial-actions">
        {!isLastStep && (
          <button className="tutorial-skip" onClick={onSkip}>
            Skip Tutorial
          </button>
        )}
        {showNextButton && (
          <motion.button
            className="tutorial-next"
            onClick={onNext}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {isLastStep ? 'Start Commanding!' : 'Next'}
            <span className="tutorial-next-arrow">→</span>
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}

/**
 * Main Interactive Tutorial Component
 */
export function InteractiveTutorial({ onComplete, gameState }) {
  const device = useDevice();
  const platformConfig = getPlatformConfig(device);
  const {
    tutorialCompleted,
    tutorialStep,
    setTutorialStep,
    completeTutorial,
    addXP,
  } = useGamificationStore();

  const [active, setActive] = useState(!tutorialCompleted);
  const [currentStep, setCurrentStep] = useState(tutorialStep);
  const [targetRect, setTargetRect] = useState(null);
  const [earnedXP, setEarnedXP] = useState(0);

  const step = TUTORIAL_STEPS[currentStep];

  // Update target rect when step changes
  useEffect(() => {
    if (!step?.targetSelector) {
      setTargetRect(null);
      return;
    }

    const updateRect = () => {
      const element = document.querySelector(step.targetSelector);
      if (element) {
        setTargetRect(element.getBoundingClientRect());
      }
    };

    updateRect();
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect);

    return () => {
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect);
    };
  }, [step?.targetSelector]);

  // Listen for completion events
  useEffect(() => {
    if (!step?.waitFor) return;

    const handleEvent = (event) => {
      if (step.waitFor === 'workerSelected' && event.detail?.selected?.length > 0) {
        handleNext();
      }
      if (step.waitFor === 'commandUsed' && event.detail?.command) {
        handleNext();
      }
    };

    window.addEventListener('blazecraft:tutorial', handleEvent);
    return () => window.removeEventListener('blazecraft:tutorial', handleEvent);
  }, [step?.waitFor]);

  // Save progress
  useEffect(() => {
    setTutorialStep(currentStep);
  }, [currentStep, setTutorialStep]);

  const handleNext = useCallback(() => {
    // Award XP for completing step
    if (step?.reward) {
      addXP(step.reward, `Tutorial: ${step.title}`);
      setEarnedXP((prev) => prev + step.reward);
    }

    if (currentStep < TUTORIAL_STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      // Tutorial complete
      completeTutorial();
      setActive(false);
      onComplete?.();
    }
  }, [currentStep, step, addXP, completeTutorial, onComplete]);

  const handleSkip = useCallback(() => {
    // Award partial XP
    const remainingXP = TUTORIAL_STEPS.slice(currentStep).reduce(
      (sum, s) => sum + s.reward,
      0
    );
    addXP(Math.floor(remainingXP * 0.25), 'Tutorial skipped (partial XP)');

    completeTutorial();
    setActive(false);
    onComplete?.();
  }, [currentStep, addXP, completeTutorial, onComplete]);

  // Restart tutorial (for debugging)
  const restart = useCallback(() => {
    setCurrentStep(0);
    setEarnedXP(0);
    setActive(true);
  }, []);

  // Expose restart for external triggering
  useEffect(() => {
    window.restartTutorial = restart;
    return () => delete window.restartTutorial;
  }, [restart]);

  if (!active || !step) return null;

  return (
    <div className="tutorial-overlay">
      {/* Spotlight on target */}
      <SpotlightOverlay targetRect={targetRect} padding={12} />

      {/* Tutorial tooltip */}
      <AnimatePresence mode="wait">
        <TutorialTooltip
          key={step.id}
          step={step}
          stepIndex={currentStep}
          totalSteps={TUTORIAL_STEPS.length}
          targetRect={targetRect}
          onNext={handleNext}
          onSkip={handleSkip}
          device={device}
        />
      </AnimatePresence>

      {/* XP earned counter */}
      <AnimatePresence>
        {earnedXP > 0 && (
          <motion.div
            className="tutorial-xp-counter"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
          >
            <span className="tutorial-xp-icon">⭐</span>
            <span className="tutorial-xp-amount">{earnedXP}</span>
            <span className="tutorial-xp-label">XP Earned</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Button to restart tutorial
 */
export function RestartTutorialButton() {
  const handleClick = () => {
    window.restartTutorial?.();
  };

  return (
    <motion.button
      className="restart-tutorial-button"
      onClick={handleClick}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      <span className="restart-tutorial-icon">🎓</span>
      <span className="restart-tutorial-text">Restart Tutorial</span>
    </motion.button>
  );
}

export default InteractiveTutorial;
