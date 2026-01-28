/**
 * BlazeCraft React App
 *
 * Main React application that provides gamification, tutorial,
 * and adaptive UI components for BlazeCraft.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';

// Components
import { XPBar } from './components/XPBar.jsx';
import { AchievementsPanel, AchievementsButton } from './components/Achievements.jsx';
import { StreakDisplay } from './components/StreakDisplay.jsx';
import { InteractiveTutorial, RestartTutorialButton } from './components/InteractiveTutorial.jsx';
import {
  PlatformProvider,
  MobileTabBar,
  MobileCommandWheel,
  MobileMinimap,
} from './components/AdaptiveLayout.jsx';

// Hooks & Stores
import { useDevice, getPlatformConfig } from './hooks/useDevice.js';
import { useGamificationStore } from './stores/gamificationStore.js';

// Styles
import './styles/adaptive-ui.css';

/**
 * Main App component
 */
export function BlazeCraftApp({ gameState }) {
  const device = useDevice();
  const config = getPlatformConfig(device);
  const {
    checkTimeAchievements,
    updateActivity,
    selectWorkers,
    useHotkey,
    explorePanel,
    completeTask,
    tutorialCompleted,
  } = useGamificationStore();

  // UI State
  const [showAchievements, setShowAchievements] = useState(false);
  const [showCommandWheel, setShowCommandWheel] = useState(false);
  const [commandWheelPosition, setCommandWheelPosition] = useState({ x: 0, y: 0 });
  const [activeTab, setActiveTab] = useState('map');
  const [minimapExpanded, setMinimapExpanded] = useState(false);

  // Check time-based achievements on mount
  useEffect(() => {
    checkTimeAchievements();
    updateActivity();

    // Check periodically
    const interval = setInterval(() => {
      checkTimeAchievements();
    }, 60000);

    return () => clearInterval(interval);
  }, [checkTimeAchievements, updateActivity]);

  // Bridge to vanilla JS game state
  useEffect(() => {
    if (!gameState) return;

    // Listen for worker selection changes
    const handleSelection = () => {
      const selectedCount = gameState.selected?.size || 0;
      if (selectedCount > 0) {
        selectWorkers(selectedCount);

        // Dispatch tutorial event
        window.dispatchEvent(
          new CustomEvent('blazecraft:tutorial', {
            detail: { selected: Array.from(gameState.selected) },
          })
        );
      }
    };

    // Listen for task completions
    const handleTaskComplete = () => {
      completeTask();
    };

    // Subscribe to game state changes
    const unsubscribe = gameState.subscribe?.(() => {
      handleSelection();
    });

    // Listen for custom events from the game
    window.addEventListener('blazecraft:taskComplete', handleTaskComplete);

    return () => {
      unsubscribe?.();
      window.removeEventListener('blazecraft:taskComplete', handleTaskComplete);
    };
  }, [gameState, selectWorkers, completeTask]);

  // Listen for hotkey usage
  useEffect(() => {
    const handleKeydown = (e) => {
      if (e.target.tagName === 'INPUT') return;
      const key = e.key.toLowerCase();
      const validKeys = ['s', 'h', 'r', 'a', 'i', 'x', 'l', 'f', 'n', 'c', 'g', 'q'];
      if (validKeys.includes(key)) {
        useHotkey(key);

        // Dispatch tutorial event
        window.dispatchEvent(
          new CustomEvent('blazecraft:tutorial', {
            detail: { command: key },
          })
        );
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [useHotkey]);

  // Panel exploration tracking
  useEffect(() => {
    const handlePanelClick = (e) => {
      const panel = e.target.closest('[data-panel]');
      if (panel) {
        explorePanel(panel.dataset.panel);
      }
    };

    document.addEventListener('click', handlePanelClick);
    return () => document.removeEventListener('click', handlePanelClick);
  }, [explorePanel]);

  // Command wheel for mobile (long press)
  const handleLongPress = useCallback(
    (e) => {
      if (!device.isMobile && !device.isTablet) return;

      const touch = e.touches?.[0] || e;
      setCommandWheelPosition({ x: touch.clientX, y: touch.clientY });
      setShowCommandWheel(true);
    },
    [device]
  );

  // Command definitions for mobile wheel
  const commands = [
    { id: 'stop', icon: '✋', label: 'Stop', action: () => window.blazeCommands?.exec('stop') },
    { id: 'hold', icon: '🛡️', label: 'Hold', action: () => window.blazeCommands?.exec('hold') },
    { id: 'resume', icon: '▶️', label: 'Resume', action: () => window.blazeCommands?.exec('resume') },
    { id: 'inspect', icon: '🔍', label: 'Inspect', action: () => window.blazeCommands?.exec('inspect') },
    { id: 'logs', icon: '📜', label: 'Logs', action: () => window.blazeCommands?.exec('logs') },
    { id: 'focus', icon: '🎯', label: 'Focus', action: () => window.blazeCommands?.exec('focus') },
    { id: 'terminate', icon: '💀', label: 'Kill', danger: true, action: () => window.blazeCommands?.exec('terminate') },
    { id: 'scan', icon: '📡', label: 'Scan', action: () => window.blazeCommands?.exec('scan') },
  ];

  // Mobile tab definitions
  const tabs = [
    { id: 'map', icon: '🗺️', label: 'Map' },
    { id: 'workers', icon: '👥', label: 'Workers' },
    { id: 'stats', icon: '📊', label: 'Stats' },
    { id: 'achievements', icon: '🏆', label: 'Badges', badge: 0 },
  ];

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    if (tabId === 'achievements') {
      setShowAchievements(true);
    }
  };

  const handleTutorialComplete = useCallback(() => {
    // Tutorial completed - maybe show a congratulations message
    console.log('Tutorial completed!');
  }, []);

  return (
    <PlatformProvider>
      {/* Gamification Header Bar */}
      <div className="blazecraft-gamification-bar" data-panel="gamification">
        <XPBar compact={device.isMobile} />
        <StreakDisplay compact={true} />
        <AchievementsButton onClick={() => setShowAchievements(true)} />
        {!device.isMobile && <RestartTutorialButton />}
      </div>

      {/* Interactive Tutorial */}
      {!tutorialCompleted && (
        <InteractiveTutorial
          onComplete={handleTutorialComplete}
          gameState={gameState}
        />
      )}

      {/* Achievements Panel */}
      <AnimatePresence>
        {showAchievements && (
          <AchievementsPanel onClose={() => setShowAchievements(false)} />
        )}
      </AnimatePresence>

      {/* Mobile-specific components */}
      {(device.isMobile || device.isTablet) && (
        <>
          {/* Mobile Minimap */}
          <MobileMinimap
            isExpanded={minimapExpanded}
            onToggle={() => setMinimapExpanded(!minimapExpanded)}
            onNavigate={(x, y) => {
              // Navigate via renderer
              window.blazeRenderer?.navigateTo?.(x, y);
            }}
            workers={gameState ? Array.from(gameState.workers?.values() || []).map((w) => ({
              id: w.id,
              x: w.position?.x / 2048 || 0,
              y: w.position?.y / 2048 || 0,
              status: w.state || 'idle',
            })) : []}
          />

          {/* Command Wheel */}
          <MobileCommandWheel
            isOpen={showCommandWheel}
            onClose={() => setShowCommandWheel(false)}
            commands={commands}
            position={commandWheelPosition}
          />

          {/* Mobile Tab Bar */}
          <MobileTabBar
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={handleTabChange}
          />
        </>
      )}
    </PlatformProvider>
  );
}

export default BlazeCraftApp;
