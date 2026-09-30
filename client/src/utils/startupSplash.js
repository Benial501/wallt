export const STARTUP_SPLASH_ANIMATION_MS = 2750;
export const STARTUP_SPLASH_EXIT_MS = 250;
export const STARTUP_SPLASH_REDUCED_MOTION_MS = 80;

export function getStartupSplashTiming(now, startedAt, prefersReducedMotion) {
  if (prefersReducedMotion) {
    return {
      animationElapsedMs: 0,
      remainingMs: STARTUP_SPLASH_REDUCED_MOTION_MS,
      animate: false,
    };
  }

  const elapsed = Number.isFinite(now) && Number.isFinite(startedAt)
    ? Math.max(0, now - startedAt)
    : 0;

  return {
    animationElapsedMs: Math.min(elapsed, STARTUP_SPLASH_ANIMATION_MS),
    remainingMs: Math.max(0, STARTUP_SPLASH_ANIMATION_MS - elapsed),
    animate: true,
  };
}
