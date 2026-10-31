-- Etapa 2 (lojas seguras): cada arquivo enviado pelo protótipo guarda quem enviou,
-- para só essa conta (ou o dono do site) poder apagá-lo. Arquivos antigos ficam sem
-- (só o dono do site apaga). Se a conta for apagada, o arquivo fica, sem dono.
alter table prototipo_arquivos add column enviado_por uuid references auth.users on delete set null;
