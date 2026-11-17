document.addEventListener('DOMContentLoaded', async () => {
  const signup = document.getElementById('signup-form');
  const login = document.getElementById('login-form');
  const panels = document.getElementById('auth-panels');
  const dashboard = document.getElementById('account-dashboard');
  const message = document.getElementById('account-message');
  if (!signup || !login || !panels || !dashboard || !message) return;

  const $ = (selector, root = document) => root.querySelector(selector);
  const note = text => { message.hidden = false; message.textContent = text; };
  const escape = value => GM.escape(value);
  const money = value => GM.money(Number(value || 0));
  const statusLabels = { received:'Recebido', confirmed:'Confirmado', preparing:'Em preparo', ready:'Pronto', out_for_delivery:'Saiu para entrega', completed:'Concluído', cancelled:'Cancelado' };
  const isActive = status => !['completed','cancelled'].includes(status);
  let customerId = null;
  let ordersCache = [];

  if (!window.gmSupabaseReady) {
    note('A conta será ativada quando a chave publicável do Supabase estiver configurada. Você ainda pode consultar o pedido pelo número e telefone na página Acompanhar pedido.');
    return;
  }

  function renderOrders() {
    const host = $('#account-orders');
    const query = String($('#account-order-search').value || '').trim().toLowerCase().replace(/^#/,'');
    const filter = $('#account-order-filter').value;
    const rows = ordersCache.filter(order => {
      const matchesQuery = !query || String(order.order_number).includes(query);
      const matchesFilter = filter === 'all' || (filter === 'active' && isActive(order.status)) || order.status === filter;
      return matchesQuery && matchesFilter;
    });
    if (!rows.length) {
      host.innerHTML = `<div class="account-empty"><strong>${ordersCache.length ? 'Nenhum pedido encontrado' : 'Seu histórico está vazio'}</strong><p>${ordersCache.length ? 'Tente outro número ou mude o filtro.' : 'Quando fizer um pedido com sua conta, ele aparecerá aqui.'}</p><a class="btn btn-primary btn-small" href="cardapio.html">Ver cardápio</a></div>`;
      return;
    }
    host.innerHTML = rows.map(order => `
      <article class="account-order-card">
        <div class="account-order-top"><div><span class="account-order-number">Pedido #${escape(order.order_number)}</span><small>${new Date(order.created_at).toLocaleString('pt-BR')}</small></div><span class="account-status ${escape(order.status)}">${statusLabels[order.status] || escape(order.status)}</span></div>
        <div class="account-order-meta"><span>${order.order_type === 'delivery' ? 'Entrega' : 'Retirada'}</span><span>${order.payment_status === 'paid' ? 'Pagamento recebido' : 'Pagamento pendente'}</span></div>
        <div class="account-order-bottom"><strong>${money(order.total)}</strong><div><button class="account-copy-button" type="button" data-copy-order="${escape(order.order_number)}">Copiar número</button><a class="btn btn-primary btn-small" href="acompanhar.html?pedido=${encodeURIComponent(order.order_number)}">Ver andamento</a></div></div>
      </article>`).join('');
  }

  async function loadAddresses() {
    const host = $('#saved-addresses');
    if (!customerId) { host.innerHTML = ''; return; }
    const { data, error } = await window.gmSupabase.from('customer_addresses')
      .select('id,label,street,street_number,complement,reference_point,is_default,neighborhoods(name)')
      .eq('customer_id', customerId).order('is_default', { ascending:false });
    if (error) { host.innerHTML = `<p class="muted">Não foi possível carregar endereços: ${escape(error.message)}</p>`; return; }
    $('#account-address-count').textContent = String((data || []).length);
    host.innerHTML = (data || []).map(address => `
      <div class="saved-address-row"><div><strong>${escape(address.label || 'Endereço')}${address.is_default ? ' · Principal' : ''}</strong><small>${escape(address.street)}, ${escape(address.street_number)} · ${escape(address.neighborhoods?.name || '')}</small>${address.complement ? `<small>${escape(address.complement)}</small>` : ''}</div><button class="btn btn-ghost btn-small" type="button" data-remove-address="${address.id}">Remover</button></div>`).join('') || '<p class="muted">Nenhum endereço salvo.</p>';
  }

  async function refresh() {
    try {
      const { data: sessionData, error: sessionError } = await window.gmSupabase.auth.getSession();
      if (sessionError) { note(sessionError.message); return; }
      if (!sessionData?.session) { panels.hidden = false; dashboard.hidden = true; return; }
      const { data: userData, error: authError } = await window.gmSupabase.auth.getUser();
      if (authError) { note(authError.message); return; }
      const user = userData?.user;
      if (!user) { panels.hidden = false; dashboard.hidden = true; return; }

      panels.hidden = true; dashboard.hidden = false;
      const { data: profile, error: profileError } = await window.gmSupabase.from('customers')
        .select('id,full_name,phone,email').eq('auth_user_id', user.id).maybeSingle();
      if (profileError) { note(profileError.message); return; }
      if (!profile) { note('Não encontramos o cadastro do cliente vinculado a esta conta.'); return; }
      customerId = profile.id;
      $('#account-greeting').textContent = (profile.full_name || 'cliente').split(' ')[0];
      dashboard.querySelector('#profile-form [name="full_name"]').value = profile.full_name || '';
      dashboard.querySelector('#profile-form [name="phone"]').value = profile.phone || '';
      dashboard.querySelector('#profile-form [name="email"]').value = profile.email || '';

      const { data: orders, error: ordersError } = await window.gmSupabase.from('orders')
        .select('order_number,status,total,created_at,order_type,payment_status')
        .eq('customer_id', customerId).order('created_at', { ascending:false }).limit(100);
      const orderHost = $('#account-orders');
      if (ordersError) { orderHost.innerHTML = `<p class="muted">Não foi possível carregar seu histórico: ${escape(ordersError.message)}</p>`; }
      else {
        ordersCache = orders || [];
        $('#account-total-orders').textContent = String(ordersCache.length);
        $('#account-active-orders').textContent = String(ordersCache.filter(order => isActive(order.status)).length);
        renderOrders();
      }

      const { data: neighborhoods, error: neighborhoodError } = await window.GMData.getNeighborhoods({ activeOnly:true });
      const select = $('#saved-address-form [name="neighborhood_id"]');
      if (select && !neighborhoodError && Array.isArray(neighborhoods)) {
        select.innerHTML = '<option value="">Selecione o bairro</option>' + neighborhoods.map(item => `<option value="${item.id}">${escape(item.name)}</option>`).join('');
      } else if (neighborhoodError) {
        note(`Não foi possível carregar os bairros para endereço: ${neighborhoodError.message}`);
      }
      await loadAddresses();
    } catch (error) {
      note(error?.message || 'Não foi possível carregar sua conta. Atualize a página e tente novamente.');
    }
  }

  signup.addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(signup);
    const button = signup.querySelector('button[type="submit"]');
    button.disabled = true; button.textContent = 'Criando conta…';
    try {
      const { data: response, error } = await window.gmSupabase.auth.signUp({
        email: data.get('email'), password: data.get('password'),
        options: { data: { full_name:data.get('full_name'), phone:data.get('phone') } }
      });
      if (error) note(error.message);
      else if (response?.session) { note('Conta criada. Seus dados já estão disponíveis.'); await refresh(); }
      else note('Cadastro enviado. Confira o e-mail se a confirmação estiver ativada e depois entre na conta.');
    } catch (error) { note(error?.message || 'Não foi possível criar a conta.'); }
    finally { button.disabled = false; button.textContent = 'Criar minha conta'; }
  });

  login.addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(login); const button = login.querySelector('button[type="submit"]');
    button.disabled = true; button.textContent = 'Entrando…';
    try {
      const { error } = await window.gmSupabase.auth.signInWithPassword({ email:data.get('email'), password:data.get('password') });
      if (error) note(error.message); else { note('Login realizado.'); await refresh(); }
    } catch (error) { note(error?.message || 'Não foi possível entrar.'); }
    finally { button.disabled = false; button.textContent = 'Entrar'; }
  });

  $('#profile-form').addEventListener('submit', async event => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const { data:userData, error:userError } = await window.gmSupabase.auth.getUser();
    if (userError || !userData?.user) { note(userError?.message || 'Entre novamente na conta.'); return; }
    const { error } = await window.gmSupabase.from('customers').update({ full_name:data.get('full_name'), phone:data.get('phone') }).eq('auth_user_id',userData.user.id);
    note(error ? error.message : 'Dados atualizados.');
    if (!error) $('#account-greeting').textContent = String(data.get('full_name')).split(' ')[0];
  });

  $('#saved-address-form').addEventListener('submit', async event => {
    event.preventDefault(); const form=event.currentTarget; const data=new FormData(form);
    if (!customerId) { note('Entre na conta para salvar um endereço.'); return; }
    if (data.get('is_default') === 'on') {
      const { error:clearError } = await window.gmSupabase.from('customer_addresses').update({is_default:false}).eq('customer_id',customerId);
      if (clearError) { note(clearError.message); return; }
    }
    const { error } = await window.gmSupabase.from('customer_addresses').insert({
      customer_id:customerId,label:data.get('label') || 'Endereço',neighborhood_id:data.get('neighborhood_id'),
      street:data.get('street'),street_number:data.get('street_number'),complement:data.get('complement') || null,
      reference_point:data.get('reference_point') || null,postal_code:data.get('postal_code') || null,is_default:data.get('is_default')==='on'
    });
    note(error ? error.message : 'Endereço salvo.'); if (!error) form.reset(); await loadAddresses();
  });

  $('#saved-addresses').addEventListener('click', async event => {
    const button=event.target.closest('[data-remove-address]'); if (!button || !customerId) return;
    const { error }=await window.gmSupabase.from('customer_addresses').delete().eq('id',button.dataset.removeAddress).eq('customer_id',customerId);
    note(error ? error.message : 'Endereço removido.'); await loadAddresses();
  });

  $('#account-order-search').addEventListener('input',renderOrders);
  $('#account-order-filter').addEventListener('change',renderOrders);
  $('#account-orders').addEventListener('click',async event=>{
    const button=event.target.closest('[data-copy-order]');if(!button)return;
    try { await navigator.clipboard.writeText(String(button.dataset.copyOrder)); button.textContent='Copiado'; }
    catch { note(`Número do pedido: #${button.dataset.copyOrder}`); }
  });

  $('#logout-button').addEventListener('click',async()=>{
    await window.gmSupabase.auth.signOut();customerId=null;ordersCache=[];dashboard.hidden=true;panels.hidden=false;note('Você saiu da sua conta.');
  });

  await refresh();
});
