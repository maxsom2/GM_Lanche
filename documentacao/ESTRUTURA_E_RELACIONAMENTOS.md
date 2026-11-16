# Estrutura e integração — GM Lanches

Esta documentação descreve como o site se comunica com o banco GM_Lanche já criado no Supabase a partir do SQL executado anteriormente. O pacote não contém uma migration nova; não execute o SQL de outro pacote sobre o banco existente.

## Tabelas previstas no esquema

- `customers`: perfil opcional ligado ao Supabase Auth.
- `staff_members`: contas autorizadas a operar a loja.
- `customer_addresses`: endereços salvos dos clientes cadastrados.
- `products`: lanches, preços, disponibilidade e exibição.
- `ingredients`: catálogo de ingredientes.
- `product_ingredients`: composição de cada lanche e quantidade de cada ingrediente.
- `neighborhoods`: bairros atendidos e taxa de entrega.
- `store_settings`: configuração da loja e tempo padrão de preparo.
- `store_hours`: horário por dia da semana.
- `orders`: cabeçalho do pedido, cliente, entrega, total e estado.
- `order_items`: itens e preço no momento do pedido.
- `order_item_removed_ingredients`: ingredientes retirados.
- `payments`: forma e estado do pagamento presencial.
- `order_status_history`: histórico de mudanças de status.
- `order_cancellation_requests`: solicitação e decisão sobre cancelamento.

## Relacionamentos principais

- `customers 1:N customer_addresses`.
- `customers 1:N orders`; para pedidos de visitantes, `customer_id` pode ficar nulo.
- `neighborhoods 1:N customer_addresses` e `neighborhoods 1:N orders`.
- `products N:N ingredients` por `product_ingredients`.
- `orders 1:N order_items`.
- `order_items 1:N order_item_removed_ingredients`.
- `orders 1:1 payments`.
- `orders 1:N order_status_history`.
- `orders 1:0..1 order_cancellation_requests`.
- `staff_members.user_id` referencia uma conta do Supabase Auth.

## RPCs chamadas pelo site

- `is_staff()` — verifica se a conta autenticada está autorizada na equipe.
- `is_store_open(p_at)` — informa se a loja está recebendo pedidos no horário consultado.
- `create_order(p_payload)` — valida e grava um pedido.
- `track_order(p_order_number, p_phone)` — consulta o pedido com número e telefone.
- `request_order_cancellation(p_order_number, p_phone, p_reason)` — cria solicitação de cancelamento.
- `staff_update_order(p_order_id, p_new_status, p_estimated_prep_minutes, p_staff_notes)` — atualiza estado e previsão.
- `staff_resolve_cancellation(p_request_id, p_decision, p_staff_note)` — aprova ou recusa cancelamento.
- `staff_mark_payment_paid(p_order_id)` — registra pagamento presencial.

## Leitura direta de dados

O cardápio é carregado com consultas em `products`, `product_ingredients` e `ingredients`. As taxas são carregadas diretamente de `neighborhoods`. As telas administrativas leem e atualizam as tabelas previstas nas políticas de equipe. Os relatórios agregam `orders` e `order_items` no navegador após a leitura autenticada, sem depender de views específicas.

## O que não é usado

O site não chama `get_public_menu()` nem `get_delivery_neighborhoods()`, porque essas funções não apareceram no inventário mostrado nas capturas do projeto. Também não depende das views de relatório. O histórico é exibido com os dados retornados por `track_order()`.
