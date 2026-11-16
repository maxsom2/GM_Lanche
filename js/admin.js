document.addEventListener('DOMContentLoaded', () => {
  const login = document.getElementById('admin-login');
  const panel = document.getElementById('admin-panel');
  const message = document.getElementById('admin-message');
  if (!login || !panel || !message) return;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const note = text => {
    message.hidden = false;
    message.textContent = text;
    message.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  const money = value => GM.money(Number(value || 0));
  const escape = value => GM.escape(value);

  const statusLabels = {
    received: 'Recebido', confirmed: 'Confirmado', preparing: 'Em preparo',
    ready: 'Pronto para retirada', out_for_delivery: 'Saiu para entrega',
    completed: 'Concluído', cancelled: 'Cancelado'
  };
  const paymentLabels = { pix: 'Pix', cash: 'Dinheiro', card_machine: 'Cartão na maquininha' };

  // Relação de referência montada com os bairros urbanos citados durante o planejamento.
  // O conteúdo do Supabase continua sendo a fonte dos registros já cadastrados.
  // Variações conhecidas de escrita são agrupadas para evitar sugestões duplicadas.
  const referenceNeighborhoods = [
    'Aroldo Fanaia', 'Betel', 'Carrapatinho', 'Cavalhada I', 'Cavalhada II',
    'Cavalhada III', 'Centro', 'Cidade Alta', 'Cidade Nova', 'Cohab Nova',
    'Cohab Velha', 'DNER', 'Distrito Industrial', 'Espírito Santo', 'Garcês',
    'Jardim Aeroporto', 'Jardim Celeste', 'Jardim Cidade Nova',
    'Jardim das Oliveiras', 'Jardim do Trevo', 'Jardim Guanabara',
    'Jardim Imperial', 'Jardim Marajoara', 'Jardim Padre Paulo',
    'Jardim Panorama', 'Jardim Paraíso', 'Jardim Planalto', 'Jardim São Luiz',
    'Jardim Solução', 'Jardim União', 'Joaquim Murtinho', 'Junco', 'Lavapés',
    'Lobo', 'Maracanãzinho', 'Massa Barro', 'Monte Verde', 'Nova Era',
    'Olhos D’Água', 'Residencial Aroldo Fanaia', 'Rodeio', 'Santa Cruz',
    'Santa Isabel', 'Santa Izabel', 'Santa Rosa', 'Santo Antônio',
    'Santos Dumont', 'São Jorge', 'São Lourenço', 'São Miguel', 'Vila Irene',
    'Vila Mariana', 'Vila Nova', 'Vila Real', 'Vitória Régia'
  ];

  const normalize = value => String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  const canonicalNeighborhood = value => {
    const key = normalize(value);
    const aliases = {
      'santa izabel': 'santa isabel',
      'residencial aroldo fanaia': 'aroldo fanaia',
      'jardim sao luiz da ponte': 'jardim sao luiz'
    };
    return aliases[key] || key;
  };
  const uniqueReferenceNeighborhoods = [...referenceNeighborhoods.reduce((map, name) => {
    const key = canonicalNeighborhood(name);
    if (!map.has(key)) map.set(key, name);
    return map;
  }, new Map()).values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));

  let neighborhoodsCache = [];
  let neighborhoodsLoaded = false;
  let ordersCache = [];
  let productsCache = [];

  login.addEventListener('submit', event => event.preventDefault());
  if (!window.gmSupabaseReady) {
    note('Configure a chave pública do Supabase em js/config.js. O painel exige uma conta autorizada em staff_members.');
    return;
  }

  function activateTab(tabName) {
    const validTabs = ['overview', 'orders', 'products', 'delivery', 'hours', 'reports'];
    const active = validTabs.includes(tabName) ? tabName : 'overview';
    $$('.admin-nav-item', panel).forEach(button => {
      const selected = button.dataset.tab === active;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-current', selected ? 'page' : 'false');
    });
    $$('.admin-view', panel).forEach(section => section.classList.toggle('active', section.id === `tab-${active}`));
    try { sessionStorage.setItem('gm_admin_tab', active); } catch { /* preferência opcional */ }
  }

  function updateSummary() {
    const activeNeighborhoods = neighborhoodsCache.filter(item => item.is_active).length;
    const registeredKeys = new Set(neighborhoodsCache.map(item => canonicalNeighborhood(item.name)));
    const missing = neighborhoodsLoaded ? uniqueReferenceNeighborhoods.filter(name => !registeredKeys.has(canonicalNeighborhood(name))).length : null;
    $('#summary-orders').textContent = String(ordersCache.length);
    $('#summary-products').textContent = String(productsCache.length);
    $('#summary-neighborhoods').textContent = String(neighborhoodsCache.length);
    $('#summary-neighborhoods-note').textContent = `${activeNeighborhoods} ativos para entrega`;
    $('#neighborhood-total').textContent = String(neighborhoodsCache.length);
    $('#neighborhood-active').textContent = String(activeNeighborhoods);
    $('#neighborhood-missing').textContent = missing === null ? '—' : String(missing);
    $('#reference-missing-count').textContent = missing === null ? '—' : String(missing);
    $('#add-all-missing-neighborhoods').disabled = missing === null || missing === 0;
  }

  async function loadOrders() {
    const host = $('#admin-orders');
    host.innerHTML = '<p class="muted">Carregando pedidos…</p>';
    const { data, error } = await window.gmSupabase.from('orders')
      .select('*, order_items(*, order_item_removed_ingredients(ingredient_name_snapshot))')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) { host.textContent = `Não foi possível carregar os pedidos: ${error.message}`; return; }
    ordersCache = data || [];
    updateSummary();
    if (!ordersCache.length) { host.innerHTML = '<div class="empty-state">Nenhum pedido recebido.</div>'; return; }

    host.innerHTML = ordersCache.map(order => `
      <article class="admin-order">
        <div class="admin-order-head"><div>
          <h3>Pedido #${escape(order.order_number)} · ${escape(order.customer_name)}</h3>
          <p>${new Date(order.created_at).toLocaleString('pt-BR')} · ${order.order_type === 'delivery' ? 'Entrega' : 'Retirada'} · ${escape(order.customer_phone)}</p>
          <p>${escape(order.delivery_address || '')} ${order.neighborhood_name_snapshot ? '· ' + escape(order.neighborhood_name_snapshot) : ''}</p>
        </div><span class="status-pill">${statusLabels[order.status] || escape(order.status)}</span></div>
        <ul>${(order.order_items || []).map(item => `<li>${Number(item.quantity)}× ${escape(item.product_name_snapshot)} — ${money(item.line_total)}${item.order_item_removed_ingredients?.length ? ' · Sem ' + item.order_item_removed_ingredients.map(removed => escape(removed.ingredient_name_snapshot)).join(', ') : ''}${item.item_notes ? ' · ' + escape(item.item_notes) : ''}</li>`).join('')}</ul>
        <p>Pagamento: ${paymentLabels[order.payment_method] || escape(order.payment_method)} · ${order.payment_status === 'paid' ? 'Pago' : 'Pendente'} · Total: <strong>${money(order.total)}</strong></p>
        ${order.customer_notes ? `<p>Observações do cliente: ${escape(order.customer_notes)}</p>` : ''}${order.cancellation_requested ? '<p class="notice">O cliente solicitou o cancelamento deste pedido.</p>' : ''}
        <div class="admin-order-actions">
          <label>Status<select data-status="${order.id}">${Object.entries(statusLabels).map(([value, label]) => `<option value="${value}" ${value === order.status ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
          <label>Preparo (min)<input data-prep="${order.id}" type="number" min="1" max="360" value="${order.estimated_prep_minutes || 30}"></label>
          <button class="btn btn-primary btn-small" type="button" data-save-order="${order.id}">Salvar pedido</button>
          ${order.payment_status !== 'paid' ? `<button class="btn btn-ghost btn-small" type="button" data-paid="${order.id}">Marcar pago</button>` : ''}
          ${order.cancellation_requested ? `<button class="btn btn-ghost btn-small" type="button" data-cancel="${order.id}" data-decision="approved">Aprovar cancelamento</button><button class="btn btn-ghost btn-small" type="button" data-cancel="${order.id}" data-decision="denied">Recusar cancelamento</button>` : ''}
        </div>
      </article>`).join('');
  }

  async function loadProducts() {
    const host = $('#admin-products');
    host.innerHTML = '<p class="muted">Carregando cardápio…</p>';
    const { data, error } = await window.gmSupabase.from('products')
      .select('id,name,price,is_available,is_listed').order('display_order');
    if (error) { host.textContent = `Não foi possível carregar o cardápio: ${error.message}`; return; }
    productsCache = data || [];
    updateSummary();
    host.innerHTML = productsCache.map(product => `
      <article class="admin-product-row">
        <div class="admin-product-identity"><span class="admin-product-symbol">🍔</span><div><strong>${escape(product.name)}</strong><small>${product.is_listed ? 'Visível no cardápio' : 'Oculto do cardápio'}</small></div></div>
        <div class="admin-product-controls">
          <label>Preço (R$)<input data-price="${product.id}" type="number" min="0" step="0.01" value="${Number(product.price).toFixed(2)}"></label>
          <label>Disponibilidade<select data-available="${product.id}"><option value="true" ${product.is_available ? 'selected' : ''}>Disponível</option><option value="false" ${!product.is_available ? 'selected' : ''}>Indisponível</option></select></label>
          <button class="btn btn-primary btn-small" type="button" data-save-product="${product.id}">Salvar</button>
        </div>
      </article>`).join('') || '<div class="empty-state">Nenhum produto cadastrado.</div>';
  }

  function renderNeighborhoods() {
    const host = $('#neighborhood-list');
    const search = normalize($('#neighborhood-search').value);
    const filter = $('#neighborhood-filter').value;
    const rows = neighborhoodsCache.filter(item => {
      const matchesSearch = !search || normalize(item.name).includes(search);
      const matchesState = filter === 'all' || (filter === 'active' && item.is_active) || (filter === 'inactive' && !item.is_active);
      return matchesSearch && matchesState;
    });
    if (!rows.length) {
      host.innerHTML = '<div class="empty-state">Nenhum bairro corresponde à busca. Confira também a lista de referência ao lado.</div>';
      return;
    }
    host.innerHTML = rows.map(item => `
      <article class="admin-neighborhood-row ${item.is_active ? 'is-active' : 'is-inactive'}">
        <div class="admin-neighborhood-name"><strong>${escape(item.name)}</strong><span class="admin-state-pill ${item.is_active ? 'active' : 'inactive'}">${item.is_active ? 'Ativo no checkout' : 'Desativado'}</span></div>
        <div class="admin-neighborhood-controls">
          <label>Taxa de entrega<input data-neighbor-fee="${item.id}" type="number" min="0" step="0.01" value="${Number(item.delivery_fee || 0).toFixed(2)}"></label>
          <label>Status<select data-neighbor-active="${item.id}"><option value="true" ${item.is_active ? 'selected' : ''}>Ativo</option><option value="false" ${!item.is_active ? 'selected' : ''}>Desativado</option></select></label>
          <button class="btn btn-primary btn-small" type="button" data-save-neighborhood="${item.id}">Salvar</button>
        </div>
      </article>`).join('');
  }

  function renderReferenceNeighborhoods() {
    const host = $('#reference-neighborhoods');
    if (!neighborhoodsLoaded) {
      host.innerHTML = '<p class="reference-empty">Não foi possível confirmar os bairros do banco. Atualize a seção antes de cadastrar para evitar duplicatas.</p>';
      return;
    }
    const registered = new Set(neighborhoodsCache.map(item => canonicalNeighborhood(item.name)));
    const search = normalize($('#reference-search').value);
    const missing = uniqueReferenceNeighborhoods.filter(name => {
      const notRegistered = !registered.has(canonicalNeighborhood(name));
      return notRegistered && (!search || normalize(name).includes(search));
    });
    if (!missing.length) {
      host.innerHTML = '<p class="reference-empty">Nenhum bairro faltante para essa busca.</p>';
      return;
    }
    host.innerHTML = missing.map(name => `
      <div class="reference-neighborhood-row"><span>${escape(name)}</span><button type="button" data-add-reference-neighborhood="${escape(name)}" aria-label="Cadastrar ${escape(name)}">＋</button></div>`).join('');
  }

  async function loadDelivery() {
    const neighborhoodHost = $('#neighborhood-list');
    neighborhoodHost.innerHTML = '<div class="empty-state">Carregando bairros do banco…</div>';
    const [neighborhoodResult, settingsResult, hoursResult] = await Promise.all([
      window.gmSupabase.from('neighborhoods').select('id,name,delivery_fee,is_active').order('name', { ascending: true }),
      window.gmSupabase.from('store_settings').select('*').eq('id', 1).maybeSingle(),
      window.gmSupabase.from('store_hours').select('*').order('weekday')
    ]);

    if (neighborhoodResult.error) {
      neighborhoodsLoaded = false;
      neighborhoodsCache = [];
      neighborhoodHost.textContent = `Não foi possível ler a tabela neighborhoods: ${neighborhoodResult.error.message}`;
      renderReferenceNeighborhoods();
    } else {
      neighborhoodsLoaded = true;
      neighborhoodsCache = neighborhoodResult.data || [];
      renderNeighborhoods();
      renderReferenceNeighborhoods();
    }
    updateSummary();

    if (settingsResult.error) note(`Configurações da loja: ${settingsResult.error.message}`);
    if (settingsResult.data) {
      const form = $('#store-settings-form');
      form.elements.accepts_orders.value = String(settingsResult.data.accepts_orders);
      form.elements.manually_closed.value = String(settingsResult.data.manually_closed);
      form.elements.default_prep_minutes.value = settingsResult.data.default_prep_minutes;
    }

    const hoursHost = $('#store-hours-fields');
    if (hoursResult.error) {
      hoursHost.textContent = `Não foi possível carregar os horários: ${hoursResult.error.message}`;
      return;
    }
    const dayNames = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
    const hoursByDay = new Map((hoursResult.data || []).map(item => [item.weekday, item]));
    hoursHost.innerHTML = dayNames.map((name, index) => {
      const day = hoursByDay.get(index + 1) || { opens_at: '18:00:00', closes_at: '23:59:00', is_closed: false };
      return `<div class="hour-row"><strong>${name}</strong>
        <label>Abertura<input type="time" name="open_${index + 1}" value="${String(day.opens_at || '18:00:00').slice(0, 5)}"></label>
        <label>Fechamento<input type="time" name="close_${index + 1}" value="${String(day.closes_at || '23:59:00').slice(0, 5)}"></label>
        <label class="hour-closed"><input type="checkbox" name="closed_${index + 1}" ${day.is_closed ? 'checked' : ''}> Fechado</label>
      </div>`;
    }).join('');
  }

  async function loadReports() {
    const host = $('#admin-reports');
    const period = $('#report-period')?.value || 'week';
    const days = period === 'day' ? 1 : period === 'month' ? 30 : 7;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));
    const { data: orders, error } = await window.gmSupabase.from('orders')
      .select('id,status,total,payment_method,created_at,order_items(product_name_snapshot,quantity,line_total)')
      .gte('created_at', start.toISOString())
      .order('created_at', { ascending: false });
    if (error) { host.textContent = `Não foi possível carregar os relatórios: ${error.message}`; $('#payment-report').textContent = ''; return; }

    const rows = orders || [];
    const completed = rows.filter(order => order.status === 'completed');
    const cancelled = rows.filter(order => order.status === 'cancelled');
    const top = new Map();
    const payments = new Map();
    for (const order of completed) {
      for (const item of order.order_items || []) {
        const key = item.product_name_snapshot;
        const current = top.get(key) || { name: key, quantity: 0, total: 0 };
        current.quantity += Number(item.quantity || 0);
        current.total += Number(item.line_total || 0);
        top.set(key, current);
      }
      const method = order.payment_method;
      const payment = payments.get(method) || { count: 0, total: 0 };
      payment.count += 1;
      payment.total += Number(order.total || 0);
      payments.set(method, payment);
    }
    const bestSellers = [...top.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 5);
    host.innerHTML = `
      <div class="report-card"><strong>${rows.length}</strong><span>Pedidos recebidos</span></div>
      <div class="report-card"><strong>${completed.length}</strong><span>Pedidos concluídos</span></div>
      <div class="report-card"><strong>${money(completed.reduce((sum, order) => sum + Number(order.total || 0), 0))}</strong><span>Total vendido</span></div>
      <div class="report-card"><strong>${cancelled.length}</strong><span>Pedidos cancelados</span></div>
      <div class="report-card report-wide"><h3>Mais vendidos</h3>
        ${bestSellers.map(item => `<div class="neighborhood-row"><span>${escape(item.name)}</span><strong>${item.quantity} un. · ${money(item.total)}</strong></div>`).join('') || '<p class="muted">Sem vendas concluídas no período.</p>'}
      </div>`;
    $('#payment-report').innerHTML = [...payments.entries()].map(([method, item]) => `
      <div class="neighborhood-row"><span>${paymentLabels[method] || escape(method)}</span><strong>${item.count} pedidos · ${money(item.total)}</strong></div>`).join('') || '<p class="muted">Sem pedidos concluídos no período.</p>';
  }

  async function checkStaff() {
    const { data, error } = await window.gmSupabase.rpc('is_staff');
    if (error || data !== true) {
      await window.gmSupabase.auth.signOut();
      panel.hidden = true;
      login.hidden = false;
      note('Esta conta não está cadastrada como funcionário autorizado em staff_members.');
      return false;
    }
    login.hidden = true;
    panel.hidden = false;
    try {
      let remembered = 'overview';
      try { remembered = sessionStorage.getItem('gm_admin_tab') || 'overview'; } catch { /* preferência opcional */ }
      activateTab(remembered);
      await Promise.all([loadOrders(), loadProducts(), loadDelivery(), loadReports()]);
      window.gmOrdersChannel?.unsubscribe();
      window.gmOrdersChannel = window.gmSupabase.channel('gm-orders')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, payload => {
          note(`Novo pedido recebido${payload.new?.order_number ? ` #${payload.new.order_number}` : ''}. A lista foi atualizada.`);
          loadOrders();
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, () => loadOrders())
        .subscribe();
    } catch (error) {
      note(`O painel abriu, mas houve um problema ao carregar os dados: ${error.message || error}`);
    }
    return true;
  }

  login.addEventListener('submit', async event => {
    event.preventDefault();
    const formData = new FormData(login);
    const { error } = await window.gmSupabase.auth.signInWithPassword({
      email: formData.get('email'), password: formData.get('password')
    });
    if (error) { note(error.message); return; }
    await checkStaff();
  });

  panel.addEventListener('click', async event => {
    const tab = event.target.closest('[data-tab]');
    if (tab) { activateTab(tab.dataset.tab); return; }

    const saveOrder = event.target.closest('[data-save-order]');
    if (saveOrder) {
      const id = saveOrder.dataset.saveOrder;
      const status = $(`[data-status="${id}"]`, panel).value;
      const prep = Number($(`[data-prep="${id}"]`, panel).value);
      if (!Number.isFinite(prep) || prep < 1 || prep > 360) { note('Informe um tempo de preparo entre 1 e 360 minutos.'); return; }
      const { error } = await window.gmSupabase.rpc('staff_update_order', {
        p_order_id: id, p_new_status: status, p_estimated_prep_minutes: prep, p_staff_notes: null
      });
      note(error ? error.message : 'Pedido atualizado.');
      await loadOrders(); await loadReports();
      return;
    }

    const markPaid = event.target.closest('[data-paid]');
    if (markPaid) {
      const { error } = await window.gmSupabase.rpc('staff_mark_payment_paid', { p_order_id: markPaid.dataset.paid });
      note(error ? error.message : 'Pagamento marcado como recebido.');
      await loadOrders();
      return;
    }

    const cancel = event.target.closest('[data-cancel]');
    if (cancel) {
      const { data: request, error: requestError } = await window.gmSupabase.from('order_cancellation_requests')
        .select('id').eq('order_id', cancel.dataset.cancel).eq('status', 'pending').maybeSingle();
      if (requestError || !request) { note(requestError?.message || 'Solicitação de cancelamento não encontrada.'); return; }
      const { error } = await window.gmSupabase.rpc('staff_resolve_cancellation', {
        p_request_id: request.id, p_decision: cancel.dataset.decision, p_staff_note: null
      });
      note(error ? error.message : 'Solicitação analisada.');
      await loadOrders(); await loadReports();
      return;
    }

    const saveProduct = event.target.closest('[data-save-product]');
    if (saveProduct) {
      const id = saveProduct.dataset.saveProduct;
      const price = Number($(`[data-price="${id}"]`, panel).value);
      const available = $(`[data-available="${id}"]`, panel).value === 'true';
      if (!Number.isFinite(price) || price < 0) { note('Informe um preço válido.'); return; }
      const { error } = await window.gmSupabase.from('products').update({ price, is_available: available }).eq('id', id);
      note(error ? error.message : 'Produto atualizado.');
      await loadProducts();
      return;
    }

    const saveNeighborhood = event.target.closest('[data-save-neighborhood]');
    if (saveNeighborhood) {
      const id = saveNeighborhood.dataset.saveNeighborhood;
      const fee = Number($(`[data-neighbor-fee="${id}"]`, panel).value);
      const active = $(`[data-neighbor-active="${id}"]`, panel).value === 'true';
      if (!Number.isFinite(fee) || fee < 0) { note('Informe uma taxa de entrega válida.'); return; }
      const { error } = await window.gmSupabase.from('neighborhoods')
        .update({ delivery_fee: fee, is_active: active }).eq('id', id);
      note(error ? error.message : `Taxa e status de ${neighborhoodsCache.find(item => item.id === id)?.name || 'bairro'} atualizados.`);
      await loadDelivery();
      return;
    }

    const addReference = event.target.closest('[data-add-reference-neighborhood]');
    if (addReference) {
      await addNeighborhoodToDatabase(addReference.dataset.addReferenceNeighborhood);
      return;
    }
  });

  async function addNeighborhoodToDatabase(name) {
    if (!neighborhoodsLoaded) { note('Atualize a lista de bairros do banco antes de cadastrar.'); return; }
    const key = canonicalNeighborhood(name);
    const exists = neighborhoodsCache.some(item => canonicalNeighborhood(item.name) === key);
    if (exists) { note(`${name} já está cadastrado no banco.`); await loadDelivery(); return; }
    const { error } = await window.gmSupabase.from('neighborhoods').insert({
      name, delivery_fee: 0, is_active: false
    });
    note(error ? `Não foi possível cadastrar ${name}: ${error.message}` : `${name} cadastrado como desativado. Defina a taxa e ative quando estiver pronto.`);
    if (!error) await loadDelivery();
  }

  $('#refresh-orders').addEventListener('click', loadOrders);
  $('#refresh-neighborhoods').addEventListener('click', loadDelivery);
  $('#neighborhood-search').addEventListener('input', renderNeighborhoods);
  $('#neighborhood-filter').addEventListener('change', renderNeighborhoods);
  $('#reference-search').addEventListener('input', renderReferenceNeighborhoods);

  $('#neighborhood-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const name = String(formData.get('name') || '').trim().replace(/\s+/g, ' ');
    const fee = Number(formData.get('delivery_fee'));
    if (name.length < 2 || !Number.isFinite(fee) || fee < 0) { note('Informe um nome e uma taxa válida.'); return; }
    if (!neighborhoodsLoaded) { note('Não foi possível conferir a lista atual do banco. Atualize os bairros antes de cadastrar.'); return; }
    if (neighborhoodsCache.some(item => canonicalNeighborhood(item.name) === canonicalNeighborhood(name))) {
      note('Esse bairro já está cadastrado. Use a lista para editar a taxa ou o status.'); return;
    }
    const { error } = await window.gmSupabase.from('neighborhoods').insert({
      name, delivery_fee: fee, is_active: formData.get('is_active') === 'on'
    });
    note(error ? error.message : `${name} adicionado ao banco.`);
    if (!error) { form.reset(); form.elements.delivery_fee.value = '0.00'; await loadDelivery(); }
  });

  $('#add-all-missing-neighborhoods').addEventListener('click', async () => {
    if (!neighborhoodsLoaded) { note('Não foi possível conferir a lista atual do banco. Atualize os bairros antes de cadastrar.'); return; }
    const registered = new Set(neighborhoodsCache.map(item => canonicalNeighborhood(item.name)));
    const missing = uniqueReferenceNeighborhoods.filter(name => !registered.has(canonicalNeighborhood(name)));
    if (!missing.length) { note('Todos os bairros da lista de referência já aparecem no banco.'); return; }
    const confirmed = window.confirm(`Cadastrar ${missing.length} bairros faltantes? Todos serão adicionados desativados, com taxa R$ 0,00. Depois será necessário definir a taxa e ativar cada bairro.`);
    if (!confirmed) return;
    const rows = missing.map(name => ({ name, delivery_fee: 0, is_active: false }));
    const { error } = await window.gmSupabase.from('neighborhoods').insert(rows);
    note(error ? `Não foi possível cadastrar a lista: ${error.message}` : `${rows.length} bairros adicionados desativados. Agora defina as taxas e ative somente os bairros atendidos.`);
    if (!error) await loadDelivery();
  });

  $('#store-settings-form').addEventListener('submit', async event => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const { error } = await window.gmSupabase.from('store_settings').update({
      accepts_orders: formData.get('accepts_orders') === 'true',
      manually_closed: formData.get('manually_closed') === 'true',
      default_prep_minutes: Number(formData.get('default_prep_minutes'))
    }).eq('id', 1);
    note(error ? error.message : 'Configurações da loja salvas.');
  });

  $('#store-hours-form').addEventListener('submit', async event => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const rows = [];
    for (let day = 1; day <= 7; day += 1) {
      const closed = formData.get(`closed_${day}`) === 'on';
      rows.push({ weekday: day, opens_at: closed ? null : formData.get(`open_${day}`), closes_at: closed ? null : formData.get(`close_${day}`), is_closed: closed });
    }
    const { error } = await window.gmSupabase.from('store_hours').upsert(rows, { onConflict: 'weekday' });
    note(error ? error.message : 'Horários salvos.');
    await loadDelivery();
  });

  $('#report-period').addEventListener('change', loadReports);
  $('#admin-logout').addEventListener('click', async () => {
    await window.gmSupabase.auth.signOut();
    window.gmOrdersChannel?.unsubscribe();
    panel.hidden = true;
    login.hidden = false;
    note('Você saiu do painel administrativo.');
  });

  window.gmSupabase.auth.getSession().then(({ data, error }) => {
    if (error) { note(error.message); return; }
    if (data?.session) checkStaff();
  });
});
