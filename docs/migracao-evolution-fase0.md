# Fase 0 — provar o Evolution antes de migrar

**Objetivo:** descobrir, com um número e um grupo de teste, se o Evolution faz tudo o que o SUB do n8n faz hoje com o Z-API. Custo zero de código: nada no disparador muda nesta fase, e o Z-API continua em produção.

**Critério de aprovação:** os 6 testes abaixo passam. Se o teste 5 (@todos) falhar, **pare** — é o que mais dói perder, porque o Academy depende dele.

---

## Antes de começar

- VPS Hostinger com o template **Evolution API** (Docker). Mínimo confortável: 2 GB de RAM só para o Evolution; 4 GB se for trazer o n8n junto.
- Um **número de WhatsApp secundário** (não o de produção) e um **grupo de teste** onde esse número seja admin.
- A **versão** do seu Evolution. Confirme os campos no Swagger da sua própria instância em `/api-docs` — ele é a verdade, a documentação geral pode estar à frente ou atrás da sua versão.

Preencha e exporte estas variáveis no terminal (o `$URL` é o endereço do seu Evolution):

```bash
export URL="https://SEU-EVOLUTION.seudominio.com"
export KEY="SUA_APIKEY_GLOBAL"
export INST="teste"
export GRUPO="120363000000000000@g.us"   # ver teste 3
```

---

## 1. Instância de pé e pareada

Crie a instância pelo painel do Evolution (ou pela API), leia o QR code com o número de teste e confirme:

```bash
curl -s "$URL/instance/connectionState/$INST" -H "apikey: $KEY"
```

**Esperado:** `state` = `open`. `close` = não pareou; `connecting` = ainda subindo.

> Este endpoint é o que permite, depois, o painel mostrar um alerta quando a instância cair. Vale anotar que ele funciona.

## 2. A sessão sobrevive a um reinício

Não pule este. É o teste que separa "funcionou" de "vai funcionar na segunda-feira".

```bash
docker compose restart evolution   # ou reinicie o container pelo painel
sleep 30
curl -s "$URL/instance/connectionState/$INST" -H "apikey: $KEY"
```

**Esperado:** volta para `open` **sozinho**, sem novo QR code. Se pedir pareamento de novo, o estado da sessão não está persistido — resolva isso antes de qualquer outra coisa (no Evolution v2, guardar o estado no Postgres em vez do disco).

## 3. O ID do grupo

Os IDs no nosso banco estão no formato do Z-API: `120363419391061458-group`. O Evolution usa `120363419391061458@g.us` — **mesmo número no miolo**, só muda o sufixo.

Liste os grupos e confira se o número bate com algum `group_id` da tabela `groups`:

```bash
curl -s "$URL/group/fetchAllGroups/$INST?getParticipants=false" -H "apikey: $KEY"
```

**Esperado:** os mesmos grupos, com o mesmo número antes do `@g.us`. Se bater, a conversão no código é uma linha. Se não bater, pare e me avise — muda o plano.

## 4. Texto

```bash
curl -s -X POST "$URL/message/sendText/$INST" \
  -H "apikey: $KEY" -H "Content-Type: application/json" \
  -d "{\"number\":\"$GRUPO\",\"text\":\"teste 4 - texto simples\"}"
```

**Esperado:** chega no grupo. Guarde a resposta — é dela que sai o identificador da mensagem, se um dia quisermos registrar envio por grupo.

## 5. Mencionar todos — o teste que mais importa

Hoje o SUB faz uma chamada extra para buscar os participantes e montar o array `mentioned`. No Evolution isso deveria ser um booleano. São **dois** testes, e o segundo é o que pega o bug:

```bash
# 5a - COM menção: todo mundo deve ser marcado
curl -s -X POST "$URL/message/sendText/$INST" \
  -H "apikey: $KEY" -H "Content-Type: application/json" \
  -d "{\"number\":\"$GRUPO\",\"text\":\"teste 5a - deve marcar todos\",\"mentionsEveryOne\":true}"

# 5b - SEM o campo: NINGUÉM pode ser marcado
curl -s -X POST "$URL/message/sendText/$INST" \
  -H "apikey: $KEY" -H "Content-Type: application/json" \
  -d "{\"number\":\"$GRUPO\",\"text\":\"teste 5b - nao pode marcar ninguem\"}"
```

**Esperado:** 5a marca todos, 5b não marca ninguém.

⚠️ **Não teste com `"mentionsEveryOne": false`.** Há bug conhecido ([issue #2431](https://github.com/evolution-foundation/evolution-api/issues/2431)) em que mandar `false` marca todo mundo assim mesmo. Por isso a regra no código será: quando `mencionar_todos` for falso, **omitir o campo**, nunca mandar `false`. Se 5b marcar alguém na sua versão, isso é bloqueante — significa que não dá para desligar a menção.

## 6. Mídia

O Z-API tem três rotas (`/send-image`, `/send-video`, `/send-document/pdf`); o Evolution tem uma só, mudando o `mediatype`. Use URLs públicas do bucket `campanhas-midia`, que é de onde a mídia sai hoje.

```bash
# imagem
curl -s -X POST "$URL/message/sendMedia/$INST" \
  -H "apikey: $KEY" -H "Content-Type: application/json" \
  -d "{\"number\":\"$GRUPO\",\"mediatype\":\"image\",\"mimetype\":\"image/png\",\"media\":\"URL_PUBLICA.png\",\"caption\":\"teste 6 - imagem\"}"

# video (use um de ~6 MB, o tamanho real das suas campanhas)
curl -s -X POST "$URL/message/sendMedia/$INST" \
  -H "apikey: $KEY" -H "Content-Type: application/json" \
  -d "{\"number\":\"$GRUPO\",\"mediatype\":\"video\",\"mimetype\":\"video/mp4\",\"media\":\"URL_PUBLICA.mp4\",\"caption\":\"teste 6 - video\"}"

# pdf
curl -s -X POST "$URL/message/sendMedia/$INST" \
  -H "apikey: $KEY" -H "Content-Type: application/json" \
  -d "{\"number\":\"$GRUPO\",\"mediatype\":\"document\",\"mimetype\":\"application/pdf\",\"media\":\"URL_PUBLICA.pdf\",\"fileName\":\"documento.pdf\",\"caption\":\"teste 6 - pdf\"}"
```

**Esperado:** os três chegam com a legenda. Atenção ao vídeo: confirme que ele **reproduz** no WhatsApp, não que só chegou.

---

## O que fazer com o resultado

| Resultado | Próximo passo |
|---|---|
| Tudo passou | Portar o SUB do n8n para o Evolution, testar numa categoria (Avulsas), depois cancelar o Z-API |
| Falhou o 2 (sessão não volta) | Corrigir a persistência antes de seguir — sem isso, todo reinício derruba a operação |
| Falhou o 5b (não desliga o @todos) | Bloqueante. Sem isso, toda campanha marca o grupo inteiro |
| Falhou o 3 (IDs diferentes) | Parar e reavaliar — recadastrar grupo é outro tamanho de projeto |
| Falhou o 6 no vídeo | Verificar limite de tamanho do Evolution e do WhatsApp (~16 MB para vídeo) |

**O que continua valendo independente do resultado:** o intervalo de 8–15s entre grupos é responsabilidade de quem orquestra (hoje o n8n). O campo `delay` do Evolution é o tempo de "digitando…" antes da mensagem, não espaçamento de fila — ele **não** substitui o nosso intervalo anti-bloqueio.
