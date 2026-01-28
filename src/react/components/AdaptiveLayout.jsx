/**
 * Adaptive Layout Component
 *
 * Provides platform-specific UI layouts for web, desktop, and mobile.
 * Handles gesture controls, touch optimization, and responsive behavior.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { useDevice, getPlatformConfig } from '../hooks/useDevice.js';

/**
 * Gesture handler for touch devices
 */
function useSwipeGesture(onSwipe, threshold = 50) {
  const startRef = useRef({ x: 0, y: 0 });
  const [swiping, setSwiping] = useState(false);

  const handleTouchStart = useCallback((e) => {
    startRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
    setSwiping(true);
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (!swiping) return;
    // Prevent scrolling while swiping
  }, [swiping]);

  const handleTouchEnd = useCallback(
    (e) => {
      if (!swiping) return;
      setSwiping(false);

      const end = e.changedTouches[0];
      const dx = end.clientX - startRef.current.x;
      const dy = end.clientY - startRef.current.y;

      if (Math.abs(dx) > threshold && Math.abs(dx) > Math.abs(dy)) {
        onSwipe(dx > 0 ? 'right' : 'left');
      } else if (Math.abs(dy) > threshold && Math.abs(dy) > Math.abs(dx)) {
        onSwipe(dy > 0 ? 'down' : 'up');
      }
    },
    [swiping, onSwipe, threshold]
  );

  return {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
  };
}

/**
 * Mobile Bottom Sheet Panel
 */
export function MobileBottomSheet({
  isOpen,
  onClose,
  title,
  children,
  snapPoints = [0.3, 0.6, 0.9]
}) {
  const device = useDevice();
  const y = useMotionValue(0);
  const sheetRef = useRef(null);
  const [currentSnap, setCurrentSnap] = useState(1);

  const height = useTransform(y, (v) => {
    const maxHeight = window.innerHeight * snapPoints[snapPoints.length - 1];
    return Math.max(0, maxHeight - v);
  });

  const handleDragEnd = (_, info) => {
    const velocity = info.velocity.y;
    const offset = info.offset.y;

    if (velocity > 500 || offset > 100) {
      // Snap down or close
      if (currentSnap === 0) {
        onClose();
      } else {
        setCurrentSnap(Math.max(0, currentSnap - 1));
      }
    } else if (velocity < -500 || offset < -100) {
      // Snap up
      setCurrentSnap(Math.min(snapPoints.length - 1, currentSnap + 1));
    }
  };

  if (!device.isMobile && !device.isTablet) {
    // Regular panel for desktop
    return (
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="desktop-panel"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
          >
            <div className="desktop-panel-header">
              <h3>{title}</h3>
              <button onClick={onClose}>×</button>
            </div>
            <div className="desktop-panel-content">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="mobile-sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            ref={sheetRef}
            className="mobile-bottom-sheet"
            initial={{ y: '100%' }}
            animate={{
              y: `${100 - snapPoints[currentSnap] * 100}%`,
            }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.2}
            onDragEnd={handleDragEnd}
          >
            {/* Handle */}
            <div className="mobile-sheet-handle">
              <div className="mobile-sheet-handle-bar" />
            </div>

            {/* Header */}
            <div className="mobile-sheet-header">
              <h3 className="mobile-sheet-title">{title}</h3>
              <button className="mobile-sheet-close" onClick={onClose}>
                ×
              </button>
            </div>

            {/* Content */}
            <div className="mobile-sheet-content">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/**
 * Mobile Tab Bar for bottom navigation
 */
export function MobileTabBar({ tabs, activeTab, onTabChange }) {
  const device = useDevice();

  if (!device.isMobile) return null;

  return (
    <nav className="mobile-tab-bar">
      {tabs.map((tab) => (
        <motion.button
          key={tab.id}
          className={`mobile-tab ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => onTabChange(tab.id)}
          whileTap={{ scale: 0.9 }}
        >
          <span className="mobile-tab-icon">{tab.icon}</span>
          <span className="mobile-tab-label">{tab.label}</span>
          {tab.badge > 0 && (
            <span className="mobile-tab-badge">{tab.badge}</span>
          )}
        </motion.button>
      ))}
    </nav>
  );
}

/**
 * Mobile Command Wheel (radial menu for touch)
 */
export function MobileCommandWheel({
  isOpen,
  onClose,
  commands,
  position = { x: 0, y: 0 }
}) {
  const wheelRef = useRef(null);
  const radius = 100;
  const angleStep = (2 * Math.PI) / commands.length;

  const handleCommand = (command) => {
    command.action();
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="command-wheel-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            ref={wheelRef}
            className="command-wheel"
            style={{
              left: position.x,
              top: position.y,
            }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          >
            {/* Center close button */}
            <motion.button
              className="command-wheel-center"
              onClick={onClose}
              whileTap={{ scale: 0.9 }}
            >
              ×
            </motion.button>

            {/* Command buttons */}
            {commands.map((cmd, i) => {
              const angle = angleStep * i - Math.PI / 2;
              const x = Math.cos(angle) * radius;
              const y = Math.sin(angle) * radius;

              return (
                <motion.button
                  key={cmd.id}
                  className={`command-wheel-btn ${cmd.danger ? 'danger' : ''}`}
                  style={{
                    left: `calc(50% + ${x}px)`,
                    top: `calc(50% + ${y}px)`,
                  }}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ delay: i * 0.03 }}
                  onClick={() => handleCommand(cmd)}
                  whileTap={{ scale: 0.9 }}
                >
                  <span className="command-wheel-icon">{cmd.icon}</span>
                  <span className="command-wheel-label">{cmd.label}</span>
                </motion.button>
              );
            })}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/**
 * Touch-optimized minimap for mobile
 */
export function MobileMinimap({
  isExpanded,
  onToggle,
  onNavigate,
  workers = [],
  viewportRect
}) {
  const device = useDevice();
  const minimapRef = useRef(null);

  const handleTap = (e) => {
    if (!minimapRef.current) return;
    const rect = minimapRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    onNavigate(x, y);
  };

  if (!device.isMobile && !device.isTablet) return null;

  return (
    <motion.div
      className={`mobile-minimap ${isExpanded ? 'expanded' : 'collapsed'}`}
      animate={{
        width: isExpanded ? 160 : 80,
        height: isExpanded ? 120 : 60,
      }}
    >
      <motion.button
        className="mobile-minimap-toggle"
        onClick={onToggle}
        whileTap={{ scale: 0.9 }}
      >
        {isExpanded ? '−' : '+'}
      </motion.button>

      <div
        ref={minimapRef}
        className="mobile-minimap-canvas"
        onClick={handleTap}
      >
        {/* Viewport indicator */}
        {viewportRect && (
          <div
            className="mobile-minimap-viewport"
            style={{
              left: `${viewportRect.x * 100}%`,
              top: `${viewportRect.y * 100}%`,
              width: `${viewportRect.width * 100}%`,
              height: `${viewportRect.height * 100}%`,
            }}
          />
        )}

        {/* Worker dots */}
        {workers.map((worker) => (
          <div
            key={worker.id}
            className={`mobile-minimap-worker ${worker.status}`}
            style={{
              left: `${worker.x * 100}%`,
              top: `${worker.y * 100}%`,
            }}
          />
        ))}
      </div>
    </motion.div>
  );
}

/**
 * Platform-aware header
 */
export function AdaptiveHeader({
  title,
  subtitle,
  leftAction,
  rightAction,
  showBack = false,
  onBack
}) {
  const device = useDevice();

  if (device.isMobile) {
    return (
      <header className="adaptive-header mobile">
        <div className="adaptive-header-left">
          {showBack ? (
            <motion.button
              className="adaptive-header-back"
              onClick={onBack}
              whileTap={{ scale: 0.9 }}
            >
              ←
            </motion.button>
          ) : (
            leftAction
          )}
        </div>
        <div className="adaptive-header-center">
          <h1 className="adaptive-header-title">{title}</h1>
          {subtitle && (
            <span className="adaptive-header-subtitle">{subtitle}</span>
          )}
        </div>
        <div className="adaptive-header-right">{rightAction}</div>
      </header>
    );
  }

  // Desktop/Web header
  return (
    <header className="adaptive-header desktop">
      <div className="adaptive-header-brand">
        <h1 className="adaptive-header-title">{title}</h1>
        {subtitle && (
          <span className="adaptive-header-subtitle">{subtitle}</span>
        )}
      </div>
      <div className="adaptive-header-actions">
        {leftAction}
        {rightAction}
      </div>
    </header>
  );
}

/**
 * Responsive grid layout
 */
export function AdaptiveGrid({
  children,
  minItemWidth = 250,
  gap = 16
}) {
  const device = useDevice();
  const config = getPlatformConfig(device);

  return (
    <div
      className="adaptive-grid"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fill, minmax(${minItemWidth}px, 1fr))`,
        gap: config.panelSpacing || gap,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Platform context provider
 */
export function PlatformProvider({ children }) {
  const device = useDevice();
  const config = getPlatformConfig(device);

  // Set CSS custom properties based on platform
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--touch-target-size', `${config.touchTargetSize}px`);
    root.style.setProperty('--panel-spacing', `${config.panelSpacing}px`);
    root.style.setProperty('--base-font-size', `${config.fontSize}px`);

    // Add platform class to body
    document.body.classList.remove('platform-mobile', 'platform-tablet', 'platform-desktop', 'platform-web');
    document.body.classList.add(`platform-${device.type}`);

    // Add input type class
    document.body.classList.remove('input-touch', 'input-pointer', 'input-hybrid');
    document.body.classList.add(`input-${device.input}`);

    // Orientation class
    document.body.classList.remove('orientation-landscape', 'orientation-portrait');
    document.body.classList.add(`orientation-${device.isLandscape ? 'landscape' : 'portrait'}`);

  }, [device, config]);

  return (
    <div className={`platform-container platform-${device.type}`}>
      {children}
    </div>
  );
}

/**
 * Touch-friendly button wrapper
 */
export function TouchButton({
  children,
  onClick,
  className = '',
  haptic = true,
  ...props
}) {
  const device = useDevice();
  const config = getPlatformConfig(device);

  const handleClick = (e) => {
    // Haptic feedback on supported devices
    if (haptic && config.enableHaptics && navigator.vibrate) {
      navigator.vibrate(10);
    }
    onClick?.(e);
  };

  return (
    <motion.button
      className={`touch-button ${className}`}
      onClick={handleClick}
      whileTap={{ scale: 0.95 }}
      style={{
        minHeight: config.touchTargetSize,
        minWidth: config.touchTargetSize,
      }}
      {...props}
    >
      {children}
    </motion.button>
  );
}

export default {
  PlatformProvider,
  AdaptiveHeader,
  AdaptiveGrid,
  MobileBottomSheet,
  MobileTabBar,
  MobileCommandWheel,
  MobileMinimap,
  TouchButton,
  useSwipeGesture,
};
