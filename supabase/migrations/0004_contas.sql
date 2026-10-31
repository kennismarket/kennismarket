-- Login real de clientes e vendedores (etapa 1).
-- Cada perfil ganha um nome de usuário único (o mesmo do protótipo: 3 a 20 letras minúsculas,
-- números, "_" ou "."). Contas antigas, como a do dono, podem ficar sem: entram pelo e-mail.
-- O e-mail continua no auth.users do Supabase. Quem se cadastra sem e-mail recebe um e-mail
-- interno que termina em ".invalid" (ninguém recebe nada nele).
alter table perfis add column usuario text unique
  check (usuario ~ '^[a-z0-9_.]{3,20}$');
