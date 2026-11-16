# Contrato entre o site e o SQL das seis partes executadas

Este documento registra os nomes que o front-end espera. Não é uma migration e não deve ser executado no SQL Editor.

## Tabelas consultadas pelo site

| Tabela | Uso no site |
|---|---|
| `customers` | Perfil vinculado à conta Supabase Auth |
| `staff_members` | Verificação do acesso da equipe |
| `customer_addresses` | Endereços salvos da conta |
| `products` | Nome, descrição, preço, imagem e disponibilidade |
| `ingredients` | Catálogo de ingredientes ativos |
| `product_ingredients` | Ingredientes que compõem cada produto |
| `neighborhoods` | Bairros ativos e taxa de entrega |
| `store_settings` | Recebimento, fechamento manual e tempo padrão |
| `store_hours` | Horários por dia da semana |
| `orders` | Pedidos, cliente, endereço, status e valores |
| `order_items` | Lanches e quantidades dentro do pedido |
| `order_item_removed_ingredients` | Ingredientes retirados em cada item |
| `payments` | Forma e situação do pagamento presencial |
| `order_status_history` | Histórico de mudanças do pedido |
| `order_cancellation_requests` | Pedidos de cancelamento e decisão da equipe |

## Funções RPC usadas

| Função | Parâmetros enviados pelo site | Uso |
|---|---|---|
| `is_store_open` | `p_at` | Conferir funcionamento |
| `is_staff` | nenhum | Verificar conta da equipe |
| `create_order` | `p_payload` JSON | Criar pedido com validação e cálculo no banco |
| `track_order` | `p_order_number`, `p_phone` | Consultar pedido como visitante |
| `request_order_cancellation` | `p_order_number`, `p_phone`, `p_reason` | Pedir cancelamento |
| `staff_update_order` | `p_order_id`, `p_new_status`, `p_estimated_prep_minutes`, `p_staff_notes` | Atualizar pedido e previsão |
| `staff_resolve_cancellation` | `p_request_id`, `p_decision`, `p_staff_note` | Aprovar ou recusar cancelamento |
| `staff_mark_payment_paid` | `p_order_id` | Registrar pagamento recebido presencialmente |

## Campos do payload de `create_order`

```json
{
  "name": "Nome do cliente",
  "phone": "(65) 99999-9999",
  "email": null,
  "order_type": "pickup",
  "payment_method": "pix",
  "items": [
    {
      "product_id": "UUID do produto",
      "quantity": 1,
      "removed_ingredient_ids": [],
      "notes": ""
    }
  ],
  "notes": "Observação geral",
  "neighborhood_id": null,
  "address": null
}
```

Para entrega, `order_type` passa a `delivery` e são enviados `neighborhood_id` e `address`. A taxa e os preços são validados/recalculados pelo banco, não pelo navegador.

## Funções opcionais que o site não exige

O front-end não depende de `get_public_menu()` ou `get_delivery_neighborhoods()`. O cardápio e os bairros são lidos diretamente das tabelas com RLS pública de leitura. Assim, não é necessário acrescentar essas RPCs somente para o site funcionar.

## Segurança esperada

- Visitantes leem apenas o cardápio e os bairros ativos.
- O site não faz INSERT direto em `orders`, `order_items` ou `payments`; chama `create_order`.
- Cliente autenticado consulta apenas seu perfil, endereços e histórico permitido pelas políticas.
- Funcionários ativos são verificados por `is_staff()` e usam operações `staff_*`.
- A chave `service_role` nunca deve ser colocada em `js/config.js`.
