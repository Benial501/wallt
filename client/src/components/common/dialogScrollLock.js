// Usata dal dialog condiviso di conti e movimenti. Conserva larghezza e
// posizione di scroll del documento, anche con la scrollbar visibile.
export function lockDialogScroll(doc = document, win = window) {
  const body = doc.body;
  const root = doc.documentElement;
  const x = win.scrollX;
  const y = win.scrollY;
  const original = body.getAttribute('style');
  const scrollBehavior = root.style.scrollBehavior;
  const width = body.getBoundingClientRect().width;
  Object.assign(body.style, {
    position: 'fixed', top: `${-y}px`, left: `${-x}px`,
    width: `${width}px`, overflow: 'hidden',
  });
  const resize = () => { body.style.width = `${root.clientWidth}px`; };
  win.addEventListener('resize', resize);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    win.removeEventListener('resize', resize);
    root.style.scrollBehavior = 'auto';
    if (original === null) body.removeAttribute('style');
    else body.setAttribute('style', original);
    win.scrollTo(x, y);
    root.style.scrollBehavior = scrollBehavior;
  };
}
