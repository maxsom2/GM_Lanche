document.addEventListener('DOMContentLoaded', () => {
  const login = document.getElementById('admin-login');
  const panel = document.getElementById('admin-panel');
  const message = document.getElementById('admin-message');
  if (!login || !panel || !message) return;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const money = value => GM.money(Number(value || 0));
  const escape = value => GM.escape(value);
  const note = text => {
    message.hidden = false;
    message.textContent = text;
    message.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  const statusLabels = {
    received: 'Recebido', confirmed: 'Confirmado', preparing: 'Em preparo',
    ready: 'Pronto para retirada', out_for_delivery: 'Saiu para entrega',
    completed: 'Concluído', cancelled: 'Cancelado'
  };
  const paymentLabels = { pix: 'Pix', cash: 'Dinheiro', card_machine: 'Cartão na maquininha' };
  const roleLabels = {
    chapeiro: 'Chapeiro', gerente: 'Gerente', atendente: 'Atendente',
    caixa: 'Caixa', auxiliar: 'Auxiliar', entregador: 'Entregador', outro: 'Outro'
  };
  const roleWeights = { chapeiro: 1.5, gerente: 1.2, atendente: 1, caixa: 0.9, auxiliar: 0.9, entregador: 0, outro: 1 };

  // Relação urbana de referência baseada no mapa cartográfico CTM/UNEMAT.
  // Nomes adicionais não confirmados são mantidos desativados no SQL até conferência.
  const referenceNeighborhoods = [
    'Aroldo Fanaia', 'Betel', 'Carrapatinho', 'Cavalhada I', 'Cavalhada II',
    'Cavalhada III', 'Centro', 'Cidade Alta', 'Cidade Nova', 'Cohab Nova',
    'Cohab Velha', 'DNER', 'Distrito Industrial', 'Espírito Santo', 'Garcês',
    'Jardim Aeroporto', 'Jardim Celeste', 'Jardim das Oliveiras', 'Jardim do Trevo',
    'Jardim Guanabara', 'Jardim Imperial', 'Jardim Marajoara', 'Jardim Padre Paulo',
    'Jardim Panorama', 'Jardim Paraíso', 'Jardim São Luiz da Ponte', 'Jardim União',
    'Joaquim Murtinho', 'Junco', 'Lavapés', 'Lobo', 'Maracanãzinho', 'Massa Barro',
    'Monte Verde', 'Nova Era', 'Olhos D’Água', 'Rodeio', 'Santa Cruz', 'Santa Isabel',
    'Santa Rosa', 'Santo Antônio', 'Santos Dumont', 'São Jorge', 'São Lourenço',
    'São Miguel', 'Vila Irene', 'Vila Mariana', 'Vila Nova', 'Vila Real', 'Vitória Régia'
  ];
  const unconfirmedNeighborhoods = ['Getúlio Vargas', 'Jardim Cidade Nova', 'Jardim Planalto', 'Jardim Solução'];
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  const canonicalNeighborhood = value => {
    const key = normalize(value);
    const aliases = {
      'santa izabel': 'santa isabel',
      'residencial aroldo fanaia': 'aroldo fanaia',
      'jardim sao luiz': 'jardim sao luiz da ponte',
      'massa barro': 'massa barro'
    };
    return aliases[key] || key;
  };

  let neighborhoodsCache = [];
  let neighborhoodsLoaded = false;
  let ordersCache = [];
  let productsCache = [];
  let teamCache = [];
  let counterItems = [];
  let financeAccess = false;

  login.addEventListener('submit', event => event.preventDefault());
  if (!window.gmSupabaseReady) {
    note('Configure a chave publicável do Supabase em js/config.js. O painel exige uma conta ativa em staff_members.');
    return;
  }

  function activateTab(tabName) {
    const validTabs = ['overview', 'orders', 'counter', 'products', 'delivery', 'hours', 'team', 'finance', 'reports'];
    let active = validTabs.includes(tabName) ? tabName : 'overview';
    if (!financeAccess && ['team','finance'].includes(active)) active = 'overview';
    $$('.admin-nav-item', panel).forEach(button => {
      const selected = button.dataset.tab === active;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-current', selected ? 'page' : 'false');
    });
    $$('.admin-view', panel).forEach(section => section.classList.toggle('active', section.id === `tab-${active}`));
    try { sessionStorage.setItem('gm_admin_tab', active); } catch { /* preferência opcional */ }
    if (active === 'finance' && financeAccess) loadFinance();
    if (active === 'team' && financeAccess) loadTeam();
  }

  function updateSummary() {
    const activeNeighborhoods = neighborhoodsCache.filter(item => item.is_active && !item.needs_review).length;
    const registeredKeys = new Set(neighborhoodsCache.map(item => canonicalNeighborhood(item.name)));
    const missing = neighborhoodsLoaded ? referenceNeighborhoods.filter(name => !registeredKeys.has(canonicalNeighborhood(name))).length : null;
    $('#summary-orders').textContent = String(ordersCache.length);
    $('#summary-products').textContent = String(productsCache.length);
    $('#summary-neighborhoods').textContent = String(neighborhoodsCache.length);
    $('#summary-neighborhoods-note').textContent = `${activeNeighborhoods} ativos no checkout`;
    $('#neighborhood-total').textContent = String(neighborhoodsCache.length);
    $('#neighborhood-active').textContent = String(activeNeighborhoods);
    $('#neighborhood-missing').textContent = missing === null ? '—' : String(missing);
    $('#reference-missing-count').textContent = missing === null ? '—' : String(missing);
    $('#add-all-missing-neighborhoods').disabled = missing === null || missing === 0;
  }

  function renderOrders() {
    const host = $('#admin-orders');
    const search = normalize($('#orders-search')?.value || '');
    const status = $('#orders-status-filter')?.value || 'all';
    const origin = $('#orders-origin-filter')?.value || 'all';
    const rows = ordersCache.filter(order => {
      const haystack = normalize(`${order.order_number} ${order.customer_name} ${order.customer_phone}`);
      return (!search || haystack.includes(search)) && (status === 'all' || order.status === status) &&
        (origin === 'all' || (order.order_origin || 'website') === origin);
    });
    if (!rows.length) {
      host.innerHTML = `<div class="empty-state">${ordersCache.length ? 'Nenhum pedido corresponde à busca.' : 'Nenhum pedido recebido.'}</div>`;
      return;
    }
    const couriers = teamCache.filter(person => person.is_active && person.is_delivery_worker);
    host.innerHTML = rows.map(order => `
      <article class="admin-order">
        <div class="admin-order-head"><div>
          <h3>Pedido #${escape(order.order_number)} · ${escape(order.customer_name)}</h3>
          <p>${new Date(order.created_at).toLocaleString('pt-BR')} · ${order.order_type === 'delivery' ? 'Entrega' : 'Retirada'} · ${escape(order.customer_phone)}</p>
          <p>${escape(order.delivery_address || '')} ${order.neighborhood_name_snapshot ? '· ' + escape(order.neighborhood_name_snapshot) : ''}</p>
        </div><span class="status-pill">${statusLabels[order.status] || escape(order.status)}</span></div>
        <div class="order-origin-pill ${order.order_origin === 'counter' ? 'counter' : ''}">${order.order_origin === 'counter' ? 'Pedido presencial' : 'Pedido pelo site'}</div>
        <ul>${(order.order_items || []).map(item => `<li>${Number(item.quantity)}× ${escape(item.product_name_snapshot)} — ${money(item.line_total)}${item.order_item_removed_ingredients?.length ? ' · Sem ' + item.order_item_removed_ingredients.map(removed => escape(removed.ingredient_name_snapshot)).join(', ') : ''}${item.item_notes ? ' · ' + escape(item.item_notes) : ''}</li>`).join('')}</ul>
        <p>Pagamento: ${paymentLabels[order.payment_method] || escape(order.payment_method)} · ${order.payment_status === 'paid' ? 'Pago' : 'Pendente'} · Total: <strong>${money(order.total)}</strong></p>
        ${order.customer_notes ? `<p>Observações: ${escape(String(order.customer_notes).replace(/^\[BALCAO\]\s*/,'').replace(/^Pedido presencial\.?\s*/,'').trim())}</p>` : ''}
        ${order.cancellation_requested ? '<p class="notice">O cliente solicitou o cancelamento deste pedido.</p>' : ''}
        ${order.order_type === 'delivery' ? `<div class="courier-assignment"><label>Entregador<select data-order-courier="${order.order_number}"><option value="">${order.delivery_staff_user_id ? 'Trocar entregador' : 'Atribuir entregador'}</option>${couriers.map(person => `<option value="${person.user_id}" ${person.user_id === order.delivery_staff_user_id ? 'selected' : ''}>${escape(person.display_name)}</option>`).join('')}</select></label><button class="btn btn-ghost btn-small" type="button" data-assign-courier="${order.order_number}">Salvar entregador</button><small>Pagamento previsto: ${money(order.delivery_payout_snapshot || 0)}</small></div>` : ''}
        <div class="admin-order-actions">
          <label>Status<select data-status="${order.id}">${Object.entries(statusLabels).map(([value, label]) => `<option value="${value}" ${value === order.status ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
          <label>Preparo (min)<input data-prep="${order.id}" type="number" min="1" max="360" value="${order.estimated_prep_minutes || 30}"></label>
          <button class="btn btn-primary btn-small" type="button" data-save-order="${order.id}">Salvar pedido</button>
          ${order.payment_status !== 'paid' ? `<button class="btn btn-ghost btn-small" type="button" data-paid="${order.id}">Marcar pago</button>` : ''}
          ${financeAccess && order.order_type === 'delivery' && order.status === 'completed' && order.delivery_staff_user_id && !order.delivery_payout_paid_at ? `<button class="btn btn-ghost btn-small" type="button" data-pay-courier="${order.order_number}">Marcar motoboy pago</button>` : ''}
          ${order.cancellation_requested ? `<button class="btn btn-ghost btn-small" type="button" data-cancel="${order.id}" data-decision="approved">Aprovar cancelamento</button><button class="btn btn-ghost btn-small" type="button" data-cancel="${order.id}" data-decision="denied">Recusar cancelamento</button>` : ''}
        </div>
      </article>`).join('');
  }

  async function loadOrders() {
    const host = $('#admin-orders');
    host.innerHTML = '<p class="muted">Carregando pedidos…</p>';
    const { data, error } = await window.gmSupabase.from('orders')
      .select('*, order_items(*, order_item_removed_ingredients(ingredient_name_snapshot))')
      .order('created_at', { ascending: false }).limit(200);
    if (error) { host.textContent = `Não foi possível carregar os pedidos: ${error.message}`; return; }
    ordersCache = data || [];
    updateSummary();
    renderOrders();
  }

  async function loadProducts() {
    const host = $('#admin-products');
    host.innerHTML = '<p class="muted">Carregando cardápio…</p>';
    const { data, error } = await window.gmSupabase.from('products')
      .select('id,name,price,production_cost,is_available,is_listed').order('display_order');
    if (error) { host.textContent = `Não foi possível carregar o cardápio: ${error.message}. Execute primeiro a atualização SQL do pacote.`; return; }
    productsCache = data || [];
    updateSummary();
    host.innerHTML = productsCache.map(product => `
      <article class="admin-product-row">
        <div class="admin-product-identity"><span class="admin-product-symbol">🍔</span><div><strong>${escape(product.name)}</strong><small>${product.is_listed ? 'Visível no cardápio' : 'Oculto no cardápio'}</small></div></div>
        <div class="admin-product-controls">
          <label>Preço ao cliente<input data-price="${product.id}" type="number" min="0" step="0.01" value="${Number(product.price).toFixed(2)}"></label>
          <label>Custo de produção<input data-cost="${product.id}" type="number" min="0" step="0.01" placeholder="Obrigatório" value="${product.production_cost == null ? '' : Number(product.production_cost).toFixed(2)}"></label>
          <label>Disponibilidade<select data-available="${product.id}"><option value="true" ${product.is_available ? 'selected' : ''}>Disponível</option><option value="false" ${!product.is_available ? 'selected' : ''}>Indisponível</option></select></label>
          <button class="btn btn-primary btn-small" type="button" data-save-product="${product.id}">Salvar</button>
        </div>
      </article>`).join('') || '<div class="empty-state">Nenhum produto cadastrado.</div>';
    renderCounterProductOptions();
  }

  function renderNeighborhoods() {
    const host = $('#neighborhood-list');
    const search = normalize($('#neighborhood-search').value);
    const filter = $('#neighborhood-filter').value;
    const rows = neighborhoodsCache.filter(item => {
      const match = !search || normalize(item.name).includes(search);
      const state = filter === 'all' || (filter === 'active' && item.is_active) || (filter === 'inactive' && !item.is_active);
      return match && state;
    });
    if (!rows.length) { host.innerHTML = '<div class="empty-state">Nenhum bairro corresponde à busca.</div>'; return; }
    host.innerHTML = rows.map(item => `
      <article class="admin-neighborhood-row ${item.is_active ? 'is-active' : 'is-inactive'}">
        <div class="admin-neighborhood-name"><strong>${escape(item.name)}</strong><div class="admin-pill-line"><span class="admin-state-pill ${item.is_active ? 'active' : 'inactive'}">${item.is_active ? 'Ativo no checkout' : 'Desativado'}</span>${item.needs_review ? '<span class="admin-state-pill review">Conferir nome</span>' : ''}</div></div>
        <div class="admin-neighborhood-controls">
          <label>Taxa do cliente<input data-neighbor-fee="${item.id}" type="number" min="0" step="0.01" value="${Number(item.delivery_fee || 0).toFixed(2)}"></label>
          <label>Motoboy recebe<input data-neighbor-payout="${item.id}" type="number" min="0" step="0.01" value="${Number(item.delivery_payout || 0).toFixed(2)}"></label>
          <label>Status<select data-neighbor-active="${item.id}"><option value="true" ${item.is_active ? 'selected' : ''}>Ativo</option><option value="false" ${!item.is_active ? 'selected' : ''}>Desativado</option></select></label>
          <button class="btn btn-primary btn-small" type="button" data-save-neighborhood="${item.id}">Salvar</button>
        </div>
      </article>`).join('');
  }

  function renderReferenceNeighborhoods() {
    const host = $('#reference-neighborhoods');
    if (!neighborhoodsLoaded) { host.innerHTML = '<p class="reference-empty">Não foi possível confirmar os bairros do banco. Atualize a lista antes de cadastrar.</p>'; return; }
    const registered = new Set(neighborhoodsCache.map(item => canonicalNeighborhood(item.name)));
    const search = normalize($('#reference-search').value);
    const missing = referenceNeighborhoods.filter(name => !registered.has(canonicalNeighborhood(name)) && (!search || normalize(name).includes(search)));
    if (!missing.length) { host.innerHTML = '<p class="reference-empty">Nenhum bairro faltante da lista cartográfica.</p>'; return; }
    host.innerHTML = missing.map(name => `<div class="reference-neighborhood-row"><span>${escape(name)}</span><button type="button" data-add-reference-neighborhood="${escape(name)}" aria-label="Cadastrar ${escape(name)}">＋</button></div>`).join('');
  }

  async function loadDelivery() {
    const neighborhoodHost = $('#neighborhood-list');
    neighborhoodHost.innerHTML = '<div class="empty-state">Carregando bairros do banco…</div>';
    const [neighborhoodResult, settingsResult, hoursResult] = await Promise.all([
      window.gmSupabase.from('neighborhoods').select('id,name,delivery_fee,delivery_payout,is_active,needs_review').order('name', { ascending: true }),
      window.gmSupabase.from('store_settings').select('*').eq('id', 1).maybeSingle(),
      window.gmSupabase.from('store_hours').select('*').order('weekday')
    ]);
    if (neighborhoodResult.error) {
      neighborhoodsLoaded = false; neighborhoodsCache = [];
      neighborhoodHost.textContent = `Não foi possível ler bairros: ${neighborhoodResult.error.message}. Execute a atualização SQL primeiro.`;
      renderReferenceNeighborhoods();
    } else {
      neighborhoodsLoaded = true; neighborhoodsCache = neighborhoodResult.data || [];
      renderNeighborhoods(); renderReferenceNeighborhoods();
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
    if (hoursResult.error) { hoursHost.textContent = `Não foi possível carregar os horários: ${hoursResult.error.message}`; return; }
    const names = ['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'];
    const map = new Map((hoursResult.data || []).map(item => [item.weekday, item]));
    hoursHost.innerHTML = names.map((name, index) => {
      const day = map.get(index + 1) || { opens_at:'18:00:00', closes_at:'23:59:00', is_closed:false };
      return `<div class="hour-row"><strong>${name}</strong><label>Abertura<input type="time" name="open_${index+1}" value="${String(day.opens_at || '18:00:00').slice(0,5)}"></label><label>Fechamento<input type="time" name="close_${index+1}" value="${String(day.closes_at || '23:59:00').slice(0,5)}"></label><label class="hour-closed"><input type="checkbox" name="closed_${index+1}" ${day.is_closed?'checked':''}> Fechado</label></div>`;
    }).join('');
    populateCounterNeighborhoods();
  }

  async function loadReports() {
    const host = $('#admin-reports');
    const period = $('#report-period')?.value || 'week';
    const days = period === 'day' ? 1 : period === 'month' ? 30 : 7;
    const start = new Date(); start.setHours(0,0,0,0); start.setDate(start.getDate() - (days - 1));
    const { data: orders, error } = await window.gmSupabase.from('orders')
      .select('id,status,total,payment_method,created_at,order_items(product_name_snapshot,quantity,line_total)')
      .gte('created_at', start.toISOString()).order('created_at', { ascending: false });
    if (error) { host.textContent = `Não foi possível carregar relatórios: ${error.message}`; $('#payment-report').textContent = ''; return; }
    const rows = orders || [], completed = rows.filter(o => o.status === 'completed'), cancelled = rows.filter(o => o.status === 'cancelled');
    const best = new Map(), payments = new Map();
    for (const order of completed) {
      for (const item of order.order_items || []) {
        const current = best.get(item.product_name_snapshot) || { name:item.product_name_snapshot, quantity:0, total:0 };
        current.quantity += Number(item.quantity || 0); current.total += Number(item.line_total || 0); best.set(item.product_name_snapshot,current);
      }
      const current = payments.get(order.payment_method) || { count:0,total:0 };
      current.count += 1; current.total += Number(order.total || 0); payments.set(order.payment_method,current);
    }
    const top = [...best.values()].sort((a,b)=>b.quantity-a.quantity).slice(0,5);
    host.innerHTML = `<div class="report-card"><strong>${rows.length}</strong><span>Pedidos recebidos</span></div><div class="report-card"><strong>${completed.length}</strong><span>Pedidos concluídos</span></div><div class="report-card"><strong>${money(completed.reduce((s,o)=>s+Number(o.total||0),0))}</strong><span>Vendas concluídas</span></div><div class="report-card"><strong>${cancelled.length}</strong><span>Cancelados</span></div><div class="report-card report-wide"><h3>Mais vendidos</h3>${top.map(i=>`<div class="neighborhood-row"><span>${escape(i.name)}</span><strong>${i.quantity} un. · ${money(i.total)}</strong></div>`).join('') || '<p class="muted">Sem vendas concluídas.</p>'}</div>`;
    $('#payment-report').innerHTML = [...payments.entries()].map(([method,item])=>`<div class="neighborhood-row"><span>${paymentLabels[method] || escape(method)}</span><strong>${item.count} pedidos · ${money(item.total)}</strong></div>`).join('') || '<p class="muted">Sem pedidos concluídos.</p>';
  }

  function populateCounterNeighborhoods() {
    const select = $('#counter-neighborhood');
    if (!select) return;
    const current = select.value;
    select.innerHTML = '<option value="">Selecione o bairro</option>' + neighborhoodsCache.filter(n => n.is_active && !n.needs_review)
      .sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'))
      .map(n=>`<option value="${n.id}" data-fee="${Number(n.delivery_fee||0)}">${escape(n.name)} — ${money(n.delivery_fee)}</option>`).join('');
    if (current) select.value = current;
    updateCounterTotals();
  }

  function renderCounterProductOptions() {
    const select = $('#counter-product');
    if (!select) return;
    select.innerHTML = '<option value="">Selecione um lanche</option>' + productsCache.filter(p => p.is_available && p.is_listed)
      .map(p=>`<option value="${p.id}">${escape(p.name)} — ${money(p.price)}</option>`).join('');
  }

  function renderCounterCart() {
    const host = $('#counter-cart');
    if (!counterItems.length) { host.innerHTML = '<p class="muted">Adicione os lanches do pedido.</p>'; updateCounterTotals(); return; }
    host.innerHTML = counterItems.map(item=>`<div class="counter-cart-row"><div><strong>${escape(item.name)}</strong><small>${money(item.price)} cada</small></div><div class="counter-cart-controls"><label>Qtd.<input data-counter-qty="${item.product_id}" type="number" min="1" max="30" value="${item.quantity}"></label><strong>${money(item.price*item.quantity)}</strong><button type="button" class="btn btn-ghost btn-small" data-counter-remove="${item.product_id}">Tirar</button></div></div>`).join('');
    updateCounterTotals();
  }

  function updateCounterTotals() {
    const subtotal = counterItems.reduce((sum,item)=>sum + item.price*item.quantity,0);
    const isDelivery = $('#counter-form')?.elements.order_type.value === 'delivery';
    const selected = $('#counter-neighborhood')?.selectedOptions[0];
    const fee = isDelivery && selected?.value ? Number(selected.dataset.fee || 0) : 0;
    $('#counter-subtotal').textContent = money(subtotal);
    $('#counter-delivery-fee').textContent = money(fee);
    $('#counter-total').textContent = money(subtotal+fee);
  }

  async function loadTeam() {
    const host = $('#team-list');
    host.innerHTML = '<div class="empty-state">Carregando equipe…</div>';
    const { data, error } = await window.gmSupabase.from('staff_members')
      .select('user_id,display_name,phone,is_active,job_role,profit_share_weight,receives_profit_share,is_delivery_worker,can_manage_finances')
      .order('display_name');
    if (error) { host.textContent = `Não foi possível carregar a equipe: ${error.message}`; return; }
    teamCache = data || [];
    renderOrders();
    host.innerHTML = teamCache.map(person=>`
      <article class="team-person-card"><div class="team-person-title"><div><strong>${escape(person.display_name)}</strong><small>${escape(person.phone || 'Telefone não cadastrado')} · ${person.is_active?'Ativo':'Inativo'}</small></div><span class="admin-state-pill ${person.is_active?'active':'inactive'}">${person.is_active?'Ativo':'Inativo'}</span></div>
        <div class="team-person-controls"><label>Função<select data-team-role="${person.user_id}">${Object.entries(roleLabels).map(([k,v])=>`<option value="${k}" ${person.job_role===k?'selected':''}>${v}</option>`).join('')}</select></label>
          <label>Peso do rateio<input data-team-weight="${person.user_id}" type="number" min="0" max="10" step="0.05" value="${Number(person.profit_share_weight ?? 1).toFixed(2)}"></label>
          <label class="team-check"><input data-team-share="${person.user_id}" type="checkbox" ${person.receives_profit_share?'checked':''}> Participa do rateio</label>
          <label class="team-check"><input data-team-delivery="${person.user_id}" type="checkbox" ${person.is_delivery_worker?'checked':''}> É entregador</label>
          <button class="btn btn-primary btn-small" type="button" data-save-team="${person.user_id}">Salvar função</button></div>
      </article>`).join('') || '<div class="empty-state">Nenhum funcionário cadastrado.</div>';
    populateCounterCouriers();
  }

  function populateCounterCouriers() {
    const select = $('#counter-delivery-staff');
    if (!select) return;
    const couriers = teamCache.filter(p=>p.is_active && p.is_delivery_worker);
    select.innerHTML = '<option value="">Atribuir depois</option>' + couriers.map(p=>`<option value="${p.user_id}">${escape(p.display_name)}</option>`).join('');
  }

  function setFinanceMessage(text) {
    const box = $('#finance-message'); box.hidden = !text; box.textContent = text || '';
  }

  function localCuiabaDate() {
    return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Cuiaba',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  }

  async function loadFinance() {
    if (!financeAccess) { setFinanceMessage('Acesso financeiro não liberado para esta conta. O responsável precisa ativar can_manage_finances pelo SQL.'); return; }
    const date = $('#finance-day').value || localCuiabaDate();
    $('#finance-day').value = date;
    $('#finance-summary').innerHTML = '<div class="empty-state">Calculando fechamento…</div>';
    const { data, error } = await window.gmSupabase.rpc('gm_get_daily_closing',{p_day:date});
    if (error) { $('#finance-summary').textContent = `Não foi possível calcular: ${error.message}`; setFinanceMessage('Confira se o SQL de atualização foi executado e se esta conta tem permissão financeira.'); return; }
    const report = Array.isArray(data) ? data[0] : data;
    if (!report) { $('#finance-summary').textContent = 'O banco não retornou o fechamento.'; return; }
    setFinanceMessage(report.missing_cost_items > 0 ? `Faltam custos de produção em ${report.missing_cost_items} item(ns) vendido(s). O rateio fica bloqueado até preencher todos os custos.` : (report.distribution_ready ? '' : 'Configure pelo menos um funcionário ativo que participe do rateio.'));
    const netClass = Number(report.operating_result) >= 0 ? 'positive' : 'negative';
    $('#finance-summary').innerHTML = `
      <div class="finance-kpi"><small>Vendas recebidas</small><strong>${money(report.paid_sales)}</strong><span>${report.paid_orders} pedido(s) concluído(s) e pago(s)</span></div>
      <div class="finance-kpi"><small>Reserva de reposição</small><strong>${money(report.replacement_reserve)}</strong><span>Custo dos lanches vendidos</span></div>
      <div class="finance-kpi"><small>Entregadores</small><strong>${money(report.delivery_total)}</strong><span>${money(report.delivery_pending)} pendente(s) de pagamento</span></div>
      <div class="finance-kpi"><small>Outras despesas</small><strong>${money(report.other_expenses)}</strong><span>Despesas registradas no dia</span></div>
      <div class="finance-kpi finance-net ${netClass}"><small>Saldo após custos</small><strong>${money(report.operating_result)}</strong><span>Antes do rateio da equipe</span></div>
      <div class="finance-kpi finance-share"><small>Valor para rateio</small><strong>${report.distributable_amount == null ? '—' : money(report.distributable_amount)}</strong><span>${report.distribution_ready ? `${report.eligible_staff_count} pessoa(s) participam` : 'Aguardando custos e pesos'}</span></div>
      <div class="finance-extra"><span>Funcionários ativos: <strong>${report.active_staff_count}</strong></span><span>Pagamentos pendentes de clientes: <strong>${money(report.pending_payment_total)}</strong> (${report.pending_payment_orders} pedido(s))</span><span>Entregas concluídas sem entregador: <strong>${report.deliveries_without_courier}</strong></span></div>`;
    const shares = report.staff_distribution || [];
    $('#finance-staff-share').innerHTML = shares.map(person=>`<div class="finance-person-row"><span><strong>${escape(person.display_name)}</strong><small>${roleLabels[person.job_role] || escape(person.job_role)} · peso ${Number(person.weight).toFixed(2)}</small></span><span><strong>${person.share_amount == null ? '—' : money(person.share_amount)}</strong><small>${Number(person.percentage).toFixed(2)}%</small></span></div>`).join('') || '<p class="muted">Nenhum funcionário configurado para o rateio.</p>';
    const couriers = report.courier_distribution || [];
    $('#finance-couriers').innerHTML = couriers.map(person=>`<div class="finance-person-row"><span><strong>${escape(person.display_name)}</strong><small>${person.deliveries} entrega(s)</small></span><span><strong>${money(person.total)}</strong><small>${money(person.paid)} pago · ${money(person.pending)} pendente</small></span></div>`).join('') || '<p class="muted">Nenhuma entrega concluída com entregador atribuído.</p>';
  }

  async function checkStaff() {
    const { data, error } = await window.gmSupabase.rpc('is_staff');
    if (error || data !== true) {
      await window.gmSupabase.auth.signOut(); panel.hidden = true; login.hidden = false;
      note('Esta conta não está cadastrada como funcionário autorizado em staff_members.'); return false;
    }
    login.hidden = true; panel.hidden = false;
    const financeCheck = await window.gmSupabase.rpc('gm_is_finance_admin');
    financeAccess = !financeCheck.error && financeCheck.data === true;
    ['team','finance'].forEach(tab => panel.querySelectorAll(`[data-tab="${tab}"]`).forEach(button => { button.hidden = !financeAccess; }));
    const savedTab = (() => { try { return sessionStorage.getItem('gm_admin_tab'); } catch { return null; } })();
    if (!financeAccess && ['team','finance'].includes(savedTab)) activateTab('overview');
    try {
      let remembered = 'overview';
      try { remembered = sessionStorage.getItem('gm_admin_tab') || 'overview'; } catch { /* preferência opcional */ }
      activateTab(remembered);
      await Promise.all([loadOrders(),loadProducts(),loadDelivery(),loadReports(),loadTeam()]);
      if (financeAccess) await loadFinance();
      window.gmOrdersChannel?.unsubscribe();
      window.gmOrdersChannel = window.gmSupabase.channel('gm-orders')
        .on('postgres_changes',{event:'INSERT',schema:'public',table:'orders'},payload=>{note(`Novo pedido recebido${payload.new?.order_number?` #${payload.new.order_number}`:''}. Lista atualizada.`);loadOrders();loadReports();})
        .on('postgres_changes',{event:'UPDATE',schema:'public',table:'orders'},()=>{loadOrders();loadReports();})
        .subscribe();
    } catch (error) { note(`O painel abriu, mas houve um problema ao carregar os dados: ${error.message || error}`); }
    return true;
  }

  login.addEventListener('submit',async event=>{
    event.preventDefault(); const data=new FormData(login);
    const {error}=await window.gmSupabase.auth.signInWithPassword({email:data.get('email'),password:data.get('password')});
    if(error){note(error.message);return;} await checkStaff();
  });

  panel.addEventListener('click',async event=>{
    const tab=event.target.closest('[data-tab]'); if(tab){activateTab(tab.dataset.tab);return;}
    const add=event.target.closest('#counter-add-item');
    if(add){
      const id=$('#counter-product').value, qty=Number($('#counter-quantity').value);
      const product=productsCache.find(p=>p.id===id);
      if(!product){note('Selecione um lanche disponível.');return;}
      if(!Number.isInteger(qty)||qty<1||qty>30){note('A quantidade deve ficar entre 1 e 30.');return;}
      const existing=counterItems.find(x=>x.product_id===id);
      if(existing) existing.quantity+=qty; else counterItems.push({product_id:id,name:product.name,price:Number(product.price),quantity:qty});
      $('#counter-quantity').value='1'; renderCounterCart(); return;
    }
    const removeItem=event.target.closest('[data-counter-remove]');
    if(removeItem){counterItems=counterItems.filter(x=>x.product_id!==removeItem.dataset.counterRemove);renderCounterCart();return;}
    const saveOrder=event.target.closest('[data-save-order]');
    if(saveOrder){
      const id=saveOrder.dataset.saveOrder, status=$(`[data-status="${id}"]`,panel).value, prep=Number($(`[data-prep="${id}"]`,panel).value);
      if(!Number.isFinite(prep)||prep<1||prep>360){note('Informe um tempo entre 1 e 360 minutos.');return;}
      const {error}=await window.gmSupabase.rpc('staff_update_order',{p_order_id:id,p_new_status:status,p_estimated_prep_minutes:prep,p_staff_notes:null});
      note(error?error.message:'Pedido atualizado.');await loadOrders();await loadReports();if(financeAccess)await loadFinance();return;
    }
    const paid=event.target.closest('[data-paid]');
    if(paid){const {error}=await window.gmSupabase.rpc('staff_mark_payment_paid',{p_order_id:paid.dataset.paid});note(error?error.message:'Pagamento marcado como recebido.');await loadOrders();return;}
    const courierAssign=event.target.closest('[data-assign-courier]');
    if(courierAssign){
      const orderNo=Number(courierAssign.dataset.assignCourier), userId=$(`[data-order-courier="${orderNo}"]`,panel).value;
      if(!userId){note('Escolha um entregador.');return;}
      const {error}=await window.gmSupabase.rpc('gm_assign_delivery_staff_by_number',{p_order_number:orderNo,p_staff_user_id:userId});
      note(error?error.message:'Entregador atribuído ao pedido.');await loadOrders();if(financeAccess)await loadFinance();return;
    }
    const payCourier=event.target.closest('[data-pay-courier]');
    if(payCourier){const {error}=await window.gmSupabase.rpc('gm_mark_delivery_payout_paid_by_number',{p_order_number:Number(payCourier.dataset.payCourier)});note(error?error.message:'Pagamento do entregador registrado.');await loadOrders();if(financeAccess)await loadFinance();return;}
    const cancel=event.target.closest('[data-cancel]');
    if(cancel){
      const {data:request,error:requestError}=await window.gmSupabase.from('order_cancellation_requests').select('id').eq('order_id',cancel.dataset.cancel).eq('status','pending').maybeSingle();
      if(requestError||!request){note(requestError?.message||'Solicitação não encontrada.');return;}
      const {error}=await window.gmSupabase.rpc('staff_resolve_cancellation',{p_request_id:request.id,p_decision:cancel.dataset.decision,p_staff_note:null});
      note(error?error.message:'Solicitação analisada.');await loadOrders();await loadReports();return;
    }
    const saveProduct=event.target.closest('[data-save-product]');
    if(saveProduct){
      const id=saveProduct.dataset.saveProduct, price=Number($(`[data-price="${id}"]`,panel).value), costRaw=$(`[data-cost="${id}"]`,panel).value, available=$(`[data-available="${id}"]`,panel).value==='true';
      const cost=costRaw===''?null:Number(costRaw);
      if(!Number.isFinite(price)||price<0|| (cost!==null&&(!Number.isFinite(cost)||cost<0))){note('Confira o preço e o custo de produção.');return;}
      const {error}=await window.gmSupabase.from('products').update({price,production_cost:cost,is_available:available}).eq('id',id);
      note(error?error.message:'Produto e custo atualizados. O novo custo será usado nos próximos pedidos.');await loadProducts();return;
    }
    const saveNeighborhood=event.target.closest('[data-save-neighborhood]');
    if(saveNeighborhood){
      const id=saveNeighborhood.dataset.saveNeighborhood, fee=Number($(`[data-neighbor-fee="${id}"]`,panel).value), payout=Number($(`[data-neighbor-payout="${id}"]`,panel).value), active=$(`[data-neighbor-active="${id}"]`,panel).value==='true';
      if(!Number.isFinite(fee)||fee<0||!Number.isFinite(payout)||payout<0){note('Informe valores válidos para a taxa e o pagamento do entregador.');return;}
      const {error}=await window.gmSupabase.from('neighborhoods').update({delivery_fee:fee,delivery_payout:payout,is_active:active,needs_review:false}).eq('id',id);
      note(error?error.message:'Taxa e pagamento do bairro atualizados.');await loadDelivery();return;
    }
    const addReference=event.target.closest('[data-add-reference-neighborhood]');
    if(addReference){await addNeighborhoodToDatabase(addReference.dataset.addReferenceNeighborhood,false);return;}
    const saveTeam=event.target.closest('[data-save-team]');
    if(saveTeam){
      if(!financeAccess){note('Somente a conta responsável pode alterar os pesos e funções.');return;}
      const id=saveTeam.dataset.saveTeam, role=$(`[data-team-role="${id}"]`,panel).value, weight=Number($(`[data-team-weight="${id}"]`,panel).value), share=$(`[data-team-share="${id}"]`,panel).checked, courier=$(`[data-team-delivery="${id}"]`,panel).checked;
      if(!Number.isFinite(weight)||weight<0||weight>10){note('O peso precisa ficar entre 0 e 10.');return;}
      const {error}=await window.gmSupabase.rpc('gm_update_staff_compensation',{p_user_id:id,p_job_role:role,p_profit_share_weight:weight,p_receives_profit_share:share,p_is_delivery_worker:courier});
      note(error?error.message:'Função e participação atualizadas.');await loadTeam();if(financeAccess)await loadFinance();return;
    }
  });

  async function addNeighborhoodToDatabase(name, needsReview=false){
    if(!neighborhoodsLoaded){note('Atualize a lista de bairros antes de cadastrar.');return;}
    const key=canonicalNeighborhood(name);
    if(neighborhoodsCache.some(n=>canonicalNeighborhood(n.name)===key)){note(`${name} já está cadastrado.`);return;}
    const {error}=await window.gmSupabase.from('neighborhoods').insert({name,delivery_fee:0,delivery_payout:0,is_active:false,needs_review:needsReview});
    note(error?`Não foi possível cadastrar: ${error.message}`:`${name} cadastrado desativado. Configure os valores antes de ativar.`);
    if(!error)await loadDelivery();
  }

  $('#refresh-orders').addEventListener('click',loadOrders);
  $('#orders-search').addEventListener('input',renderOrders);
  $('#orders-status-filter').addEventListener('change',renderOrders);
  $('#orders-origin-filter').addEventListener('change',renderOrders);
  $('#refresh-neighborhoods').addEventListener('click',loadDelivery);
  $('#neighborhood-search').addEventListener('input',renderNeighborhoods);
  $('#neighborhood-filter').addEventListener('change',renderNeighborhoods);
  $('#reference-search').addEventListener('input',renderReferenceNeighborhoods);

  $('#neighborhood-form').addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget,fd=new FormData(form);const name=String(fd.get('name')||'').trim().replace(/\s+/g,' ');const fee=Number(fd.get('delivery_fee'));
    if(name.length<2||!Number.isFinite(fee)||fee<0){note('Informe nome e taxa válidos.');return;}
    if(!neighborhoodsLoaded){note('Não foi possível conferir os bairros do banco.');return;}
    if(neighborhoodsCache.some(n=>canonicalNeighborhood(n.name)===canonicalNeighborhood(name))){note('Esse bairro já está cadastrado.');return;}
    const {error}=await window.gmSupabase.from('neighborhoods').insert({name,delivery_fee:fee,delivery_payout:fee,is_active:fd.get('is_active')==='on',needs_review:false});
    note(error?error.message:`${name} cadastrado.`);if(!error){form.reset();form.elements.delivery_fee.value='0.00';await loadDelivery();}
  });

  $('#add-all-missing-neighborhoods').addEventListener('click',async()=>{
    if(!neighborhoodsLoaded){note('Atualize a lista do banco antes de cadastrar.');return;}
    const registered=new Set(neighborhoodsCache.map(n=>canonicalNeighborhood(n.name)));
    const missing=referenceNeighborhoods.filter(n=>!registered.has(canonicalNeighborhood(n)));
    if(!missing.length){note('Todos os bairros da lista cartográfica já aparecem no banco.');return;}
    if(!window.confirm(`Cadastrar ${missing.length} bairros que faltam? Entrarão desativados e com valores zerados.`))return;
    const {error}=await window.gmSupabase.from('neighborhoods').insert(missing.map(name=>({name,delivery_fee:0,delivery_payout:0,is_active:false,needs_review:false})));
    note(error?error.message:`${missing.length} bairros cadastrados desativados.`);if(!error)await loadDelivery();
  });

  $('#store-settings-form').addEventListener('submit',async event=>{
    event.preventDefault();const fd=new FormData(event.currentTarget);
    const {error}=await window.gmSupabase.from('store_settings').update({accepts_orders:fd.get('accepts_orders')==='true',manually_closed:fd.get('manually_closed')==='true',default_prep_minutes:Number(fd.get('default_prep_minutes'))}).eq('id',1);
    note(error?error.message:'Configurações da loja salvas.');
  });
  $('#store-hours-form').addEventListener('submit',async event=>{
    event.preventDefault();const fd=new FormData(event.currentTarget),rows=[];
    for(let day=1;day<=7;day++){const closed=fd.get(`closed_${day}`)==='on';rows.push({weekday:day,opens_at:closed?null:fd.get(`open_${day}`),closes_at:closed?null:fd.get(`close_${day}`),is_closed:closed});}
    const {error}=await window.gmSupabase.from('store_hours').upsert(rows,{onConflict:'weekday'});note(error?error.message:'Horários salvos.');
  });
  $('#report-period').addEventListener('change',loadReports);

  $('#counter-form').elements.order_type.addEventListener('change',event=>{
    $('#counter-delivery-fields').hidden=event.target.value!=='delivery';
    updateCounterTotals();
  });
  $('#counter-neighborhood').addEventListener('change',updateCounterTotals);
  $('#team-list').addEventListener('change',event=>{
    const roleSelect=event.target.closest('[data-team-role]');
    if(!roleSelect)return;
    const id=roleSelect.dataset.teamRole;
    const weightInput=$(`[data-team-weight="${id}"]`,$('#team-list'));
    const shareInput=$(`[data-team-share="${id}"]`,$('#team-list'));
    const deliveryInput=$(`[data-team-delivery="${id}"]`,$('#team-list'));
    const role=roleSelect.value;
    if(role==='entregador'){
      if(weightInput)weightInput.value='0';
      if(shareInput)shareInput.checked=false;
      if(deliveryInput)deliveryInput.checked=true;
    }else if(weightInput){
      weightInput.value=String(roleWeights[role] ?? 1);
      if(deliveryInput)deliveryInput.checked=false;
      if(shareInput)shareInput.checked=true;
    }
  });
  $('#counter-cart').addEventListener('change',event=>{
    const input=event.target.closest('[data-counter-qty]');if(!input)return;
    const item=counterItems.find(x=>x.product_id===input.dataset.counterQty);const qty=Number(input.value);
    if(!item||!Number.isInteger(qty)||qty<1||qty>30){note('Quantidade inválida.');renderCounterCart();return;}
    item.quantity=qty;renderCounterCart();
  });
  $('#counter-submit').addEventListener('click',async()=>{
    const form=$('#counter-form'),fd=new FormData(form),result=$('#counter-result');
    if(!counterItems.length){note('Adicione pelo menos um lanche ao pedido.');return;}
    const name=String(fd.get('customer_name')||'').trim(),phone=String(fd.get('customer_phone')||'').trim();
    const phoneDigits=phone.replace(/\D/g,'');
    if(name.length<2||phoneDigits.length<10||phoneDigits.length>13){note('Informe nome e telefone com DDD válidos.');return;}
    const delivery=fd.get('order_type')==='delivery';
    if(delivery&&(!fd.get('neighborhood_id')||String(fd.get('delivery_address')||'').trim().length<5)){note('Para entrega, selecione o bairro e informe o endereço completo.');return;}
    const payload={name,phone,email:null,order_type:delivery?'delivery':'pickup',payment_method:fd.get('payment_method'),items:counterItems.map(x=>({product_id:x.product_id,quantity:x.quantity,removed_ingredient_ids:[],notes:''})),notes:`[BALCAO] Pedido presencial${fd.get('order_notes') ? `. ${String(fd.get('order_notes')).trim()}` : ''}`,neighborhood_id:delivery?fd.get('neighborhood_id'):null,address:delivery?String(fd.get('delivery_address')).trim():null};
    const button=$('#counter-submit');button.disabled=true;button.textContent='Registrando…';
    const {data,error}=await window.gmSupabase.rpc('create_order',{p_payload:payload});
    button.disabled=false;button.textContent='Registrar pedido presencial';
    if(error){result.hidden=false;result.textContent=`Não foi possível registrar: ${error.message}`;return;}
    const created=Array.isArray(data)?data[0]:data;const orderNumber=created?.order_number;
    let paymentNote='';
    if(orderNumber && fd.get('payment_received')==='on'){
      const paymentResult=await window.gmSupabase.rpc('gm_mark_order_paid_by_number',{p_order_number:Number(orderNumber)});
      if(paymentResult.error) paymentNote=` O pedido foi criado, mas não consegui confirmar o pagamento: ${paymentResult.error.message}`;
    }
    if(delivery&&orderNumber&&fd.get('delivery_staff_user_id')){
      const assigned=await window.gmSupabase.rpc('gm_assign_delivery_staff_by_number',{p_order_number:Number(orderNumber),p_staff_user_id:fd.get('delivery_staff_user_id')});
      if(assigned.error)note(`Pedido criado, mas não foi possível atribuir o entregador: ${assigned.error.message}`);
    }
    result.hidden=false;result.textContent=`Pedido presencial #${orderNumber||'registrado'} criado. Total confirmado pelo banco: ${money(created?.total)}.${fd.get('payment_received')==='on'?' Pagamento recebido.':' Pagamento permanece pendente.'}${paymentNote}`;
    counterItems=[];renderCounterCart();form.reset();$('#counter-delivery-fields').hidden=true;updateCounterTotals();await loadOrders();await loadReports();
  });

  $('#finance-day').value=localCuiabaDate();
  $('#finance-day').addEventListener('change',loadFinance);
  $('#expense-form').addEventListener('submit',async event=>{
    event.preventDefault();if(!financeAccess){setFinanceMessage('Acesso financeiro não liberado para esta conta.');return;}
    const fd=new FormData(event.currentTarget),amount=Number(fd.get('amount'));
    if(!String(fd.get('description')||'').trim()||!Number.isFinite(amount)||amount<=0){setFinanceMessage('Informe descrição e valor válido.');return;}
    const {error}=await window.gmSupabase.rpc('gm_add_daily_expense',{p_description:String(fd.get('description')).trim(),p_category:fd.get('category'),p_amount:amount,p_expense_date:$('#finance-day').value});
    setFinanceMessage(error?error.message:'Despesa registrada.');if(!error){event.currentTarget.reset();await loadFinance();}
  });

  $('#admin-logout').addEventListener('click',async()=>{
    await window.gmSupabase.auth.signOut();window.gmOrdersChannel?.unsubscribe();panel.hidden=true;login.hidden=false;note('Você saiu do painel administrativo.');
  });

  window.gmSupabase.auth.getSession().then(({data,error})=>{
    if(error){note(error.message);return;}if(data?.session)checkStaff();
  });
});
