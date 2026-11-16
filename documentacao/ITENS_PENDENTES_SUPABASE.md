# Itens que ainda precisam ser feitos na sua conta

1. Colar a chave publicável/anon em `js/config.js`. Não usar `service_role`.
2. Criar usuário do responsável e funcionários em Authentication → Users.
3. Cadastrar cada usuário autorizado em `staff_members` com `sql/CADASTRAR_FUNCIONARIO.sql`.
4. Configurar os horários reais em Administração → Entrega e horários. O SQL inicial usou 18:00–23:59 como horário provisório.
5. Cadastrar os bairros reais e taxas de entrega.
6. Testar login de funcionário, recebimento de pedido por Realtime, alteração de status, previsão de preparo, cancelamento aprovado/recusado e pagamento presencial.
7. Somente depois de testar, enviar a pasta ao GitHub e conectar o repositório à Vercel.

Não precisa executar novamente as seis partes do SQL nem apagar/criar tabelas. A integração real ainda não foi testada nesta conta, porque não temos a chave publicável e uma sessão autenticada do projeto.
