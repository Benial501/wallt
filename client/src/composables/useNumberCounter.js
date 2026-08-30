import { ref, onMounted, onUnmounted, watch } from 'vue';

export function useNumberCounter(targetRef, options = {}) {
  const { duration = 1200, decimals = 2 } = options;
  const displayValue = ref(0);
  let rafId = null;
  let observer = null;
  let hasStarted = false;
  const elRef = ref(null);

  const animate = (target) => {
    if (rafId) cancelAnimationFrame(rafId);
    const from = displayValue.value;
    const start = performance.now();

    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      displayValue.value = from + (target - from) * eased;
      if (progress < 1) rafId = requestAnimationFrame(tick);
      else displayValue.value = target;
    };
    rafId = requestAnimationFrame(tick);
  };

  const start = (target) => {
    if (target === undefined) target = typeof targetRef.value === 'number' ? targetRef.value : parseFloat(targetRef.value) || 0;
    animate(target);
  };

  watch(targetRef, (val) => {
    const num = parseFloat(val) || 0;
    if (hasStarted) animate(num);
  });

  onMounted(() => {
    if (typeof IntersectionObserver === 'undefined') {
      hasStarted = true;
      start();
      return;
    }
    observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !hasStarted) {
          hasStarted = true;
          start();
          observer?.disconnect();
        }
      });
    }, { threshold: 0.3 });

    if (elRef.value) observer.observe(elRef.value);
    else {
      hasStarted = true;
      start();
    }
  });

  onUnmounted(() => {
    if (rafId) cancelAnimationFrame(rafId);
    observer?.disconnect();
  });

  return { displayValue, start, elRef };
}
