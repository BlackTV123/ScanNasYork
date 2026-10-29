/** Shared native-dialog navigation: modal focus handling, Escape and backdrop dismissal. */
(function () {
  'use strict';
  const toggles = [...document.querySelectorAll('[data-sidebar-toggle]')];
  if (!toggles.length) return;
  const sidebar = document.createElement('dialog');
  sidebar.id = 'site-sidebar';
  sidebar.className = 'site-sidebar';
  sidebar.setAttribute('aria-labelledby', 'site-sidebar-title');
  const menuIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
  const icons = {
    home: '<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',
    stocks: '<path d="M4 20V4m0 16h16M8 15l4-5 4 2 4-7"/>',
    forex: '<path d="M4 7h16l-4-4M20 17H4l4 4M8 4v6m8 4v6"/>',
  };
  const destinations = [
    { href: '/', name: 'Home', description: 'Overview and workflow', icon: icons.home },
    { href: '/screener.html', name: 'Screener', description: 'Find and compare stocks', icon: icons.stocks },
    { href: '/forex.html', name: 'Forex', description: 'Currencies, gold and oil', icon: icons.forex },
  ];
  const current = location.pathname === '/stock.html' ? '/screener.html' : ['/home.html', '/index.html'].includes(location.pathname) ? '/' : location.pathname;
  sidebar.innerHTML = `<div class="site-sidebar-header"><a class="site-sidebar-brand" href="/"><span class="site-sidebar-mark" aria-hidden="true">SN</span>ScanNasYork</a><button type="button" class="site-sidebar-close" aria-label="Close navigation" autofocus><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg></button></div><h2 id="site-sidebar-title">Your workspace</h2><nav aria-label="Workspace">${destinations.map(item => `<a class="site-sidebar-link" href="${item.href}"${item.href === current ? ' aria-current="page"' : ''}><svg viewBox="0 0 24 24" aria-hidden="true">${item.icon}</svg><span><strong>${item.name}</strong><small>${item.description}</small></span></a>`).join('')}</nav><div class="site-sidebar-footer"><a href="/#workflow">How it works</a></div>`;
  document.body.append(sidebar);
  let opener;
  toggles.forEach(button => {
    button.innerHTML = menuIcon + '<span>Menu</span>';
    button.setAttribute('aria-controls', sidebar.id);
    button.setAttribute('title', 'Open navigation');
    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('click', () => {
      if (sidebar.open) { sidebar.close(); return; }
      opener = button;
      sidebar.showModal();
      toggles.forEach(toggle => toggle.setAttribute('aria-expanded', 'true'));
    });
  });
  sidebar.querySelector('.site-sidebar-close').addEventListener('click', () => sidebar.close());
  sidebar.addEventListener('click', event => {
    const bounds = sidebar.getBoundingClientRect();
    if (event.target === sidebar && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) sidebar.close();
    if (event.target.closest('a')) sidebar.close();
  });
  sidebar.addEventListener('close', () => {
    toggles.forEach(toggle => toggle.setAttribute('aria-expanded', 'false'));
    opener?.focus({ preventScroll: true });
  });
})();
