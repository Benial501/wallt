/**
 * Blocco del pinch-zoom su Safari iOS.
 *
 * Perche' serve: dal 2016 Safari iOS ignora deliberatamente `user-scalable=no`
 * e `maximum-scale` nel meta viewport, quindi in una scheda normale il pinch
 * resta attivo anche con il viewport configurato. Gli eventi `gesture*` sono
 * l'unica leva rimasta: sono non standard e implementati solo da WebKit, che
 * li emette esclusivamente per gesti multi-touch di scala/rotazione.
 *
 * Perche' non interferisce con il resto: non si tocca `touchstart`, `click` o
 * `dblclick`, quindi tap, doppio tap dei componenti, scorrimento, selezione e
 * long-press restano invariati. Su Android e nella PWA installata questi
 * eventi non vengono mai emessi e il listener non fa nulla: li' il blocco
 * arriva gia' dal meta viewport e da `touch-action` in main.css.
 *
 * Accessibilita': lo zoom della pagina resta disponibile fuori dal browser
 * (Zoom schermo di iOS, dimensione testo di sistema, "Forza zoom" di Chrome
 * Android). Per riattivarlo nel browser basta non chiamare questa funzione e
 * togliere `maximum-scale`/`user-scalable` dal meta viewport in index.html.
 */
const blocca = (e) => e.preventDefault();

export function installAppGestures(target = document) {
  // passive:false e' obbligatorio: senza, preventDefault viene ignorato.
  const opts = { passive: false };
  target.addEventListener('gesturestart', blocca, opts);
  target.addEventListener('gesturechange', blocca, opts);
  target.addEventListener('gestureend', blocca, opts);

  return () => {
    target.removeEventListener('gesturestart', blocca, opts);
    target.removeEventListener('gesturechange', blocca, opts);
    target.removeEventListener('gestureend', blocca, opts);
  };
}
