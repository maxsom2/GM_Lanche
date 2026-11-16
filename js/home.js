document.addEventListener('DOMContentLoaded', async () => {
  const host = document.getElementById('featured-products');
  const status = document.getElementById('store-status');
  const recommendation = document.getElementById('house-recommendation');
  if (!host) return;

  let products = window.GM_FALLBACK_MENU || [];
  if (window.gmSupabaseReady && window.GMData) {
    const [{ data: menu, error: menuError }, { data: isOpen, error: hoursError }] = await Promise.all([
      window.GMData.getMenu(),
      window.GMData.isStoreOpen()
    ]);
    if (!menuError && Array.isArray(menu) && menu.length) products = menu;
    status.textContent = hoursError
      ? 'Não foi possível confirmar o horário da loja. O cardápio continua disponível para consulta.'
      : (isOpen ? 'A loja está recebendo pedidos.' : 'A loja está fechada para novos pedidos no momento.');
  } else {
    status.textContent = 'Prévia do site. Configure a chave pública do Supabase para ativar pedidos reais entre dispositivos.';
  }

  const recommended = products.find(product => product.slug === 'big-duplo-especial');
  if (recommended && recommendation) {
    const image = recommendation.querySelector('.recommendation-image');
    if (image) image.src = recommended.image_url || GM.productImage(recommended.slug);
    const price = recommendation.querySelector('[data-recommendation-price]');
    if (price) price.textContent = GM.money(recommended.price);
    const title = recommendation.querySelector('h2');
    if (title) title.textContent = recommended.name;
    const description = recommendation.querySelector('.recommendation-description');
    if (description) description.textContent = recommended.description || 'Dois hambúrgueres, dois ovos e todos os ingredientes em dobro.';
  }

  host.innerHTML = products.filter(product => product.is_listed !== false).slice(0, 3).map(product => `
    <article class="product-card">
      <div class="product-visual"><img src="${GM.escape(product.image_url || GM.productImage(product.slug))}" alt="Imagem ilustrativa de ${GM.escape(product.name)}" loading="lazy"></div>
      <div class="product-info"><h3>${GM.escape(product.name)}</h3><p>${GM.escape(product.description || '')}</p>
        <div class="product-bottom"><span class="price">${GM.money(product.price)}</span><a class="btn btn-ghost" href="cardapio.html#${GM.escape(product.slug)}">Ver lanche</a></div>
      </div>
    </article>`).join('');
});
