import { mountMeridianSpin } from '../../components/ui/ascii-globe-spin.js';

const canvas = document.getElementById('hero-globe');
if (canvas) {
  const dispose = mountMeridianSpin(canvas, {
    cellSize: 10,
  });
  window.addEventListener('pagehide', event => {
    if (!event.persisted) dispose?.();
  });
}
