# Mudanças no `[SUB] Enviar para Grupos (Z-API)`

O dispatcher "Campanhas Avulsas" chama o seu SUB existente (id `kEPapZTa9tcUSKgH`) passando
`texto`, `tipo`, `midia_url`, `mencionar_todos` e **`group_ids`** (a lista de grupos da campanha).

Para o SUB aceitar `group_ids` e suportar **imagem/PDF** (hoje só faz texto e vídeo), troque o
código de **dois** nós Code. Faça primeiro numa **cópia** do SUB, teste, e só então aplique no
original. As cadências fixas (semanal / bloco da aula) continuam funcionando sem `group_ids`
(quando não vem `group_ids`, ele lê a planilha como antes).

---

## 1. Nó **"Expandir Grupos"** — passar a aceitar `group_ids`

Substitua todo o código por:

```js
const cfg = $('Config').first().json;
const msg = $('Entrada').first().json;

function ehAtivo(v) {
  const s = String(v == null ? '' : v).trim().toLowerCase();
  return ['sim', 's', 'yes', 'y', 'true', '1', 'x', 'ativo'].includes(s);
}

let grupos;
if (Array.isArray(msg.group_ids) && msg.group_ids.length) {
  // Chamador (campanhas do site) passou os IDs — usa eles, ignora a planilha.
  grupos = msg.group_ids
    .map(id => ({ group_id: String(id).trim(), nome: '' }))
    .filter(g => g.group_id && !g.group_id.includes(' '));
} else {
  // Cadências fixas: lê todos os grupos ativos da planilha, como antes.
  const linhas = $input.all().map(i => i.json);
  grupos = linhas
    .filter(g => {
      const id = String(g.group_id == null ? '' : g.group_id).trim();
      return id && !id.includes(' ') && ehAtivo(g.ativo);
    })
    .map(g => ({ group_id: String(g.group_id).trim(), nome: g.nome || '' }));
}

if (!grupos.length) throw new Error('Nenhum grupo para enviar (group_ids vazio e nenhum ativo na planilha).');
if (!msg.texto) throw new Error('Nenhum texto recebido do chamador.');

const mencionar = msg.mencionar_todos === true || String(msg.mencionar_todos).trim().toLowerCase() === 'sim';

return grupos.map(g => ({
  json: {
    group_id: g.group_id,
    grupo_nome: g.nome,
    texto: msg.texto,
    tipo: (msg.tipo || 'texto').trim().toLowerCase(),
    midia_url: msg.midia_url || '',
    mencionar_todos: mencionar,
    slot: msg.slot || '',
    zapiBase: cfg.zapiBase,
    delayMin: Number(cfg.delayMin || 8),
    delayMax: Number(cfg.delayMax || 15),
  },
}));
```

---

## 2. Nó **"Montar Payload"** — suportar imagem e PDF

Substitua todo o código por:

```js
const item = $('Loop Grupos').first().json;
const meta = $input.first().json || {};

let mentioned = [];
if (item.mencionar_todos && Array.isArray(meta.participants)) {
  mentioned = meta.participants.map(p => String(p.phone || '').replace(/\D/g, '')).filter(Boolean);
}

const base = item.zapiBase;
let url, body;
const hasMedia = !!item.midia_url;

if (item.tipo === 'video' && hasMedia) {
  url = base + '/send-video';
  body = { phone: item.group_id, video: item.midia_url, caption: item.texto };
} else if (item.tipo === 'imagem' && hasMedia) {
  url = base + '/send-image';
  body = { phone: item.group_id, image: item.midia_url, caption: item.texto };
} else if (item.tipo === 'pdf' && hasMedia) {
  url = base + '/send-document/pdf';
  body = { phone: item.group_id, document: item.midia_url, fileName: 'documento.pdf', caption: item.texto };
} else {
  url = base + '/send-text';
  body = { phone: item.group_id, message: item.texto };
}
if (mentioned.length) body.mentioned = mentioned;

const min = item.delayMin, max = item.delayMax;
const delay = Math.floor(Math.random() * (max - min + 1)) + min;

return [{ json: { grupo_nome: item.grupo_nome, group_id: item.group_id, slot: item.slot, url, body, delay, mencionados: mentioned.length } }];
```

---

## Teste do SUB (com input fixado)

No SUB, use **Execute Workflow** com este input pinado:

```json
{ "texto": "teste group_ids", "tipo": "texto", "midia_url": "",
  "mencionar_todos": "nao", "group_ids": ["SEU_GROUP_ID_DE_TESTE"] }
```

Esperado: "Expandir Grupos" gera **1 item** só (seu grupo de teste) e a mensagem chega nele.
Depois teste `tipo:"imagem"` com um `midia_url` público (uma URL do bucket `campanhas-midia`).
