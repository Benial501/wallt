<script setup>
import { computed, ref } from 'vue';
import dayjs from 'dayjs';
import 'dayjs/locale/it';

const props = defineProps({
  modelValue: { type: Number, default: 1 },
  occurrences: { type: Number, default: 12 },
  unlimited: { type: Boolean, default: false },
});

const emit = defineEmits(['update:modelValue']);

const today = dayjs().startOf('day');
const currentMonth = today.startOf('month');
const monthInView = ref(currentMonth);
const weekDays = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

const firstDueMonth = computed(() => {
  const month = today.startOf('month');
  const scheduledDay = Math.min(Number(props.modelValue) || 1, today.daysInMonth());
  return today.date() < scheduledDay ? month : month.add(1, 'month');
});

const previewDates = computed(() => {
  const requested = props.unlimited ? 12 : Number(props.occurrences);
  const count = Number.isFinite(requested) ? Math.max(0, Math.min(requested, 600)) : 0;
  return Array.from({ length: count }, (_, index) => {
    const month = firstDueMonth.value.add(index, 'month');
    const day = Math.min(Number(props.modelValue) || 1, month.daysInMonth());
    return month.date(day).format('YYYY-MM-DD');
  });
});

const lastPreviewMonth = computed(() => {
  const lastDate = previewDates.value.at(-1);
  return lastDate ? dayjs(lastDate).startOf('month') : currentMonth;
});

const giorniMese = computed(() => {
  const count = monthInView.value.daysInMonth();
  const offset = (monthInView.value.day() + 6) % 7;
  const dates = Array.from({ length: count }, (_, index) => index + 1);
  return [...Array(offset).fill(null), ...dates];
});

const dateProgrammateVisibili = computed(() => new Set(
  previewDates.value.filter((date) => dayjs(date).isSame(monthInView.value, 'month')),
));

const meseLabel = computed(() => monthInView.value.locale('it').format('MMMM YYYY'));
const puoTornareIndietro = computed(() => monthInView.value.isAfter(currentMonth, 'month'));
const puoAndareAvanti = computed(() => props.unlimited || monthInView.value.isBefore(lastPreviewMonth.value, 'month'));

const mesePrecedente = () => {
  if (puoTornareIndietro.value) monthInView.value = monthInView.value.subtract(1, 'month');
};

const meseSuccessivo = () => {
  if (puoAndareAvanti.value) monthInView.value = monthInView.value.add(1, 'month');
};

const scegliGiorno = (day) => {
  emit('update:modelValue', day);
};
</script>

<template>
  <section class="monthly-picker" aria-label="Seleziona il giorno del mese">
    <header class="monthly-picker__header">
      <button
        type="button"
        class="monthly-picker__nav"
        aria-label="Mese precedente"
        :disabled="!puoTornareIndietro"
        @click="mesePrecedente"
      >
        <span aria-hidden="true">‹</span>
      </button>
      <h3>{{ meseLabel }}</h3>
      <button
        type="button"
        class="monthly-picker__nav"
        aria-label="Mese successivo"
        :disabled="!puoAndareAvanti"
        @click="meseSuccessivo"
      >
        <span aria-hidden="true">›</span>
      </button>
    </header>

    <div class="monthly-picker__grid" aria-label="Giorni della settimana">
      <span v-for="giorno in weekDays" :key="giorno" class="monthly-picker__weekday">{{ giorno }}</span>
      <span v-for="(day, index) in giorniMese" :key="`giorno-${index}`" class="monthly-picker__cell">
        <button
          v-if="day"
          type="button"
          class="monthly-picker__day"
          :class="{
            'monthly-picker__day--selected': day === modelValue,
            'monthly-picker__day--scheduled': dateProgrammateVisibili.has(monthInView.date(day).format('YYYY-MM-DD')),
          }"
          :aria-label="`${day} ${meseLabel}${dateProgrammateVisibili.has(monthInView.date(day).format('YYYY-MM-DD')) ? ', pagamento programmato' : ''}`"
          :aria-pressed="day === modelValue"
          @click="scegliGiorno(day)"
        >
          {{ day }}
          <span v-if="dateProgrammateVisibili.has(monthInView.date(day).format('YYYY-MM-DD'))" class="monthly-picker__dot" aria-hidden="true" />
        </button>
      </span>
    </div>

    <p class="monthly-picker__selection">Giorno selezionato: <strong>{{ modelValue }}</strong> di ogni mese</p>
    <p class="monthly-picker__hint">
      Le date previste sono segnate con un punto. Se il mese è più corto, il pagamento cade nel suo ultimo giorno.
    </p>
  </section>
</template>

<style scoped>
.monthly-picker {
  padding: 0.875rem;
  border: 1px solid var(--glass-secondary-border);
  border-radius: var(--radius-lg);
  background: var(--glass-secondary-bg);
}
.monthly-picker__header {
  display: grid;
  grid-template-columns: 2.25rem 1fr 2.25rem;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.625rem;
}
.monthly-picker__header h3 {
  margin: 0;
  color: var(--text-primary);
  font-size: var(--text-sm);
  font-weight: 650;
  text-align: center;
  text-transform: capitalize;
}
.monthly-picker__nav {
  display: grid;
  place-items: center;
  width: 2.25rem;
  height: 2.25rem;
  border: 1px solid var(--glass-interactive-border);
  border-radius: var(--radius-md);
  background: var(--glass-interactive-bg);
  color: var(--text-primary);
  cursor: pointer;
}
.monthly-picker__nav:disabled { opacity: 0.38; cursor: default; }
.monthly-picker__nav:focus-visible,
.monthly-picker__day:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }
.monthly-picker__grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 0.25rem; }
.monthly-picker__weekday {
  display: grid;
  place-items: center;
  min-height: 1.5rem;
  color: var(--text-muted);
  font-size: var(--text-xs);
  font-weight: 600;
}
.monthly-picker__cell { display: grid; place-items: center; min-width: 0; }
.monthly-picker__day {
  position: relative;
  display: grid;
  place-items: center;
  width: 2.25rem;
  height: 2.25rem;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 50%;
  background: transparent;
  color: var(--text-secondary);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}
.monthly-picker__day:hover { background: var(--glass-interactive-bg-hover); }
.monthly-picker__day--selected {
  border-color: var(--accent-green);
  background: color-mix(in srgb, var(--accent-green) 13%, transparent);
  color: var(--text-primary);
  font-weight: 700;
}
.monthly-picker__day--scheduled:not(.monthly-picker__day--selected) { color: var(--accent-text); font-weight: 650; }
.monthly-picker__dot {
  position: absolute;
  bottom: 0.2rem;
  left: 50%;
  width: 0.25rem;
  height: 0.25rem;
  border-radius: 50%;
  background: var(--accent-green);
  transform: translateX(-50%);
}
.monthly-picker__selection { margin: 0.625rem 0 0; color: var(--text-secondary); font-size: var(--text-xs); }
.monthly-picker__selection strong { color: var(--text-primary); }
.monthly-picker__hint { margin: 0.625rem 0 0; color: var(--text-muted); font-size: var(--text-xs); line-height: 1.45; }
@media (max-width: 360px) {
  .monthly-picker { padding: 0.625rem; }
  .monthly-picker__day { width: 2rem; height: 2rem; }
}
</style>
