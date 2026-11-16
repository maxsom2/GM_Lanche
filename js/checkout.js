document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('checkout-form');
  if (!form) return;
  const notice = document.getElementById('checkout-notice');
  const summary = document.getElementById('checkout-summary');
  const delivery = document.getElementById('delivery-fields');
  const success = document.getElementById('order-success');
  const submitButton = document.getElementById('submit-order');
  const cart = GM.cart();
  const show = message => { notice.hidden = false; notice.textContent = message; };
  const subtotal = cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
  const neighborhoodSelect = form.elements.neighborhood_id;
  const addressField = form.elements.address;
  let neighborhoods = [];
  let storeOpen = false;

  function updateSummary() {
    const isDelivery = form.elements.order_type.value === 'delivery';
    const selected = neighborhoods.find(item => item.id === neighborhoodSelect?.value);
    const fee = isDelivery && selected ? Number(selected.delivery_fee || 0) : 0;
    summary.innerHTML = (cart.length
      ? cart.map(item => `<div class="summary-row"><span>${Number(item.quantity)}× ${GM.escape(item.product_name)}</span><strong>${GM.money(Number(item.price) * Number(item.quantity))}</strong></div>`).join('')
      : '<p class="muted">O carrinho está vazio.</p>') +
      `<div class="summary-row"><span>Subtotal</span><strong>${GM.money(subtotal)}</strong></div>` +
      `<div class="summary-row"><span>Taxa de entrega</span><strong>${isDelivery && selected ? GM.money(fee) : isDelivery ? 'Selecione o bairro' : GM.money(0)}</strong></div>` +
      `<div class="summary-row summary-total"><span>Total estimado</span><strong>${GM.money(subtotal + fee)}</strong></div>`;
  }

  const isDeliverySelected = () => form.querySelector('[name="order_type"]:checked')?.value === 'delivery';
  const updateDeliveryFields = () => {
    const deliveryMode = isDeliverySelected();
    delivery.hidden = !deliveryMode;
    neighborhoodSelect.required = deliveryMode;
    addressField.required = deliveryMode;
    updateSummary();
  };

  if (!cart.length) {
    submitButton.disabled = true;
    show('Adicione pelo menos um lanche ao carrinho antes de finalizar.');
  }

  form.querySelectorAll('[name="order_type"]').forEach(radio => radio.addEventListener('change', updateDeliveryFields));
  neighborhoodSelect?.addEventListener('change', updateSummary);
  updateDeliveryFields();

  if (window.gmSupabaseReady && window.GMData) {
    const [{ data, error }, { data: openData, error: openError }] = await Promise.all([
      window.GMData.getNeighborhoods({ activeOnly: true }),
      window.GMData.isStoreOpen()
    ]);
    if (!error && Array.isArray(data)) {
      neighborhoods = data;
      neighborhoodSelect.innerHTML = '<option value="">Selecione seu bairro</option>' + data.map(item => `<option value="${item.id}">${GM.escape(item.name)} — ${GM.money(item.delivery_fee)}</option>`).join('');
    } else {
      show(`Não foi possível carregar os bairros da tabela neighborhoods. ${error?.message || ''}`);
    }
    if (!openError) {
      storeOpen = openData === true;
      if (!storeOpen) {
        submitButton.disabled = true;
        show('A loja está fechada para novos pedidos neste horário. Você pode consultar o cardápio e tentar novamente durante o funcionamento.');
      }
    } else {
      submitButton.disabled = true;
      show('Não foi possível confirmar se a loja está aberta. Por segurança, o envio de pedidos está bloqueado.');
    }
  } else {
    show('Modo de demonstração. O carrinho funciona localmente, mas o envio de pedidos reais será ativado após configurar o Supabase em js/config.js.');
  }
  updateSummary();

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!cart.length) { show('Seu carrinho está vazio.'); return; }
    if (!window.gmSupabaseReady) { show('O Supabase ainda não está configurado. Seu pedido não foi enviado.'); return; }
    if (!storeOpen) { show('A loja está fechada ou não foi possível confirmar o horário. Nenhum pedido foi enviado.'); return; }
    if (isDeliverySelected()) {
      if (!neighborhoodSelect.value) { show('Selecione o bairro para calcular a taxa de entrega.'); neighborhoodSelect.focus(); return; }
      if (addressField.value.trim().length < 5) { show('Informe o endereço completo para entrega.'); addressField.focus(); return; }
    }

    const formData = new FormData(form);
    const items = cart.map(item => ({
      product_id: item.product_id,
      quantity: Number(item.quantity),
      removed_ingredient_ids: item.removed_ingredient_ids || [],
      notes: item.notes || ''
    }));
    if (items.some(item => !item.product_id || String(item.product_id).startsWith('preview-'))) {
      show('O carrinho contém itens adicionados no modo de demonstração. Remova-os, carregue o cardápio conectado ao Supabase e adicione novamente os produtos antes de enviar um pedido real.');
      return;
    }

    const phoneDigits = String(formData.get('phone') || '').replace(/\D/g, '');
    if (phoneDigits.length < 10 || phoneDigits.length > 13) { show('Informe um telefone válido com DDD.'); form.elements.phone.focus(); return; }

    const payload = {
      name: String(formData.get('name') || '').trim(),
      phone: String(formData.get('phone') || '').trim(),
      email: String(formData.get('email') || '').trim() || null,
      order_type: formData.get('order_type'),
      payment_method: formData.get('payment_method'),
      items,
      notes: String(formData.get('notes') || '').trim() || null,
      neighborhood_id: isDeliverySelected() ? neighborhoodSelect.value : null,
      address: isDeliverySelected() ? String(addressField.value || '').trim() : null
    };
    if (payload.name.length < 2) { show('Informe seu nome completo.'); form.elements.name.focus(); return; }

    submitButton.disabled = true;
    const previousText = submitButton.textContent;
    submitButton.textContent = 'Enviando pedido…';
    const { data, error } = await window.gmSupabase.rpc('create_order', { p_payload: payload });
    submitButton.disabled = false;
    submitButton.textContent = previousText;

    if (error) { show(error.message || 'Não foi possível enviar o pedido.'); return; }
    GM.saveCart([]);
    form.hidden = true;
    success.hidden = false;
    success.innerHTML = `<h2>Pedido recebido!</h2><p>Seu número de pedido é <strong>#${GM.escape(data.order_number)}</strong>.</p><p>Total confirmado pelo banco: <strong>${GM.money(data.total)}</strong></p><p>Guarde o número e use seu telefone para acompanhar o andamento.</p><a class="btn btn-primary" href="acompanhar.html">Acompanhar pedido</a>`;
    success.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
});
