(() => {
  const logo = 'assets/logo-gm-lanches-oficial.jpg';
  const current = location.pathname.split('/').pop() || 'index.html';
  const pageNames = {
    'index.html': 'Início',
    'cardapio.html': 'Cardápio',
    'carrinho.html': 'Carrinho',
    'finalizar.html': 'Finalizar pedido',
    'acompanhar.html': 'Acompanhar pedido',
    'conta.html': 'Minha conta',
    'admin.html': 'Área da equipe'
  };
  const title = pageNames[current] || 'GM Lanches';
  const header = document.getElementById('site-header');

  const links = [
    { href: 'index.html', icon: '⌂', label: 'Início', group: 'LOJA' },
    { href: 'cardapio.html', icon: '☷', label: 'Cardápio' },
    { href: 'carrinho.html', icon: '🛒', label: 'Carrinho', count: true },
    { href: 'acompanhar.html', icon: '◷', label: 'Acompanhar pedido' },
    { href: 'conta.html', icon: '◉', label: 'Minha conta', group: 'CONTA' },
    { href: 'admin.html', icon: '⚙', label: 'Área da equipe', group: 'GESTÃO' }
  ];

  if (header) {
    header.innerHTML = `
      <div class="sidebar-overlay" id="sidebar-overlay" hidden></div>
      <aside class="app-sidebar" id="app-sidebar" aria-label="Menu principal">
        <div class="sidebar-brand">
          <a class="sidebar-logo" href="index.html" title="GM Lanches — início">
            <img src="${logo}" alt="Logo oficial GM Lanches">
          </a>
          <div class="sidebar-brand-copy"><strong>GM Lanches</strong><span>Cardápio & pedidos</span></div>
          <button class="sidebar-close" id="sidebar-close" type="button" aria-label="Fechar menu">×</button>
        </div>
        <div class="sidebar-scroll">
          <nav class="sidebar-nav" aria-label="Páginas">
            ${links.map((item, index) => `${item.group ? `<div class="sidebar-group-label">${item.group}</div>` : ''}
              <a class="sidebar-link" href="${item.href}" ${current === item.href ? 'aria-current="page"' : ''} title="${item.label}">
                <span class="sidebar-icon" aria-hidden="true">${item.icon}</span>
                <span class="sidebar-link-text">${item.label}</span>
                ${item.count ? '<span class="sidebar-count cart-count" data-cart-count>0</span>' : ''}
              </a>`).join('')}
          </nav>
        </div>
        <div class="sidebar-bottom">
          <div class="sidebar-promo"><span class="promo-dot"></span><div><strong>Sabor em cada mordida</strong><small>Seu próximo lanche está aqui.</small></div></div>
          <span class="sidebar-version">GM LANCHES · PEDIDOS</span>
        </div>
      </aside>
      <header class="site-topbar">
        <div class="topbar-left">
          <button class="sidebar-toggle" id="sidebar-toggle" type="button" aria-label="Abrir menu" aria-expanded="false" aria-controls="app-sidebar"><span></span><span></span><span></span></button>
          <a class="topbar-mobile-brand" href="index.html" aria-label="Página inicial"><img src="${logo}" alt="Logo GM Lanches"></a>
          ${current !== 'index.html' ? '<button class="back-button" id="page-back" type="button"><span aria-hidden="true">←</span><span>Voltar</span></button>' : ''}
          <div class="topbar-page"><span class="topbar-kicker">GM LANCHES</span><strong>${title}</strong></div>
        </div>
        <div class="topbar-actions">
          <a class="topbar-cart" href="carrinho.html" aria-label="Abrir carrinho">🛒 <span class="topbar-cart-label">Carrinho</span><b class="cart-count" data-cart-count>0</b></a>
        </div>
      </header>`;

    const toggle = header.querySelector('#sidebar-toggle');
    const closeButton = header.querySelector('#sidebar-close');
    const overlay = header.querySelector('#sidebar-overlay');
    const sidebar = header.querySelector('#app-sidebar');
    const isMobile = () => window.matchMedia('(max-width: 820px)').matches;

    const openMobile = () => {
      document.body.classList.add('mobile-sidebar-open');
      overlay.hidden = false;
      toggle?.setAttribute('aria-expanded', 'true');
      toggle?.setAttribute('aria-label', 'Fechar menu');
    };
    const closeMobile = () => {
      document.body.classList.remove('mobile-sidebar-open');
      overlay.hidden = true;
      toggle?.setAttribute('aria-expanded', 'false');
      toggle?.setAttribute('aria-label', 'Abrir menu');
    };

    let collapsed = false;
    try { collapsed = localStorage.getItem('gm_sidebar_collapsed') === 'true'; } catch { /* localStorage indisponível */ }
    if (collapsed && !isMobile()) document.body.classList.add('sidebar-collapsed');

    toggle?.addEventListener('click', () => {
      if (isMobile()) {
        document.body.classList.contains('mobile-sidebar-open') ? closeMobile() : openMobile();
      } else {
        collapsed = !document.body.classList.contains('sidebar-collapsed');
        document.body.classList.toggle('sidebar-collapsed', collapsed);
        try { localStorage.setItem('gm_sidebar_collapsed', String(collapsed)); } catch { /* preferência opcional */ }
      }
    });
    closeButton?.addEventListener('click', closeMobile);
    overlay?.addEventListener('click', closeMobile);
    sidebar?.querySelectorAll('.sidebar-link').forEach(link => link.addEventListener('click', () => {
      if (isMobile()) closeMobile();
    }));
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMobile(); });
    window.addEventListener('resize', () => { if (!isMobile()) closeMobile(); });

    header.querySelector('#page-back')?.addEventListener('click', () => {
      const sameSite = document.referrer && (() => {
        try { return new URL(document.referrer).origin === location.origin; } catch { return false; }
      })();
      if (sameSite && history.length > 1) history.back();
      else location.href = 'index.html';
    });
  }

  const footer = document.getElementById('site-footer');
  if (footer) {
    footer.innerHTML = `
      <footer class="site-footer"><div class="container footer-inner">
        <a class="footer-brand" href="index.html" aria-label="Página inicial"><img src="${logo}" alt="Logo oficial GM Lanches"></a>
        <div class="footer-main"><strong>GM Lanches</strong><p class="footer-copy">Sabor, qualidade e muito mais em cada mordida.</p><nav class="footer-links" aria-label="Links do rodapé"><a href="index.html">Início</a><a href="cardapio.html">Cardápio</a><a href="carrinho.html">Carrinho</a><a href="acompanhar.html">Acompanhar pedido</a><a href="admin.html">Área da equipe</a></nav></div>
        <a class="footer-to-top" href="#top" aria-label="Voltar ao topo">↑</a>
      </div></footer>`;
  }

  const money = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const cart = () => { try { return JSON.parse(localStorage.getItem('gm_cart') || '[]'); } catch { return []; } };
  const updateCartCount = () => {
    const count = cart().reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    document.querySelectorAll('[data-cart-count]').forEach(el => { el.textContent = count; });
  };
  const saveCart = value => { try { localStorage.setItem('gm_cart', JSON.stringify(value)); } catch { /* informar na tela de carrinho */ } updateCartCount(); };
  const productImage = slug => `assets/products/${({
    'simples':'simples','duplo':'duplo','x-calabresa':'x-calabresa','x-bacon':'x-bacon',
    'x-frango':'x-frango','especial':'especial','big-duplo-especial':'big-duplo-especial'
  })[slug] || 'hamburguer-destaque'}.webp`;

  window.GM = { money, escape, cart, saveCart, updateCartCount, productImage };
  updateCartCount();
})();
