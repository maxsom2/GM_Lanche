document.addEventListener('DOMContentLoaded', () => {
  const host = document.getElementById('cart-content');
  if (!host) return;

  const render = () => {
    const cart = GM.cart();
    if (!cart.length) {
      host.innerHTML = '<div class="empty-state">Seu carrinho está vazio.<br><a class="text-link" href="cardapio.html">Ir para o cardápio →</a></div>';
      return;
    }
    const subtotal = cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
    host.innerHTML = `<div class="cart-list">${cart.map((item, index) => `
      <article class="cart-item">
        <div class="cart-item-main">
          <img class="cart-item-photo" src="${GM.escape(item.image_url || GM.productImage(item.product_id?.startsWith('preview-') ? item.product_id.replace('preview-','') : 'hamburguer-destaque'))}" alt="Imagem ilustrativa de ${GM.escape(item.product_name)}" loading="lazy">
          <div><h3>${GM.escape(item.product_name)}</h3>
            <p>${item.removed_ingredient_names?.length ? 'Sem: ' + item.removed_ingredient_names.map(GM.escape).join(', ') : 'Ingredientes originais'}${item.notes ? ' · ' + GM.escape(item.notes) : ''}</p>
            <strong>${GM.money(Number(item.price) * Number(item.quantity))}</strong>
          </div>
        </div>
        <div class="cart-controls"><button class="qty-btn" type="button" data-minus="${index}" aria-label="Diminuir quantidade">−</button><strong>${item.quantity}</strong><button class="qty-btn" type="button" data-plus="${index}" aria-label="Aumentar quantidade">+</button><button class="btn btn-small btn-ghost" type="button" data-remove="${index}">Remover</button></div>
      </article>`).join('')}</div>
      <aside class="cart-total-card"><h2>Resumo do pedido</h2><div class="summary-row"><span>Subtotal</span><strong>${GM.money(subtotal)}</strong></div><div class="summary-row"><span>Entrega</span><span>Calculada na finalização</span></div><div class="summary-row summary-total"><span>Total parcial</span><strong>${GM.money(subtotal)}</strong></div><a class="btn btn-primary btn-wide" style="margin-top:15px" href="finalizar.html">Continuar para finalizar</a><a class="text-link" style="display:block;text-align:center;margin-top:14px" href="cardapio.html">Adicionar mais lanches</a></aside>`;
  };

  host.addEventListener('click', event => {
    const button = event.target.closest('[data-minus],[data-plus],[data-remove]');
    if (!button) return;
    const index = Number(button.dataset.minus ?? button.dataset.plus ?? button.dataset.remove);
    const cart = GM.cart();
    if (!Number.isInteger(index) || !cart[index]) return;
    if (button.hasAttribute('data-minus')) cart[index].quantity = Math.max(1, Number(cart[index].quantity || 1) - 1);
    if (button.hasAttribute('data-plus')) cart[index].quantity = Math.min(20, Number(cart[index].quantity || 1) + 1);
    if (button.hasAttribute('data-remove')) cart.splice(index, 1);
    GM.saveCart(cart);
    render();
  });
  render();
});
