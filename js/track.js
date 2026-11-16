document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('track-form');
  const result = document.getElementById('track-result');
  if (!form || !result) return;

  const statusLabels = {
    received: 'Recebido', confirmed: 'Confirmado', preparing: 'Em preparo',
    ready: 'Pronto', out_for_delivery: 'Saiu para entrega',
    completed: 'Concluído', cancelled: 'Cancelado'
  };
  const paymentLabels = { pix: 'Pix', cash: 'Dinheiro', card_machine: 'Cartão na maquininha' };
  const note = text => { result.innerHTML = `<div class="notice">${GM.escape(text)}</div>`; };

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!window.gmSupabaseReady) {
      note('Configure a chave pública do Supabase em js/config.js para consultar pedidos reais.');
      return;
    }
    const formData = new FormData(form);
    const number = String(formData.get('order_number') || '').trim();
    const phone = String(formData.get('phone') || '').trim();
    const button = form.querySelector('button[type="submit"]');
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'Consultando…';
    result.innerHTML = '';

    let data, error;
    try {
      ({ data, error } = await window.gmSupabase.rpc('track_order', { p_order_number: number, p_phone: phone }));
    } catch (requestError) {
      error = requestError;
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
    if (error) { note('Não foi possível consultar o pedido agora. ' + (error.message || 'Verifique a conexão.')); return; }
    if (!data) { note('Não encontramos um pedido com esse número e telefone. Confira os dados e tente novamente.'); return; }

    const items = (data.items || []).map(item => `<li>${Number(item.quantity)}× ${GM.escape(item.name)} — ${GM.money(item.line_total)}${item.removed_ingredients?.length ? ' · Sem ' + item.removed_ingredients.map(GM.escape).join(', ') : ''}</li>`).join('');
    const history = (data.history || []).map(item => `<li>${GM.escape(statusLabels[item.status] || item.status)} · ${new Date(item.at).toLocaleString('pt-BR')}${item.note ? ' · ' + GM.escape(item.note) : ''}</li>`).join('');
    const mayCancel = !['completed', 'cancelled', 'ready', 'out_for_delivery'].includes(data.status) && !data.cancellation_requested;
    const cancellationMessage = data.cancellation_status === 'pending'
      ? '<p class="notice">Sua solicitação de cancelamento está em análise pela equipe.</p>'
      : data.cancellation_status === 'denied'
        ? '<p class="notice">A equipe não aprovou o cancelamento deste pedido.</p>'
        : data.cancellation_status === 'approved'
          ? '<p class="notice">O cancelamento foi aprovado.</p>'
          : data.cancellation_requested ? '<p class="notice">Sua solicitação de cancelamento foi registrada.</p>' : '';

    result.innerHTML = `<article class="track-card">
      <span class="status-pill">${GM.escape(statusLabels[data.status] || data.status)}</span>
      <h2>Pedido #${GM.escape(data.order_number)}</h2>
      <p class="muted">${data.order_type === 'delivery' ? 'Entrega' : 'Retirada'} · ${new Date(data.created_at).toLocaleString('pt-BR')}</p>
      ${data.neighborhood ? `<p>Bairro: ${GM.escape(data.neighborhood)}</p>` : ''}
      <p>Pagamento: ${GM.escape(paymentLabels[data.payment_method] || data.payment_method)} · ${data.payment_status === 'paid' ? 'Pago' : 'Pendente'}</p>
      <h3>Itens do pedido</h3><ul>${items || '<li>Itens não disponíveis para consulta.</li>'}</ul>
      <div class="summary-row"><span>Subtotal</span><strong>${GM.money(data.subtotal)}</strong></div>
      <div class="summary-row"><span>Entrega</span><strong>${GM.money(data.delivery_fee)}</strong></div>
      <div class="summary-row summary-total"><span>Total</span><strong>${GM.money(data.total)}</strong></div>
      ${data.estimated_prep_minutes ? `<p>Previsão de preparo: ${Number(data.estimated_prep_minutes)} minutos.</p>` : ''}
      ${data.estimated_ready_at ? `<p>Previsão de conclusão: ${new Date(data.estimated_ready_at).toLocaleString('pt-BR')}</p>` : ''}
      ${cancellationMessage}
      <h3>Histórico do pedido</h3><ul>${history || '<li>Histórico ainda não disponível.</li>'}</ul>
      ${mayCancel ? `<form id="cancel-form" class="cancel-form"><label>Motivo do cancelamento (opcional)<input name="reason" maxlength="300"></label><button class="btn btn-ghost" type="submit">Solicitar cancelamento</button></form>` : ''}
    </article>`;

    const cancelForm = result.querySelector('#cancel-form');
    cancelForm?.addEventListener('submit', async cancelEvent => {
      cancelEvent.preventDefault();
      const cancelButton = cancelForm.querySelector('button[type="submit"]');
      cancelButton.disabled = true;
      const reason = new FormData(cancelForm).get('reason');
      let cancelData, cancelError;
      try {
        ({ data: cancelData, error: cancelError } = await window.gmSupabase.rpc('request_order_cancellation', {
          p_order_number: number, p_phone: phone, p_reason: reason || null
        }));
      } catch (requestError) { cancelError = requestError; }
      if (cancelError) {
        cancelButton.disabled = false;
        note(cancelError.message || 'Não foi possível solicitar o cancelamento.');
        return;
      }
      note(cancelData?.message || 'Solicitação enviada para análise da equipe.');
      form.requestSubmit();
    });
  });
});
