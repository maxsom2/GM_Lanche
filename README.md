# GM Lanches — site organizado para o banco já criado

Este pacote é a versão de trabalho do site GM Lanches, preparada para usar a estrutura do banco criada pelas seis partes do SQL que já foram executadas no projeto Supabase informado pela equipe. **Não execute novamente o SQL completo e não recrie as tabelas.**

## Páginas

- `index.html` — apresentação, destaque do Big Duplo Especial e acesso rápido.
- `cardapio.html` — sete lanches, fotos ilustrativas, pesquisa, filtros e retirada de ingredientes.
- `carrinho.html` — quantidades, remoção de itens e resumo.
- `finalizar.html` — retirada/entrega, bairro, taxa, endereço e pagamento presencial.
- `acompanhar.html` — acompanhamento e solicitação de cancelamento por número + telefone.
- `conta.html` — cadastro/login opcional, dados, endereços e histórico de conta.
- `admin.html` — pedidos, status, tempo de preparo, cancelamentos, pagamentos, disponibilidade, preços, bairros, taxas, horários e relatórios.

## Navegação e visual

O menu lateral aparece em todas as páginas. No computador pode ser recolhido para o modo compacto; em celulares e tablets abre como gaveta lateral com fundo escurecido, botão de fechar e suporte à tecla Esc. O botão **Voltar** aparece em todas as páginas internas; quando não existe uma página anterior do próprio site, leva ao Início.

A logo oficial fornecida foi incluída em `assets/logo-gm-lanches-oficial.jpg`, usada na navegação, no cabeçalho móvel, no rodapé e no favicon. As fotos de hambúrgueres em `assets/products/` são imagens ilustrativas geradas para a interface, não fotografias dos produtos reais preparados pela loja.

## Compatibilidade com o SQL executado

O JavaScript usa as tabelas `customers`, `staff_members`, `customer_addresses`, `products`, `ingredients`, `product_ingredients`, `neighborhoods`, `store_settings`, `store_hours`, `orders`, `order_items`, `order_item_removed_ingredients`, `payments`, `order_status_history` e `order_cancellation_requests`.

As consultas ao cardápio e aos bairros são feitas diretamente nas tabelas `products`, `product_ingredients`, `ingredients` e `neighborhoods`, pois não dependem de funções opcionais `get_public_menu` ou `get_delivery_neighborhoods`.

Chamadas RPC usadas pelo site, conforme a estrutura das seis partes:

- `is_store_open(p_at)`
- `is_staff()`
- `create_order(p_payload)`
- `track_order(p_order_number, p_phone)`
- `request_order_cancellation(p_order_number, p_phone, p_reason)`
- `staff_update_order(p_order_id, p_new_status, p_estimated_prep_minutes, p_staff_notes)`
- `staff_resolve_cancellation(p_request_id, p_decision, p_staff_note)`
- `staff_mark_payment_paid(p_order_id)`

Os relatórios são calculados por consultas autenticadas às tabelas `orders` e `order_items`; o site não depende de views adicionais.

## Configuração necessária antes de receber pedidos reais

1. Abra `js/config.js`.
2. A URL do projeto Supabase identificado nas capturas já está preenchida.
3. Substitua `COLE_A_CHAVE_PUBLICA_ANON_AQUI` pela chave **publicável/anon** do mesmo projeto, obtida em Project Settings → API.
4. Nunca cole `service_role` nem qualquer chave secreta no navegador.
5. Em Supabase Authentication → Users, crie a conta do responsável e as contas de cada funcionário.
6. Edite `sql/CADASTRAR_FUNCIONARIO.sql` com o e-mail e o nome da conta que deverá ter acesso à equipe; execute esse pequeno comando uma vez por pessoa. O SQL principal não precisa ser executado novamente.
7. No painel administrativo, ajuste os horários provisórios, cadastre bairros e taxas reais e confira a disponibilidade dos sete produtos.
8. Faça um pedido de teste com endereço e telefone de teste; depois confira painel, histórico, acompanhamento e cancelamento antes de divulgar o endereço do site.

## Executar localmente

Use o Live Server do VS Code ou outro servidor estático local. Extraia a pasta do ZIP e abra o projeto pelo servidor. Abrir diretamente por `file://` pode bloquear chamadas externas.

Sem a chave do Supabase, o cardápio e o carrinho funcionam como prévia local; o checkout bloqueia o envio de pedidos reais. Com a chave configurada, mas com o horário da loja fechado, o menu continua visível e as ações para pedir ficam bloqueadas.

## GitHub e Vercel

Envie o **conteúdo desta pasta** para a raiz de um repositório GitHub (não envie somente o arquivo ZIP). Depois importe esse repositório na Vercel. É um site estático: use a pasta que contém `index.html` como raiz e deixe o comando de build vazio. Após conectar GitHub e Vercel, cada push/commit poderá gerar uma nova publicação.

## Formulários e privacidade

Os formulários do site não enviam dados por navegação HTML para uma página estática. O JavaScript intercepta o envio e usa Supabase Auth/RPC. As funções RPC do Supabase fazem chamadas HTTPS à API para gravar ou consultar dados; isso é diferente de um formulário HTML tentando enviar POST para um arquivo `.html` na Vercel. Os pedidos não são enviados por WhatsApp.

O painel exige autenticação do Supabase e cadastro ativo em `staff_members`; não há PIN administrativo fixo. A equipe recebe atualização de pedidos no painel por Realtime quando a conta autenticada está aberta e a publicação `supabase_realtime` inclui `public.orders`.

## Limites desta entrega

Os testes realizados são locais e estáticos: verificam sintaxe dos JavaScript, referências de arquivos, estrutura das páginas e funcionamento da navegação no código. Não foi possível acessar a conta autenticada do Supabase para criar um pedido real. Portanto, a ligação final deve ser testada no seu projeto depois de inserir a chave pública.

## Tamanhos de tela cobertos

O layout usa o menu lateral fixo em telas acima de 820 px, gaveta lateral em telas de 820 px ou menos, grade do cardápio em três/duas/uma coluna conforme a largura e ajustes específicos para telas compactas de até 360 px. Isso cobre celulares pequenos, celulares maiores, tablets e computadores; a experiência final deve ser conferida também no aparelho em que o site será usado.
