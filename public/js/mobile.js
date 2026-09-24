(() => {
  const isMobile = () => matchMedia('(pointer:coarse), (max-width:700px)').matches;
  const isApp = () => matchMedia('(display-mode:standalone), (display-mode:fullscreen)').matches || navigator.standalone;
  const updateViewport = () => document.documentElement.style.setProperty('--visible-height', `${Math.round(visualViewport?.height || innerHeight)}px`);
  updateViewport();
  addEventListener('resize', updateViewport);
  window.visualViewport?.addEventListener('resize', updateViewport);
  document.addEventListener('fullscreenchange', updateViewport);
  const mode = document.createElement('button');
  mode.id = 'app-mode'; mode.textContent = 'Instalare / ⛶'; mode.setAttribute('aria-label','Instalează aplicația sau deschide ecran complet');
  document.body.append(mode);
  const dialog = document.createElement('dialog');
  dialog.id = 'app-install-dialog';
  dialog.innerHTML = '<h3>Joacă pe tot ecranul</h3><p id="install-help">Instalează Trivia Arena pentru a o deschide direct din iconiță, fără bara de adrese.</p><button id="install-native">Instalează aplicația</button><button id="enter-fullscreen">Ecran complet</button><button class="dismiss">Mai târziu</button>';
  document.body.append(dialog);
  let installPrompt = null;
  const install = dialog.querySelector('#install-native');
  const fullscreen = dialog.querySelector('#enter-fullscreen');
  const help = dialog.querySelector('#install-help');
  function refresh() {
    mode.hidden = !isMobile() || isApp() || !!document.fullscreenElement;
    install.hidden = !installPrompt;
    fullscreen.hidden = !document.documentElement.requestFullscreen || !document.fullscreenEnabled;
    help.textContent = installPrompt ? 'Instalează Trivia Arena și deschide-o din iconița de pe ecranul principal, fără bara de adrese.' : /iPad|iPhone|iPod/.test(navigator.userAgent) ? 'În Safari: Partajează → Adaugă la ecranul principal. Apoi deschide jocul din iconiță.' : 'În meniul browserului ⋮ alege „Instalează aplicația” sau „Adaugă la ecranul principal”, apoi deschide jocul din iconiță. Poți folosi și Ecran complet aici.';
  }
  mode.onclick = () => { refresh(); dialog.showModal(); };
  dialog.querySelector('.dismiss').onclick = () => dialog.close();
  fullscreen.onclick = async () => {
    try { await document.documentElement.requestFullscreen({navigationUI:'hide'}); dialog.close(); }
    catch { help.textContent = 'Browserul nu a permis ecranul complet. Instalează aplicația din meniul browserului și deschide-o din iconiță.'; }
    refresh();
  };
  install.onclick = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    installPrompt = null;
    if (choice.outcome === 'accepted') dialog.close();
    refresh();
  };
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; refresh(); });
  addEventListener('appinstalled', () => { installPrompt = null; dialog.close(); mode.hidden = true; });
  addEventListener('resize', refresh);
  document.addEventListener('fullscreenchange', refresh);
  refresh();
  if (isMobile() && !isApp() && !sessionStorage.getItem('install-hint-seen')) {
    sessionStorage.setItem('install-hint-seen','1');
    dialog.showModal();
  }
})();
