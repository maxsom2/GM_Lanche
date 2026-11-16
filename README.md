# GM Lanches — site alinhado ao banco já criado no Supabase

Este pacote é a versão do site para aproveitar o banco GM_Lanche que já foi criado no Supabase. **Não execute uma nova migration deste pacote**: a migration completa foi removida de propósito para evitar recriação/conflito com o banco que você já configurou.

## Logo oficial

A imagem enviada nesta conversa foi salva em `assets/logo-gm-lanches-oficial.jpg`. Ela é usada no cabeçalho de todas as páginas, no rodapé e no ícone da aba do navegador. O texto da marca não é desenhado por cima da imagem.

## Páginas

- `index.html`: início e destaques.
- `cardapio.html`: cardápio, composição dos produtos e retirada de ingredientes.
- `carrinho.html`: revisão de itens e quantidades.
- `finalizar.html`: retirada/entrega, bairro, endereço, observações e pagamento presencial.
- `acompanhar.html`: consulta do pedido por número e telefone, além de solicitação de cancelamento.
- `conta.html`: cadastro/login opcional, dados de perfil, endereços e histórico vinculado à conta.
- `admin.html`: painel da equipe, pedidos, disponibilidade, preços, bairros, horários, pagamentos e relatórios.

O menu do cabeçalho abre/fecha em telas pequenas e também fecha com Escape ou ao selecionar uma página.

## Compatibilidade com o SQL que já foi executado

O site foi ajustado para usar os nomes do esquema existente:

- Tabelas consultadas diretamente: `customers`, `staff_members`, `customer_addresses`, `products`, `ingredients`, `product_ingredients`, `neighborhoods`, `store_settings`, `store_hours`, `orders`, `order_items` e `order_cancellation_requests`.
- RPCs chamadas pelo site: `is_staff`, `is_store_open`, `create_order`, `track_order`, `request_order_cancellation`, `staff_update_order`, `staff_resolve_cancellation` e `staff_mark_payment_paid`.
- Cardápio: carregado com consultas diretas em `products`, `product_ingredients` e `ingredients`.
- Bairros: carregados diretamente de `neighborhoods`.
- Relatórios: calculados a partir de `orders` e `order_items`, sem depender das views `staff_sales_by_day`, `staff_best_sellers` ou `staff_payment_method_sales`.

Assim, o código não depende das funções extras `get_public_menu()` e `get_delivery_neighborhoods()`, que não apareceram no inventário de funções mostrado nas capturas do Supabase.

## Conectar à sua conta Supabase

1. Abra `js/config.js`.
2. A URL do projeto já foi preenchida com o identificador que aparece na captura do seu Supabase.
3. No Supabase, entre em Project Settings > API Keys e copie a chave publicável/anon.
4. Cole a chave em `SUPABASE_ANON_KEY`.
5. Salve o arquivo.

Use somente a chave publicável/anon no navegador. Nunca coloque `service_role` ou uma chave secreta em `js/config.js`.

## Acesso da equipe

O painel exige que a conta já exista em Supabase Authentication e esteja autorizada em `public.staff_members`. O arquivo `sql/CADASTRAR_FUNCIONARIO.sql` é somente para incluir uma conta da equipe após sua criação em Authentication > Users. Substitua os dois campos de exemplo antes de executá-lo.

## GitHub e Vercel

1. Crie um repositório no GitHub e envie o conteúdo desta pasta para a raiz dele.
2. Na Vercel, importe esse repositório.
3. A raiz do projeto deve conter `index.html` e as pastas `assets/`, `css/` e `js/`.
4. Não é necessário comando de build; o site é estático.
5. Faça commit/push no GitHub para publicar as alterações pela Vercel.

## Como abrir localmente

Use Live Server no VS Code ou outro servidor estático local. Abrir por `file://` pode bloquear chamadas externas. Sem chave pública configurada, o site permanece em modo de demonstração e não grava pedidos reais.

## Limites importantes

- O pacote foi alinhado ao esquema e às funções que aparecem nas capturas e no SQL anterior; não houve conexão direta à sua conta Supabase nesta etapa.
- Depois de preencher a chave pública, teste primeiro o cardápio, a leitura dos bairros e o login de funcionário.
- A equipe recebe novos pedidos no painel quando a tabela `orders` está habilitada na publicação Realtime do Supabase. O botão Atualizar pedidos continua disponível como alternativa.
- O pedido é criado pela RPC `create_order`; os valores são recalculados no banco. O pagamento continua presencial (Pix, dinheiro ou cartão na maquininha).
- Não há feed, posts, publicações, comentários, blog ou pagamento online.
