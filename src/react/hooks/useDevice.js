/**
 * Device Detection Hook
 *
 * Detects whether the user is on web, desktop, or mobile
 * and provides platform-specific configurations.
 */

import { useState, useEffect, useCallback } from 'react';

/**
 * @typedef {'mobile' | 'tablet' | 'desktop' | 'web'} DeviceType
 * @typedef {'ios' | 'android' | 'windows' | 'macos' | 'linux' | 'unknown'} OSType
 * @typedef {'touch' | 'pointer' | 'hybrid'} InputType
 */

/**
 * @typedef {Object} DeviceInfo
 * @property {DeviceType} type - Device type
 * @property {OSType} os - Operating system
 * @property {InputType} input - Primary input method
 * @property {boolean} isMobile - Is mobile device
 * @property {boolean} isTablet - Is tablet device
 * @property {boolean} isDesktop - Is desktop device
 * @property {boolean} isPWA - Is running as PWA
 * @property {boolean} isStandalone - Is standalone app
 * @property {boolean} hasTouch - Has touch capability
 * @property {boolean} hasMouse - Has mouse/pointer
 * @property {number} screenWidth - Screen width
 * @property {number} screenHeight - Screen height
 * @property {boolean} isLandscape - Is landscape orientation
 * @property {boolean} isPortrait - Is portrait orientation
 * @property {number} pixelRatio - Device pixel ratio
 * @property {boolean} prefersReducedMotion - User prefers reduced motion
 * @property {boolean} prefersDarkMode - User prefers dark mode
 */

const BREAKPOINTS = {
  mobile: 640,
  tablet: 1024,
  desktop: 1280,
};

/**
 * Detect operating system
 * @returns {OSType}
 */
function detectOS() {
  const ua = navigator.userAgent.toLowerCase();
  const platform = navigator.platform?.toLowerCase() || '';

  if (/iphone|ipad|ipod/.test(ua) || /mac/.test(platform) && navigator.maxTouchPoints > 1) {
    return 'ios';
  }
  if (/android/.test(ua)) {
    return 'android';
  }
  if (/win/.test(platform)) {
    return 'windows';
  }
  if (/mac/.test(platform)) {
    return 'macos';
  }
  if (/linux/.test(platform)) {
    return 'linux';
  }
  return 'unknown';
}

/**
 * Detect device type based on screen size and capabilities
 * @returns {DeviceType}
 */
function detectDeviceType() {
  const width = window.innerWidth;
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const hasMouse = window.matchMedia('(pointer: fine)').matches;

  // PWA or Electron detection
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone
    || document.referrer.includes('android-app://');

  if (width < BREAKPOINTS.mobile) {
    return 'mobile';
  }

  if (width < BREAKPOINTS.tablet) {
    // Could be tablet or large phone
    return hasTouch && !hasMouse ? 'tablet' : 'web';
  }

  if (width >= BREAKPOINTS.desktop) {
    // Check if it's a desktop app vs web
    if (isStandalone || window.process?.type === 'renderer') {
      return 'desktop';
    }
    return hasMouse ? 'web' : 'tablet';
  }

  return 'web';
}

/**
 * Detect primary input method
 * @returns {InputType}
 */
function detectInputType() {
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const hasMouse = window.matchMedia('(pointer: fine)').matches;

  if (hasTouch && hasMouse) return 'hybrid';
  if (hasTouch) return 'touch';
  return 'pointer';
}

/**
 * Get comprehensive device information
 * @returns {DeviceInfo}
 */
function getDeviceInfo() {
  const type = detectDeviceType();
  const os = detectOS();
  const input = detectInputType();
  const width = window.innerWidth;
  const height = window.innerHeight;

  return {
    type,
    os,
    input,
    isMobile: type === 'mobile',
    isTablet: type === 'tablet',
    isDesktop: type === 'desktop' || type === 'web',
    isPWA: window.matchMedia('(display-mode: standalone)').matches,
    isStandalone: window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone,
    hasTouch: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
    hasMouse: window.matchMedia('(pointer: fine)').matches,
    screenWidth: width,
    screenHeight: height,
    isLandscape: width > height,
    isPortrait: height >= width,
    pixelRatio: window.devicePixelRatio || 1,
    prefersReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    prefersDarkMode: window.matchMedia('(prefers-color-scheme: dark)').matches,
  };
}

/**
 * Device detection hook
 * @returns {DeviceInfo}
 */
export function useDevice() {
  const [device, setDevice] = useState(getDeviceInfo);

  const updateDevice = useCallback(() => {
    setDevice(getDeviceInfo());
  }, []);

  useEffect(() => {
    // Listen for resize and orientation changes
    window.addEventListener('resize', updateDevice);
    window.addEventListener('orientationchange', updateDevice);

    // Listen for media query changes
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const standaloneQuery = window.matchMedia('(display-mode: standalone)');

    motionQuery.addEventListener?.('change', updateDevice);
    darkModeQuery.addEventListener?.('change', updateDevice);
    standaloneQuery.addEventListener?.('change', updateDevice);

    return () => {
      window.removeEventListener('resize', updateDevice);
      window.removeEventListener('orientationchange', updateDevice);
      motionQuery.removeEventListener?.('change', updateDevice);
      darkModeQuery.removeEventListener?.('change', updateDevice);
      standaloneQuery.removeEventListener?.('change', updateDevice);
    };
  }, [updateDevice]);

  return device;
}

/**
 * Platform-specific configuration based on device
 * @param {DeviceInfo} device
 * @returns {Object}
 */
export function getPlatformConfig(device) {
  const baseConfig = {
    animationDuration: device.prefersReducedMotion ? 0 : 300,
    enableParticles: !device.prefersReducedMotion && device.isDesktop,
    enableSounds: true,
    enableHaptics: device.hasTouch && (device.os === 'ios' || device.os === 'android'),
  };

  if (device.isMobile) {
    return {
      ...baseConfig,
      layout: 'compact',
      commandGridCols: 3,
      showMinimap: false,
      showEventLog: 'collapsed',
      touchTargetSize: 48,
      fontSize: 14,
      panelSpacing: 8,
      enableSwipeGestures: true,
      enablePinchZoom: true,
    };
  }

  if (device.isTablet) {
    return {
      ...baseConfig,
      layout: 'tablet',
      commandGridCols: 5,
      showMinimap: device.isLandscape,
      showEventLog: 'sidebar',
      touchTargetSize: 44,
      fontSize: 15,
      panelSpacing: 12,
      enableSwipeGestures: true,
      enablePinchZoom: true,
    };
  }

  // Desktop/Web
  return {
    ...baseConfig,
    layout: 'full',
    commandGridCols: 3,
    showMinimap: true,
    showEventLog: 'sidebar',
    touchTargetSize: 32,
    fontSize: 16,
    panelSpacing: 16,
    enableSwipeGestures: false,
    enablePinchZoom: false,
    enableHotkeys: true,
    enableRightClick: true,
  };
}

export default useDevice;
