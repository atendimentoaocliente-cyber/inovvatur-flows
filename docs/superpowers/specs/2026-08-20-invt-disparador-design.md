# INVT Disparador — Painel de Campanhas de WhatsApp

**Data:** 2026-08-20
**Status:** Desenho aprovado (mockups validados) — pronto para plano de implementação

## Problema

Hoje a Inovvatur dispara mensagens para **grupos de WhatsApp** via **n8n + Google Sheets + Z-API**. Isso funciona bem para as **cadências fixas** (mensagens semanais por slot e o bloco de mensagens da aula de quinta).

A dor é a **campanha avulsa**: uma mensagem pontual para uma data específica (feriado, promoção) que não encaixa na régua fixa. Hoje ela exige editar a planilha ou o fluxo do n8n — técnico e arriscado para o dia a dia.

**Objetivo:** um site (painel) amigável para **criar e agendar campanhas avulsas** (texto + mídia) para os grupos, com **agenda + histórico**, sem tocar no n8n a cada campanha.

## Não-objetivos (YAGNI)

- Não substituir as cadências fixas do n8n (semanal por slot e bloco da aula) — continuam no n8n como estão.
- Não gerenciar contatos individuais. O público são **grupos** de WhatsApp.
- Não construir CRM, editor de fluxo ou disparo para números individuais.
- Sem multiusuário/perfis complexos por enquanto — uso interno da equipe.

## Sistema atual (reaproveitado, não reescrito)

- **Planilha** (`1vq6kr79yVIOazj7RUqH-fdeDIhZzDUo7ssZ878uBtRM`), abas:
  - `grupos`: `group_id`, `nome`, `ativo`
  - `aulas`: `data_aula`, `hora_aula`, `tema`, `link_reuniao`, `video_url`, `ativa`
  - `mensagens`: `slot`, `texto`, `tipo`, `offset_min`, `bloco_aula`, `ativo`, `mencionar_todos`
- **`[SUB] Enviar para Grupos (Z-API)`** (id `kEPapZTa9tcUSKgH`): recebe `{texto, tipo, midia_url, mencionar_todos, slot}`, lê os grupos ativos, envia com **delay aleatório de 8–15s entre grupos** (anti-bloqueio) e faz menção a todos via `group-metadata`. **É o motor de envio e permanece.**
- **Cadências** que chamam o SUB: "Semanal — Mensagens Fixas" e "Bloco da Aula (Quinta)". **Permanecem intactas.**

## Arquitetura

```
Site (Next.js / Vercel)  ──►  Supabase (Postgres + Storage)
                                     ▲
                                     │  (lê campanhas na hora, grava status)
                          n8n "Campanhas Avulsas" (cron a cada ~3 min)
                                     │
                                     ▼
                          [SUB] Enviar para Grupos  ──►  Z-API  ──►  Grupos de WhatsApp
```

**Fluxo de uma campanha:**
1. Usuário compõe no site → mídia sobe para o **Supabase Storage** (URL pública) → campanha gravada em `campaigns` com `status = agendada` (ou `rascunho`).
2. Novo workflow n8n **"Campanhas Avulsas"** (Schedule Trigger a cada ~3 min): busca no Supabase campanhas com `status = agendada` e `enviar_em <= agora` → marca `status = enviando` (trava anti-duplicação) → chama `[SUB] Enviar para Grupos` (`waitForSubWorkflow: true`) passando `{texto, tipo, midia_url, mencionar_todos, group_ids}` → grava resultado (`enviada`, contadores, `enviado_em`) de volta no Supabase.
3. Site lê o Supabase para mostrar agenda, histórico e status em tempo quase real.

**Alternativa considerada e descartada:** o site chamar um webhook do n8n diretamente. Descartada porque agendamento + histórico exigem um armazenamento de qualquer forma; cron + store é mais simples e resiliente (sobrevive a site fora do ar, reprocessa, mantém histórico).

**Mudança mínima necessária no SUB:** aceitar um parâmetro opcional `group_ids` (lista). Se vier vazio, mantém o comportamento atual (todos os grupos ativos da aba `grupos`). Isso habilita "escolher grupos"/públicos salvos sem mexer nas cadências fixas (que continuam chamando sem `group_ids`).

## Modelo de dados (Supabase)

- **`campaigns`**: `id`, `nome`, `tipo` (`texto|imagem|video|pdf`), `mensagem`, `midia_url` (nullable), `mencionar_todos` (bool), `audience_id` (fk nullable → `audiences`), `enviar_em` (timestamptz nullable = enviar agora), `status` (`rascunho|agendada|enviando|enviada|cancelada|erro`), `resultado` (jsonb: `{total, enviados, falhas, erro?}`), `enviado_em`, `criado_em`, `atualizado_em`.
- **`audiences`** (públicos salvos): `id`, `nome`, `tipo` (`todos|manual`), `group_ids` (text[] nullable — nulo quando `todos`), `criado_em`.
- **`groups`** (grupos cadastrados no site): `id`, `group_id` (o id do grupo Z-API, ex.: `120363...-group`), `nome` (amigável), `ativo` (bool), `criado_em`. O usuário **cadastra cada grupo uma vez** (cola o `group_id` + nome) e reusa nos públicos. Esta é a fonte do seletor de público do site — **sem sincronizar com a planilha**.
- **Storage bucket** `campanhas-midia` para imagens/vídeos/PDF.
- As cadências fixas do n8n **continuam lendo a aba `grupos`** da planilha; a tabela `groups` do site é independente e serve às campanhas avulsas.

## Telas (validadas em mockup, identidade INVT)

1. **Campanhas (painel):** cartões de resumo (próximo disparo, agendadas, enviadas no mês, grupos ativos); abas **Agendadas / Histórico / Rascunhos**; lista com miniatura por tipo, quando, público e **status colorido** (agendada / enviando N/M / enviada / erro). As cadências recorrentes do n8n aparecem em **modo leitura** ("Recorrente · n8n") para dar visão unificada da semana.
2. **Nova campanha:** nome; tipo (texto/imagem/vídeo/PDF); upload de mídia (→ Storage); mensagem com variáveis opcionais (`{{data}}`); toggle **mencionar todos**; **público** (preset salvo ou seleção manual); **agendar** (data/hora) ou **enviar agora**; **prévia ao vivo do WhatsApp**; botões Agendar / Salvar rascunho.
3. **Público:** **públicos salvos** (ex.: "Todos os grupos ativos" (padrão), "Clientes — Turmas", "Grupos VIP") + **seleção manual** com busca + "Salvar como público".
4. **Grupos:** cadastro dos grupos (colar `group_id` + nome amigável + ativo/inativo). Fonte dos públicos.

## Envio, throttling e segurança

- **Throttling:** mantido no SUB (8–15s entre grupos). O site apenas exibe a estimativa de tempo.
- **Anti-duplicação:** o cron marca `status = enviando` antes de disparar; o próximo cron ignora o que não estiver `agendada`. Idempotência por status.
- **Segredos:** tokens Z-API / Client-Token ficam **apenas no n8n** (credenciais), nunca no site. O site fala só com o Supabase. A `service_role key` do Supabase fica no backend server-side do Next.js.
- **Acesso ao site:** **adiado** — a primeira versão é construída sem autenticação; o login (registro da equipe) será plugado depois, sem impacto no resto da arquitetura.
- **RLS** habilitado no Supabase; escrita do n8n via service role.

## Tratamento de erros

- Falha ao enviar para um grupo: contabilizada em `resultado.falhas`; a campanha ainda conclui como `enviada` com o resumo (X/Y).
- Falha geral (SUB quebra): `status = erro` com mensagem no `resultado`; visível no histórico; permite **reenviar**.
- Validações no site: mídia obrigatória quando `tipo != texto`; data/hora futura quando "Agendar".

## Decisões tomadas

- **Store:** Supabase (Postgres + Storage).
- **Motor:** `[SUB] Enviar para Grupos` reaproveitado; recebe `group_ids` opcional.
- **Grupos:** cadastrados no próprio site (tabela `groups`), o usuário cola o `group_id` uma vez. Sem sincronizar com a planilha.
- **Público:** públicos salvos (presets) + seleção manual, montados a partir dos grupos cadastrados.
- **Login:** adiado — primeira versão sem autenticação.
- **Visão unificada:** recorrentes do n8n aparecem em leitura no painel.
- **Escopo:** apenas campanhas avulsas; cadências fixas ficam no n8n.

## Questões em aberto (resolver no plano de implementação)

1. **Variáveis em campanhas avulsas:** suportar `{{data}}` simples; variáveis de aula (`{{tema}}`, `{{link}}`) não se aplicam a avulsas e devem ser ignoradas/ocultadas.
2. **Recorrentes no painel:** de onde ler para exibir em leitura (a partir da planilha `mensagens`/`aulas` via n8n, ou entrada manual) — detalhe de baixo risco, pode ficar para uma segunda iteração.
