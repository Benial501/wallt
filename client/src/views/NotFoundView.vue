<template>
  <section class="not-found" aria-labelledby="not-found-title">
    <section class="not-found__card">
      <div class="not-found__code" aria-hidden="true">404</div>
      <p class="not-found__eyebrow">Fuori percorso</p>
      <h1 id="not-found-title">Pagina non trovata</h1>
      <p class="not-found__copy">
        Questo indirizzo non porta a una pagina di WALLT. Puoi tornare alla Home
        oppure riprendere da dove eri rimasto.
      </p>

      <div class="not-found__actions">
        <a class="not-found__primary" href="/dashboard">Torna alla Home</a>
        <button class="not-found__secondary" type="button" @click="tornaIndietro">
          Torna indietro
        </button>
      </div>
    </section>
  </section>
</template>

<script setup>
const tornaIndietro = () => {
  if (typeof window === 'undefined') return;

  if (window.history.length > 1) {
    window.history.back();
    return;
  }

  window.location.assign('/dashboard');
};
</script>

<style scoped>
.not-found {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: clamp(1.5rem, 5vw, 4rem);
  color: var(--text-primary);
  background:
    radial-gradient(circle at 18% 18%, color-mix(in srgb, var(--color-primary) 16%, transparent), transparent 34rem),
    var(--bg-page);
}

.not-found__card {
  width: min(100%, 38rem);
  padding: clamp(2rem, 6vw, 4rem);
  text-align: center;
  border: 1px solid var(--border-color);
  border-radius: 1.75rem;
  background: var(--bg-card);
  box-shadow: var(--shadow-lg);
}

.not-found__code {
  color: color-mix(in srgb, var(--color-primary) 18%, transparent);
  font-size: clamp(5rem, 18vw, 9rem);
  font-weight: 900;
  line-height: 0.8;
  letter-spacing: -0.08em;
}

.not-found__eyebrow {
  margin: 1.75rem 0 0.55rem;
  color: var(--color-primary);
  font-size: var(--text-xs);
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  font-size: clamp(1.8rem, 5vw, 2.7rem);
  line-height: 1.08;
}

.not-found__copy {
  max-width: 31rem;
  margin: 1rem auto 0;
  color: var(--text-secondary);
  line-height: 1.65;
}

.not-found__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.75rem;
  margin-top: 2rem;
}

.not-found__primary,
.not-found__secondary {
  min-height: 2.75rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.7rem 1.1rem;
  border-radius: 0.8rem;
  font: inherit;
  font-weight: 750;
  text-decoration: none;
  cursor: pointer;
}

.not-found__primary {
  border: 1px solid var(--color-primary);
  color: var(--color-on-primary, #fff);
  background: var(--color-primary);
}

.not-found__secondary {
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  background: var(--bg-elevated, var(--bg-card));
}

.not-found__primary:hover,
.not-found__secondary:hover {
  transform: translateY(-1px);
}

.not-found__primary:focus-visible,
.not-found__secondary:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--color-primary) 38%, transparent);
  outline-offset: 3px;
}

@media (max-width: 30rem) {
  .not-found__actions {
    flex-direction: column;
  }
}

@media (prefers-reduced-motion: reduce) {
  .not-found__primary:hover,
  .not-found__secondary:hover {
    transform: none;
  }
}
</style>
