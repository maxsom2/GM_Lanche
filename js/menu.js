document.addEventListener('DOMContentLoaded', async () => {
  const list = document.getElementById('menu-list');
  const status = document.getElementById('menu-status');
  const notice = document.getElementById('connection-notice');
  const search = document.getElementById('menu-search');
  const filterButtons = [...document.querySelectorAll('[data-filter]')];
  if (!list) return;

  let products = window.GM_FALLBACK_MENU || [];
  let activeFilter = 'all';
  let storeOpen = true;
  let usingPreview = true;

  if (window.gmSupabaseReady && window.GMData) {
    const [{ data, error }, { data: openData, error: openError }] = await Promise.all([
      window.GMData.getMenu(),
      window.GMData.isStoreOpen()
    ]);
    if (!error && Array.isArray(data) && data.length) {
      products = data;
      usingPreview = false;
    } else {
      notice.hidden = false;
      notice.textContent = `Não foi possível carregar o cardápio do banco. Exibimos a prévia para você não ficar sem ver os lanches. ${error?.message || ''}`;
    }
    if (!openError) storeOpen = openData === true;
    else {
      storeOpen = false;
      const extra = 'Não foi possível confirmar o horário de funcionamento. Os pedidos estão temporariamente bloqueados.';
      notice.hidden = false;
      notice.textContent = `${notice.textContent ? notice.textContent + ' ' : ''}${extra}`;
    }
  } else {
    notice.hidden = false;
    notice.textContent = 'Modo de demonstração: você pode testar a busca, a personalização e o carrinho. Pedidos reais só serão enviados depois da conexão com o Supabase.';
    storeOpen = false;
  }

  if (!storeOpen && !usingPreview) {
    status.textContent = 'A loja está fechada ou não foi possível confirmar o horário. O cardápio continua disponível para consulta.';
  } else if (usingPreview) {
    status.textContent = `${products.length} opções de demonstração. Você pode testar o carrinho, mas ainda não enviar pedidos reais.`;
  } else {
    status.textContent = `${products.length} opções no cardápio. A loja está recebendo pedidos.`;
  }

  const categoryFor = product => ['lanche','bebida','combo'].includes(product.product_category) ? product.product_category : 'lanche';
  const matches = (product, query) => {
    if (!query) return true;
    const ingredients = (product.ingredients || []).map(item => typeof item === 'string' ? item : item.name).join(' ');
    return `${product.name} ${product.description || ''} ${ingredients}`.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .includes(query.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
  };

  function render() {
    const query = (search?.value || '').trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const visible = products.filter(product => {
      const byFilter = activeFilter === 'all' || categoryFor(product) === activeFilter;
      return byFilter && matches(product, query);
    });
    status.textContent = `${visible.length} ${visible.length === 1 ? 'opção encontrada' : 'opções encontradas'}${usingPreview ? ' · prévia local' : ' · cardápio conectado'}`;
    if (!visible.length) {
      list.innerHTML = '<div class="product-empty">Não encontramos lanches com esse termo. Experimente outra busca ou selecione “Todos”.</div>';
      return;
    }
    list.innerHTML = visible.map(product => {
      const ingredients = (product.ingredients || []).map(item => typeof item === 'string' ? { id: '', name: item } : item);
      const available = product.is_available !== false;
      const category = categoryFor(product);
      const fallbackImage = category === 'bebida' ? 'assets/bebida-placeholder.svg' : category === 'combo' ? 'assets/combo-placeholder.svg' : GM.productImage(product.slug);
      const image = product.image_url || fallbackImage;
      const tag = product.slug === 'big-duplo-especial' ? 'Destaque da casa' : category === 'bebida' ? 'Bebida' : category === 'combo' ? 'Combo' : product.slug === 'duplo' || product.slug === 'especial' ? 'Mais completo' : '';
      const canCustomize = category === 'lanche' && ingredients.length > 0;
      return `<article class="product-card product-card-${category}" id="${GM.escape(product.slug)}">
        <div class="product-visual"><img src="${GM.escape(image)}" alt="${category === 'bebida' ? 'Imagem ilustrativa da bebida' : category === 'combo' ? 'Imagem ilustrativa do combo' : 'Imagem ilustrativa do lanche'} ${GM.escape(product.name)}" loading="lazy" onerror="this.onerror=null;this.src='${fallbackImage}'"></div>
        <div class="product-info">
          ${tag ? `<span class="product-tag">${tag}</span>` : ''}
          <h3>${GM.escape(product.name)}</h3><p>${GM.escape(product.description || '')}</p>
          <div class="price">${GM.money(product.price)}</div>
          ${canCustomize ? `<details class="product-options"><summary>Personalizar e retirar ingredientes</summary>
            <div class="ingredient-list">${ingredients.map(item => `<label class="checkline"><input type="checkbox" data-remove-id="${GM.escape(item.id || '')}" data-remove-name="${GM.escape(item.name)}"> Sem ${GM.escape(item.name)}</label>`).join('')}</div>
            <label class="checkline" style="margin-top:12px;display:grid">Observação<textarea data-item-note rows="2" maxlength="200" placeholder="Ex.: cortar ao meio (opcional)"></textarea></label>
          </details>` : '<p class="product-simple-note">' + (category === 'bebida' ? 'Bebida gelada para acompanhar seu pedido.' : category === 'combo' ? 'Uma opção completa para sua refeição.' : '') + '</p>'}
          <div class="product-bottom"><span class="muted">${!available ? 'Indisponível' : usingPreview ? 'Prévia local' : !storeOpen ? 'Loja fechada' : 'Disponível'}</span>
            <button class="btn btn-primary" type="button" data-add="${GM.escape(product.id)}" ${!available || (!storeOpen && !usingPreview) ? 'disabled' : ''}>Adicionar</button>
          </div>
        </div>
      </article>`;
    }).join('');
  }

  filterButtons.forEach(button => button.addEventListener('click', () => {
    activeFilter = button.dataset.filter || 'all';
    filterButtons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    render();
  }));
  search?.addEventListener('input', render);

  list.addEventListener('click', event => {
    const button = event.target.closest('[data-add]');
    if (!button) return;
    const product = products.find(item => String(item.id) === button.dataset.add);
    if (!product) return;
    const card = button.closest('.product-card');
    const removed = [...card.querySelectorAll('[data-remove-id]:checked')].map(input => ({ id: input.dataset.removeId, name: input.dataset.removeName }));
    const note = card.querySelector('[data-item-note]')?.value?.trim() || '';
    const cart = GM.cart();
    const signature = [product.id, removed.map(item => item.id || item.name).sort().join(','), note].join('|');
    const existing = cart.find(item => item.signature === signature);
    if (existing) existing.quantity = Math.min(20, Number(existing.quantity || 1) + 1);
    else cart.push({
      signature,
      product_id: product.id,
      product_name: product.name,
      price: Number(product.price),
      quantity: 1,
      removed_ingredient_ids: removed.filter(item => item.id && !String(item.id).startsWith('preview-')).map(item => item.id),
      removed_ingredient_names: removed.map(item => item.name),
      notes: note,
      image_url: product.image_url || (categoryFor(product) === 'bebida' ? 'assets/bebida-placeholder.svg' : categoryFor(product) === 'combo' ? 'assets/combo-placeholder.svg' : GM.productImage(product.slug))
    });
    GM.saveCart(cart);
    button.textContent = usingPreview ? 'Na prévia ✓' : 'Adicionado ✓';
    button.setAttribute('aria-live', 'polite');
    window.setTimeout(() => { button.textContent = 'Adicionar'; }, 1100);
  });

  render();
  if (location.hash) {
    window.setTimeout(() => document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120);
  }
});
