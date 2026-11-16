
document.addEventListener('DOMContentLoaded', async () => {
  const signup = document.getElementById('signup-form');
  const login = document.getElementById('login-form');
  const panels = document.getElementById('auth-panels');
  const dashboard = document.getElementById('account-dashboard');
  const message = document.getElementById('account-message');

  if (!signup) return;

  const note = text => {
    message.hidden = false;
    message.textContent = text;
  };

  signup.addEventListener('submit', event => event.preventDefault());
  login.addEventListener('submit', event => event.preventDefault());

  if (!window.gmSupabaseReady) {
    note('A conta de cliente será ativada depois de configurar o Supabase em js/config.js. Você poderá fazer pedidos como visitante quando a conexão estiver pronta.');
    return;
  }

  let customerId = null;

  async function loadAddresses() {
    const host = document.getElementById('saved-addresses');

    if (!customerId) {
      host.innerHTML = '';
      return;
    }

    const { data, error } = await window.gmSupabase
      .from('customer_addresses')
      .select('id,label,street,street_number,complement,reference_point,is_default,neighborhoods(name)')
      .eq('customer_id', customerId)
      .order('is_default', { ascending: false });

    if (error) {
      host.innerHTML = `<p class="muted">${GM.escape(error.message)}</p>`;
      return;
    }

    host.innerHTML = (data || []).map(address => `
      <div class="neighborhood-row">
        <span>
          <strong>${GM.escape(address.label || 'Endereço')}</strong>
          ${address.is_default ? ' · Principal' : ''}
          <br>
          ${GM.escape(address.street)}, ${GM.escape(address.street_number)}
          · ${GM.escape(address.neighborhoods?.name || '')}
          ${address.complement ? '· ' + GM.escape(address.complement) : ''}
        </span>
        <button class="btn btn-small btn-ghost" type="button"
          data-remove-address="${address.id}">
          Remover
        </button>
      </div>
    `).join('') || '<p class="muted">Nenhum endereço salvo.</p>';
  }

  async function refresh() {
    try {
      const { data: sessionData, error: sessionError } =
        await window.gmSupabase.auth.getSession();

      if (sessionError) {
        note(sessionError.message);
        return;
      }

      if (!sessionData?.session) {
        panels.hidden = false;
        dashboard.hidden = true;
        return;
      }

      const { data: userData, error: authError } =
        await window.gmSupabase.auth.getUser();

      if (authError) {
        note(authError.message);
        return;
      }

      const user = userData?.user;

      if (!user) {
        panels.hidden = false;
        dashboard.hidden = true;
        return;
      }

      panels.hidden = true;
      dashboard.hidden = false;

      const { data: profile, error: profileError } =
        await window.gmSupabase
          .from('customers')
          .select('id,full_name,phone,email')
          .eq('auth_user_id', user.id)
          .maybeSingle();

      if (profileError) {
        note(profileError.message);
        return;
      }

      if (!profile) {
        note('Não encontramos o cadastro do cliente. Confira o gatilho de cadastro de usuário no Supabase.');
        return;
      }

      customerId = profile.id;

      dashboard.querySelector('[name="full_name"]').value =
        profile.full_name || '';

      dashboard.querySelector('[name="phone"]').value =
        profile.phone || '';

      dashboard.querySelector('[name="email"]').value =
        profile.email || '';

      const { data: orders, error: ordersError } =
        await window.gmSupabase
          .from('orders')
          .select('order_number,status,total,created_at')
          .eq('customer_id', customerId)
          .order('created_at', { ascending: false })
          .limit(20);

      const orderHost = document.getElementById('account-orders');

      orderHost.innerHTML = ordersError
        ? `<p class="muted">${GM.escape(ordersError.message)}</p>`
        : (orders || []).map(order => `
            <div class="neighborhood-row">
              <span>
                Pedido #${order.order_number} · ${GM.escape(order.status)}
              </span>
              <strong>${GM.money(order.total)}</strong>
            </div>
          `).join('') ||
          '<p class="muted">Nenhum pedido vinculado à conta ainda.</p>';

      const { data: neighborhoods, error: neighborhoodError } =
        await window.GMData.getNeighborhoods({ activeOnly: true });

      const select = document.querySelector(
        '#saved-address-form [name="neighborhood_id"]'
      );

      if (select && !neighborhoodError && Array.isArray(neighborhoods)) {
        select.innerHTML =
          '<option value="">Selecione</option>' +
          neighborhoods.map(item => `
            <option value="${item.id}">${GM.escape(item.name)}</option>
          `).join('');
      }

      await loadAddresses();

    } catch (error) {
      note(
        error?.message ||
        'Não foi possível carregar sua conta. Atualize a página e tente novamente.'
      );
    }
  }

  signup.addEventListener('submit', async event => {
    event.preventDefault();

    const formData = new FormData(signup);
    const button = signup.querySelector('button[type="submit"]');

    if (button) {
      button.disabled = true;
      button.textContent = 'Criando conta…';
    }

    try {
      const { data, error } = await window.gmSupabase.auth.signUp({
        email: formData.get('email'),
        password: formData.get('password'),
        options: {
          data: {
            full_name: formData.get('full_name'),
            phone: formData.get('phone')
          }
        }
      });

      if (error) {
        note(error.message);

      } else if (data?.session) {
        note('Conta criada e login iniciado. Seus dados já estão disponíveis.');
        await refresh();

      } else {
        note(
          'Cadastro enviado com sucesso. Se a confirmação de e-mail estiver ativada, abra sua caixa de entrada, confirme o endereço e depois entre com seu e-mail e senha.'
        );
      }

    } catch (error) {
      note(
        error?.message ||
        'Não foi possível criar a conta. Verifique sua conexão e tente novamente.'
      );

    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = 'Criar conta';
      }
    }
  });

  login.addEventListener('submit', async event => {
    event.preventDefault();

    const formData = new FormData(login);

    try {
      const { error } = await window.gmSupabase.auth.signInWithPassword({
        email: formData.get('email'),
        password: formData.get('password')
      });

      if (error) {
        note(error.message);
      } else {
        note('Login realizado.');
        await refresh();
      }

    } catch (error) {
      note(
        error?.message ||
        'Não foi possível entrar. Verifique sua conexão e tente novamente.'
      );
    }
  });

  dashboard.querySelector('#profile-form').addEventListener('submit', async event => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const { data: { user } } =
      await window.gmSupabase.auth.getUser();

    const { error } = await window.gmSupabase
      .from('customers')
      .update({
        full_name: formData.get('full_name'),
        phone: formData.get('phone')
      })
      .eq('auth_user_id', user.id);

    note(error ? error.message : 'Dados atualizados.');
  });

  document.getElementById('saved-address-form').addEventListener('submit', async event => {
    event.preventDefault();

    const addressForm = event.currentTarget;

    if (!customerId) {
      note('Entre na sua conta para salvar um endereço.');
      return;
    }

    const formData = new FormData(addressForm);

    if (formData.get('is_default') === 'on') {
      const { error: clearError } = await window.gmSupabase
        .from('customer_addresses')
        .update({ is_default: false })
        .eq('customer_id', customerId);

      if (clearError) {
        note(clearError.message);
        return;
      }
    }

    const { error } = await window.gmSupabase
      .from('customer_addresses')
      .insert({
        customer_id: customerId,
        label: formData.get('label') || 'Endereço',
        neighborhood_id: formData.get('neighborhood_id'),
        street: formData.get('street'),
        street_number: formData.get('street_number'),
        complement: formData.get('complement') || null,
        reference_point: formData.get('reference_point') || null,
        postal_code: formData.get('postal_code') || null,
        is_default: formData.get('is_default') === 'on'
      });

    note(error ? error.message : 'Endereço salvo.');

    if (!error) addressForm.reset();

    await loadAddresses();
  });

  document.getElementById('saved-addresses').addEventListener('click', async event => {
    const button = event.target.closest('[data-remove-address]');

    if (!button) return;

    const { error } = await window.gmSupabase
      .from('customer_addresses')
      .delete()
      .eq('id', button.dataset.removeAddress)
      .eq('customer_id', customerId);

    note(error ? error.message : 'Endereço removido.');

    await loadAddresses();
  });

  document.getElementById('logout-button').addEventListener('click', async () => {
    await window.gmSupabase.auth.signOut();
    customerId = null;
    await refresh();
  });

  await refresh();
});
