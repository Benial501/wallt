import { computed } from 'vue';
import { useTheme } from './useTheme';

export function useChartTheme() {
  const { isDark } = useTheme();

  const getCssVar = (name) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  const chartColors = computed(() => ({
    grid: getCssVar('--border') || 'rgba(255,255,255,0.06)',
    text: getCssVar('--text-secondary') || '#8E8EA0',
    // Il tooltip viene disegnato su canvas: non puo' sfocare cio' che ha
    // dietro, quindi gli serve una tinta piena. --bg-card fa parte della
    // scala del vetro ed e' traslucido: qui sarebbe illeggibile.
    tooltipBg: getCssVar('--glass-elevated-solid') || '#191924',
    tooltipText: getCssVar('--text-primary') || '#FFFFFF',
  }));

  const baseOptions = computed(() => ({
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: chartColors.value.tooltipBg,
        titleColor: chartColors.value.tooltipText,
        bodyColor: chartColors.value.tooltipText,
        borderColor: chartColors.value.grid,
        borderWidth: 1,
      },
    },
    scales: {
      x: {
        grid: { color: chartColors.value.grid },
        ticks: { color: chartColors.value.text },
      },
      y: {
        grid: { color: chartColors.value.grid },
        ticks: { color: chartColors.value.text },
      },
    },
  }));

  return { chartColors, baseOptions, isDark };
}
