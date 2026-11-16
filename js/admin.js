document.addEventListener('DOMContentLoaded', () => {
  const login = document.getElementById('admin-login');
  const panel = document.getElementById('admin-panel');
  const message = document.getElementById('admin-message');
  if (!login || !panel || !message) return;

  const note = text => { message.hidden = false; message.textContent = text; };
  const statusLabels = {
    received: 'Recebido', confirmed: 'Confirmado', preparing: 'Em preparo',
    ready: 'Pronto para retirada', out_for_delivery: 'Saiu para entrega',
    completed: 'Concluído', cancelled: 'Cancelado'
  };
  const paymentLabels = { pix: 'Pix', cash: 'Dinheiro', card_machine: 'Cartão na maquininha' };

  login.addEventListener('submit', event => event.preventDefault());
  if (!window.gmSupabaseReady) {
    note('Configure a chave pública do Supabase em js/config.js. O painel exige uma conta cadastrada em staff_members.');
    return;
  }

  async function loadOrders() {
    const host = document.getElementById('admin-orders');
    host.innerHTML = '<p class="muted">Carregando pedidos…</p>';
    const { data, error } = await window.gmSupabase.from('orders')
      .select('*, order_items(*, order_item_removed_ingredients(ingredient_name_snapshot))')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) { host.textContent = error.message; return; }
    if (!data?.length) { host.innerHTML = '<div class="empty-state">Nenhum pedido recebido.</div>'; return; }

    host.innerHTML = data.map(order => `
      <article class="admin-order">
        <div class="admin-order-head"><div>
          <h3>Pedido #${GM.escape(order.order_number)} · ${GM.escape(order.customer_name)}</h3>
          <p>${new Date(order.created_at).toLocaleString('pt-BR')} · ${order.order_type === 'delivery' ? 'Entrega' : 'Retirada'} · ${GM.escape(order.customer_phone)}</p>
          <p>${GM.escape(order.delivery_address || '')} ${order.neighborhood_name_snapshot ? '· ' + GM.escape(order.neighborhood_name_snapshot) : ''}</p>
        </div><span class="status-pill">${statusLabels[order.status] || GM.escape(order.status)}</span></div>
        <ul>${(order.order_items || []).map(item => `<li>${item.quantity}× ${GM.escape(item.product_name_snapshot)} — ${GM.money(item.line_total)}${item.order_item_removed_ingredients?.length ? ' · Sem ' + item.order_item_removed_ingredients.map(removed => GM.escape(removed.ingredient_name_snapshot)).join(', ') : ''}${item.item_notes ? ' · ' + GM.escape(item.item_notes) : ''}</li>`).join('')}</ul>
        <p>Pagamento: ${paymentLabels[order.payment_method] || GM.escape(order.payment_method)} · ${order.payment_status === 'paid' ? 'Pago' : 'Pendente'} · Total: <strong>${GM.money(order.total)}</strong></p>
        ${order.customer_notes ? `<p>Observações do cliente: ${GM.escape(order.customer_notes)}</p>` : ''}${order.cancellation_requested ? '<p class="notice">O cliente solicitou o cancelamento deste pedido.</p>' : ''}
        <div class="admin-order-actions">
          <label>Status<select data-status="${order.id}">${Object.entries(statusLabels).map(([value, label]) => `<option value="${value}" ${value === order.status ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
          <label>Preparo (min)<input data-prep="${order.id}" type="number" min="1" max="360" value="${order.estimated_prep_minutes || 30}" style="width:90px"></label>
          <button class="btn btn-primary btn-small" type="button" data-save-order="${order.id}">Salvar</button>
          ${order.payment_status !== 'paid' ? `<button class="btn btn-ghost btn-small" type="button" data-paid="${order.id}">Marcar pago</button>` : ''}
          ${order.cancellation_requested ? `<button class="btn btn-ghost btn-small" type="button" data-cancel="${order.id}" data-decision="approved">Aprovar cancelamento</button><button class="btn btn-ghost btn-small" type="button" data-cancel="${order.id}" data-decision="denied">Recusar cancelamento</button>` : ''}
        </div>
      </article>`).join('');
  }

  async function loadProducts() {
    const host = document.getElementById('admin-products');
    const { data, error } = await window.gmSupabase.from('products')
      .select('id,name,price,is_available,is_listed').order('display_order');
    if (error) { host.textContent = error.message; return; }
    host.innerHTML = (data || []).map(product => `
      <div class="admin-row"><strong>${GM.escape(product.name)}</strong>
        <div class="admin-order-actions">
          <label>Preço (R$)<input data-price="${product.id}" type="number" min="0" step="0.01" value="${product.price}" style="width:110px"></label>
          <label>Disponibilidade<select data-available="${product.id}"><option value="true" ${product.is_available ? 'selected' : ''}>Disponível</option><option value="false" ${!product.is_available ? 'selected' : ''}>Indisponível</option></select></label>
          <button class="btn btn-primary btn-small" type="button" data-save-product="${product.id}">Salvar</button>
        </div>
      </div>`).join('');
  }

  async function loadDelivery() {
    const [{ data: neighborhoods, error: neighborhoodError }, { data: settings, error: settingsError }, { data: hours, error: hoursError }] = await Promise.all([
      window.gmSupabase.from('neighborhoods').select('*').order('name'),
      window.gmSupabase.from('store_settings').select('*').eq('id', 1).maybeSingle(),
      window.gmSupabase.from('store_hours').select('*').order('weekday')
    ]);

    const neighborhoodHost = document.getElementById('neighborhood-list');
    if (neighborhoodError) neighborhoodHost.textContent = neighborhoodError.message;
    else neighborhoodHost.innerHTML = (neighborhoods || []).map(item => `
      <div class="admin-row"><strong>${GM.escape(item.name)}</strong>
        <div class="admin-order-actions">
          <label>Taxa (R$)<input data-neighbor-fee="${item.id}" type="number" min="0" step="0.01" value="${item.delivery_fee}" style="width:105px"></label>
          <label>Estado<select data-neighbor-active="${item.id}"><option value="true" ${item.is_active ? 'selected' : ''}>Ativo</option><option value="false" ${!item.is_active ? 'selected' : ''}>Desativado</option></select></label>
          <button class="btn btn-primary btn-small" type="button" data-save-neighborhood="${item.id}">Salvar</button>
        </div>
      </div>`).join('') || '<p class="muted">Nenhum bairro cadastrado.</p>';

    if (settingsError) note(settingsError.message);
    if (settings) {
      const form = document.getElementById('store-settings-form');
      form.elements.accepts_orders.value = String(settings.accepts_orders);
      form.elements.manually_closed.value = String(settings.manually_closed);
      form.elements.default_prep_minutes.value = settings.default_prep_minutes;
    }

    const hoursHost = document.getElementById('store-hours-fields');
    if (hoursError) { hoursHost.textContent = hoursError.message; return; }
    const dayNames = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
    const hoursByDay = new Map((hours || []).map(item => [item.weekday, item]));
    hoursHost.innerHTML = dayNames.map((name, index) => {
      const day = hoursByDay.get(index + 1) || { opens_at: '18:00:00', closes_at: '23:59:00', is_closed: false };
      return `<div class="hour-row"><strong>${name}</strong>
        <label>Abertura<input type="time" name="open_${index + 1}" value="${String(day.opens_at || '18:00:00').slice(0, 5)}"></label>
        <label>Fechamento<input type="time" name="close_${index + 1}" value="${String(day.closes_at || '23:59:00').slice(0, 5)}"></label>
        <label><input type="checkbox" name="closed_${index + 1}" ${day.is_closed ? 'checked' : ''}> Fechado</label>
      </div>`;
    }).join('');
  }

  async function loadReports() {
    const host = document.getElementById('admin-reports');
    const period = document.getElementById('report-period')?.value || 'week';
    const days = period === 'day' ? 1 : period === 'month' ? 30 : 7;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));

    // Relatórios calculados diretamente das tabelas orders e order_items.
    // Isso evita depender de views que podem não existir no banco já instalado.
    const { data: orders, error } = await window.gmSupabase.from('orders')
      .select('id,status,total,payment_method,created_at,order_items(product_name_snapshot,quantity,line_total)')
      .gte('created_at', start.toISOString())
      .order('created_at', { ascending: false });
    if (error) { host.textContent = error.message; document.getElementById('payment-report').textContent = ''; return; }

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
      <div class="report-card"><strong>${GM.money(completed.reduce((sum, order) => sum + Number(order.total || 0), 0))}</strong><span>Total vendido</span></div>
      <div class="report-card"><strong>${cancelled.length}</strong><span>Pedidos cancelados</span></div>
      <div class="report-card" style="grid-column:1/-1"><h3>Mais vendidos</h3>
        ${bestSellers.map(item => `<div class="neighborhood-row"><span>${GM.escape(item.name)}</span><strong>${item.quantity} un. · ${GM.money(item.total)}</strong></div>`).join('') || '<p class="muted">Sem vendas concluídas no período.</p>'}
      </div>`;
    document.getElementById('payment-report').innerHTML = [...payments.entries()].map(([method, item]) => `
      <div class="neighborhood-row"><span>${paymentLabels[method] || GM.escape(method)}</span><strong>${item.count} pedidos · ${GM.money(item.total)}</strong></div>`).join('') || '<p class="muted">Sem pedidos concluídos no período.</p>';
  }

  async function checkStaff() {
    const { data, error } = await window.gmSupabase.rpc('is_staff');
    if (error || data !== true) {
      await window.gmSupabase.auth.signOut();
      note('Esta conta não está cadastrada como funcionário autorizado em staff_members.');
      return false;
    }
    login.hidden = true;
    panel.hidden = false;
    await Promise.all([loadOrders(), loadProducts(), loadDelivery(), loadReports()]);
    window.gmOrdersChannel?.unsubscribe();
    window.gmOrdersChannel = window.gmSupabase.channel('gm-orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, payload => {
        note(`Novo pedido recebido${payload.new?.order_number ? ` #${payload.new.order_number}` : ''}. A lista foi atualizada.`);
        loadOrders();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, () => loadOrders())
      .subscribe();
    return true;
  }

  login.addEventListener('submit', async event => {
    event.preventDefault();
    const formData = new FormData(login);
    const { error } = await window.gmSupabase.auth.signInWithPassword({ email: formData.get('email'), password: formData.get('password') });
    if (error) { note(error.message); return; }
    await checkStaff();
  });

  panel.addEventListener('click', async event => {
    const tab = event.target.closest('[data-tab]');
    if (tab) {
      panel.querySelectorAll('.tab-button').forEach(button => button.classList.toggle('active', button === tab));
      panel.querySelectorAll('.admin-tab').forEach(section => section.classList.toggle('active', section.id === `tab-${tab.dataset.tab}`));
      return;
    }

    const saveOrder = event.target.closest('[data-save-order]');
    if (saveOrder) {
      const id = saveOrder.dataset.saveOrder;
      const status = panel.querySelector(`[data-status="${id}"]`).value;
      const prep = Number(panel.querySelector(`[data-prep="${id}"]`).value);
      const { error } = await window.gmSupabase.rpc('staff_update_order', {
        p_order_id: id, p_new_status: status, p_estimated_prep_minutes: prep, p_staff_notes: null
      });
      note(error ? error.message : 'Pedido atualizado.');
      await loadOrders();
      await loadReports();
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
      await loadOrders();
      await loadReports();
      return;
    }

    const saveProduct = event.target.closest('[data-save-product]');
    if (saveProduct) {
      const id = saveProduct.dataset.saveProduct;
      const price = Number(panel.querySelector(`[data-price="${id}"]`).value);
      const available = panel.querySelector(`[data-available="${id}"]`).value === 'true';
      const { error } = await window.gmSupabase.from('products').update({ price, is_available: available }).eq('id', id);
      note(error ? error.message : 'Produto atualizado.');
      await loadProducts();
      return;
    }

    const saveNeighborhood = event.target.closest('[data-save-neighborhood]');
    if (saveNeighborhood) {
      const id = saveNeighborhood.dataset.saveNeighborhood;
      const fee = Number(panel.querySelector(`[data-neighbor-fee="${id}"]`).value);
      const active = panel.querySelector(`[data-neighbor-active="${id}"]`).value === 'true';
      const { error } = await window.gmSupabase.from('neighborhoods').update({ delivery_fee: fee, is_active: active }).eq('id', id);
      note(error ? error.message : 'Bairro atualizado.');
      await loadDelivery();
    }
  });

  document.getElementById('refresh-orders').addEventListener('click', loadOrders);
  document.getElementById('neighborhood-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const { error } = await window.gmSupabase.from('neighborhoods').insert({ name: formData.get('name'), delivery_fee: Number(formData.get('delivery_fee')) });
    note(error ? error.message : 'Bairro adicionado.');
    if (!error) form.reset();
    await loadDelivery();
  });

  document.getElementById('store-settings-form').addEventListener('submit', async event => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const { error } = await window.gmSupabase.from('store_settings').update({
      accepts_orders: formData.get('accepts_orders') === 'true',
      manually_closed: formData.get('manually_closed') === 'true',
      default_prep_minutes: Number(formData.get('default_prep_minutes'))
    }).eq('id', 1);
    note(error ? error.message : 'Configurações salvas.');
  });

  document.getElementById('store-hours-form').addEventListener('submit', async event => {
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

  document.getElementById('report-period').addEventListener('change', loadReports);
  document.getElementById('admin-logout').addEventListener('click', async () => {
    await window.gmSupabase.auth.signOut();
    window.gmOrdersChannel?.unsubscribe();
    panel.hidden = true;
    login.hidden = false;
  });

  window.gmSupabase.auth.getSession().then(({ data }) => { if (data.session) checkStaff(); });
});
