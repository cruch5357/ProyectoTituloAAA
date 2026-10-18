// Independiente del bundle: también funciona si falla la descarga de React.
(() => {
  const status = document.getElementById('startup-status');
  const retry = document.getElementById('startup-retry');
  retry?.addEventListener('click', () => window.location.reload());
  const timer = window.setTimeout(() => {
    if (status?.isConnected) {
      status.textContent = 'La conexión está tardando. Comprueba que tienes acceso a la red y vuelve a intentar.';
      if (retry) retry.hidden = false;
    }
  }, 12000);
  window.addEventListener('app-mounted', () => window.clearTimeout(timer), { once: true });
})();
