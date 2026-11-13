import { ler, adicionar, gravar } from './sheets.mjs';
import { acharAcesso, norm, ativo } from './auth.mjs';
import { salvarArquivo, apagarArquivo } from './blobs.mjs';

/* Etapas que o painel usa nos botões. Os nomes ficam fixos; as outras etapas o gestor cria e apaga em Ajustes. */
export const SYS = { NOVO: 'Novo', SIM: 'Aguardando simulação', PRONTA: 'Simulação pronta', DIG: 'Aguardando digitação', PAGO: 'Pago', PERDIDO: 'Perdido' };
const SISTEMA = [SYS.NOVO, SYS.SIM, SYS.PRONTA, SYS.DIG, SYS.PAGO];
export const CLI = ['ID', 'Nome', 'Telefone', 'CPF', 'Matrícula', 'Senha', 'Vínculo', 'Número (final)', 'Observações', 'Etapa', 'Cadastrado por', 'Cadastrado em', 'Atualizado em', 'Data de pagamento', 'Bloqueado', 'Documentos'];
export const OPS = ['ID', 'Cliente ID', 'Produto', 'Operação', 'Banco', 'Prazo', 'Parcela', 'Saldo devedor', 'Valor liberado', 'Valor base', 'Aceita', 'Ativa', 'Arquivos'];
const TIPOS = { produtos: 'Produto', operacoes: 'Operação', bancos: 'Banco', prazos: 'Prazo', vinculos: 'Vínculo', numeros: 'Número', etapa: 'Etapa' };
const MAX_ARQ = 4.5 * 1024 * 1024;

export class Erro extends Error { constructor(msg, status = 400, extra = {}) { super(msg); this.status = status; this.extra = extra; } }

/* ---------- utilidades ---------- */
export const agora = () => new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 16);
export const hojeStr = () => agora().slice(0, 10);
export const fone = (s) => String(s == null ? '' : s).replace(/\D/g, '');
export const num = (v) => { if (typeof v === 'number') return v; const t = String(v || '').replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, ''); return t ? parseFloat(t) : 0; };
const txt = (x) => String(x == null ? '' : x).trim();
const id = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const letra = (n) => { let s = ''; n++; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
export const foneF = (s) => { const d = fone(s).slice(0, 11); return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : d; };
export const cpfF = (s) => { const d = fone(s).slice(0, 11); return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : d; };
export function cpfOk(s) {
  s = fone(s);
  if (s.length !== 11 || /^(\d)\1+$/.test(s)) return false;
  for (let t = 9; t < 11; t++) { let d = 0; for (let c = 0; c < t; c++) d += s[c] * (t + 1 - c); d = ((10 * d) % 11) % 10; if (+s[t] !== d) return false; }
  return true;
}
const json_ = (s, padrao) => { try { const v = JSON.parse(s); return Array.isArray(v) ? v : padrao; } catch { return padrao; } };

function objs(v) {
  if (!v || !v.length) return [];
  const h = v[0].map((x) => String(x == null ? '' : x).trim());
  return v.slice(1).map((r, i) => { const o = { _linha: i + 2 }; h.forEach((c, j) => { if (c) o[c] = r[j] == null ? '' : r[j]; }); return o; })
    .filter((o) => Object.keys(o).some((k) => k !== '_linha' && o[k] !== ''));
}
const linhaDe = (cols, o) => cols.map((c) => (o[c] == null ? '' : o[c]));

/* ---------- listas (aba Listas) ---------- */
function listasDe(rows) {
  const ativos = rows.filter((r) => ativo(r.Ativo));
  const por = (t) => ativos.filter((r) => norm(r.Tipo) === norm(t));
  const lista = (t) => por(t).map((r) => txt(r.Valor)).filter(Boolean);
  const status = por('Etapa').map((r, i) => ({ n: txt(r.Valor), f: norm(r.Fase).startsWith('est') ? 'est' : 'neg', o: num(r.Ordem) || (i + 1), sys: SISTEMA.includes(txt(r.Valor)) }))
    .filter((s) => s.n).sort((a, b) => a.o - b.o);
  return { produtos: lista('Produto'), operacoes: lista('Operação'), bancos: lista('Banco'), prazos: por('Prazo').map((r) => num(r.Valor)).filter((n) => n > 0).sort((a, b) => a - b), vinculos: lista('Vínculo'), numeros: lista('Número'), status };
}

/* ---------- carrega tudo e identifica quem está chamando ---------- */
export async function autenticar(chave) {
  const [acessos] = await ler(["'Acessos'!A1:H100"], 'raw');
  const eu = acharAcesso(acessos, chave);
  if (!eu) throw new Erro('Link inválido ou desativado. Fale com o Rafael.', 401);
  return eu;
}

export async function carregar(chave, { log = false } = {}) {
  const pedidos = ["'Acessos'!A1:H100", "'Clientes'!A1:P", "'Operações'!A1:M", "'Listas'!A1:E500"];
  if (log) pedidos.push("'Log'!A1:E");
  const [acessos, clientes, ops, listas, logv] = await ler(pedidos, 'raw');
  const eu = acharAcesso(acessos, chave);
  if (!eu) throw new Erro('Link inválido ou desativado. Fale com o Rafael.', 401);
  const listasRows = objs(listas);
  return { eu, clientes: objs(clientes), ops: objs(ops), listasRows, listas: listasDe(listasRows), log: logv ? objs(logv) : [] };
}

/* ---------- formato que o painel recebe ---------- */
export function paraFront(ctx) {
  const logs = {};
  ctx.log.forEach((r) => { const k = txt(r['Cliente ID']); if (!k) return; (logs[k] = logs[k] || []).unshift({ em: txt(r['Data e hora']), por: txt(r.Quem), o: txt(r['Ação']) }); });
  const opsPor = {};
  ctx.ops.filter((o) => ativo(o.Ativa)).forEach((o) => {
    const k = txt(o['Cliente ID']);
    (opsPor[k] = opsPor[k] || []).push({ id: txt(o.ID), produto: txt(o.Produto), operacao: txt(o['Operação']), banco: txt(o.Banco), prazo: num(o.Prazo), parcela: num(o.Parcela), saldo: num(o['Saldo devedor']), lib: num(o['Valor liberado']), aceita: norm(o.Aceita) === 'sim' ? 'sim' : norm(o.Aceita) === 'nao' ? 'nao' : '', files: json_(o.Arquivos, []) });
  });
  const clientes = ctx.clientes.map((r) => ({
    id: txt(r.ID), nome: txt(r.Nome), tel: txt(r.Telefone), cpf: txt(r.CPF), mat: txt(r['Matrícula']), senha: txt(r.Senha), vinculo: txt(r['Vínculo']), numero: txt(r['Número (final)']), obs: txt(r['Observações']),
    status: txt(r.Etapa) || SYS.NOVO, por: txt(r['Cadastrado por']), criado: txt(r['Cadastrado em']), atual: txt(r['Atualizado em']) || txt(r['Cadastrado em']), pago: txt(r['Data de pagamento']), bloqueado: norm(r.Bloqueado) === 'sim',
    ops: opsPor[txt(r.ID)] || [], files: json_(r.Documentos, []), log: (logs[txt(r.ID)] || []).slice(0, 60),
  })).reverse();
  const L = ctx.listas;
  return { eu: ctx.eu, cfg: { produtos: L.produtos, operacoes: L.operacoes, bancos: L.bancos, prazos: L.prazos, vinculos: L.vinculos, numeros: L.numeros, status: L.status.map((s) => ({ n: s.n, f: s.f, sys: s.sys ? 1 : 0 })) }, clientes, agora: agora() };
}

/* ---------- arquivos ---------- */
async function guardarArquivos(enviados, atuais) {
  const metas = [], novos = [];
  for (const f of Array.isArray(enviados) ? enviados : []) {
    if (f && f.data) {
      const m = String(f.data).match(/^data:([\w.+/-]+);base64,([A-Za-z0-9+/=]+)$/);
      if (!m) throw new Erro('Arquivo inválido: ' + txt(f.name));
      const tipo = m[1];
      if (!/^image\/(png|jpe?g|webp|gif|heic|heif)$/.test(tipo) && tipo !== 'application/pdf') throw new Erro('Só aceito imagem ou PDF: ' + txt(f.name));
      const buf = Buffer.from(m[2], 'base64');
      if (buf.length > MAX_ARQ) throw new Erro(`O arquivo ${txt(f.name)} passa de 4 MB.`);
      const fid = id('F');
      const meta = { id: fid, name: txt(f.name).slice(0, 120) || 'arquivo', type: tipo, size: buf.length };
      novos.push([fid, buf, meta]);
      metas.push(meta);
    } else if (f && f.id) {
      const antigo = atuais.find((a) => a.id === f.id);
      if (antigo) metas.push(antigo);
    }
  }
  const mantidos = new Set(metas.map((m) => m.id));
  return { metas, novos, apagar: atuais.filter((a) => !mantidos.has(a.id)).map((a) => a.id) };
}

const achaCli = (ctx, cid) => ctx.clientes.find((r) => txt(r.ID) === txt(cid));
async function logar(ctx, linhas) { if (linhas.length) await adicionar('Log', linhas.map((l) => [agora(), ctx.eu.nome, l.o, l.cid, l.nome])).catch(() => {}); }
const cliGravar = (r) => gravar(`'Clientes'!A${r._linha}:${letra(CLI.length - 1)}${r._linha}`, [linhaDe(CLI, r)]);
const bloqueado = (r) => norm(r.Bloqueado) === 'sim';

/* ---------- ações ---------- */
export const acoes = {
  async salvarCliente(ctx, p) {
    const c = p.cliente || {}, modo = ['so', 'enviar', 'devolver', 'digitar', 'bloquear'].includes(p.modo) ? p.modo : 'so';
    const eGestor = ctx.eu.perfil === 'gestor';
    const cid = /^[A-Za-z0-9]{3,24}$/.test(txt(c.id)) ? txt(c.id) : '';
    const ex = cid ? achaCli(ctx, cid) : null;
    if (ex && bloqueado(ex)) throw new Erro('Cliente bloqueado. Só o gestor desbloqueia.', 409);

    /* dados do cliente */
    if (!txt(c.nome)) throw new Erro('Preencha o nome.');
    const tel = fone(c.tel); if (tel.length < 10 || tel.length > 11) throw new Erro('Telefone inválido. Use DDD + número.');
    if (!cpfOk(c.cpf)) throw new Erro('CPF inválido. Confere os números.');
    const numero = txt(c.numero);
    if (!numero || (!ctx.listas.numeros.includes(numero) && !(ex && txt(ex['Número (final)']) === numero))) throw new Erro('Escolha o número da empresa (final) que está falando com o cliente.');
    const dup = ctx.clientes.find((r) => txt(r.ID) !== (ex ? txt(ex.ID) : cid) && (fone(r.Telefone) === tel || fone(r.CPF) === fone(c.cpf)));
    if (dup) throw new Erro(`Já existe cadastro com esse telefone ou CPF: ${dup.Nome} (${dup.Etapa}).`, 409);

    /* operações */
    const subm = Array.isArray(c.ops) ? c.ops : [];
    subm.forEach((o, i) => {
      const n = `Operação ${i + 1}: `;
      if (!txt(o.produto)) throw new Erro(n + 'escolha o produto.');
      if (!txt(o.operacao)) throw new Erro(n + 'escolha a operação.');
      if (!txt(o.banco)) throw new Erro(n + 'escolha o banco.');
      if (!(num(o.parcela) > 0)) throw new Erro(n + 'a parcela é obrigatória.');
    });
    if (subm.length > 30) throw new Erro('Operações demais num cliente só.');
    if (modo !== 'so' && modo !== 'bloquear' && !subm.length) throw new Erro('Cadastre pelo menos uma operação antes de enviar.');
    if (modo === 'digitar' && !subm.some((o) => o.aceita === 'sim')) throw new Erro('Marque pelo menos uma operação como Aceita antes de mandar pra digitação.');
    if (modo === 'devolver' && !eGestor) throw new Erro('Só o gestor devolve a simulação.', 403);

    /* etapa */
    const etapas = ctx.listas.status.map((s) => s.n).concat([SYS.PERDIDO]);
    const antes = ex ? txt(ex.Etapa) || SYS.NOVO : null;
    let etapa;
    if (modo === 'enviar') etapa = SYS.SIM; else if (modo === 'devolver') etapa = SYS.PRONTA; else if (modo === 'digitar') etapa = SYS.DIG;
    else etapa = ex ? (etapas.includes(txt(c.status)) || txt(c.status) === antes ? txt(c.status) : antes) : SYS.NOVO;
    if (etapa === SYS.PRONTA && !eGestor && antes !== SYS.PRONTA) throw new Erro('A simulação quem devolve é o gestor.', 403);

    const t = agora();
    let pago = /^\d{4}-\d{2}-\d{2}$/.test(txt(c.pago)) ? txt(c.pago) : '';
    if (etapa === SYS.PAGO && !pago) pago = hojeStr();
    const idCli = ex ? txt(ex.ID) : (cid || id('C'));

    /* arquivos: grava os novos antes de mexer na planilha */
    const docs = await guardarArquivos(c.files, ex ? json_(ex.Documentos, []) : []);
    const existentes = ctx.ops.filter((o) => txt(o['Cliente ID']) === idCli);
    const apagar = [...docs.apagar], novosArq = [...docs.novos];
    const linhasOps = [], novasOps = [], desativar = [];
    for (const o of subm) {
      const exo = existentes.find((e) => ativo(e.Ativa) && txt(e.ID) === txt(o.id));
      const arq = await guardarArquivos(o.files, exo ? json_(exo.Arquivos, []) : []);
      apagar.push(...arq.apagar); novosArq.push(...arq.novos);
      const saldo = num(o.saldo), lib = num(o.lib);
      const row = { ID: exo ? txt(exo.ID) : id('O'), 'Cliente ID': idCli, Produto: txt(o.produto), 'Operação': txt(o.operacao), Banco: txt(o.banco), Prazo: Math.max(0, Math.round(num(o.prazo))), Parcela: num(o.parcela), 'Saldo devedor': saldo, 'Valor liberado': lib, 'Valor base': Math.round((saldo + lib) * 100) / 100, Aceita: o.aceita === 'sim' ? 'sim' : o.aceita === 'nao' ? 'nao' : '', Ativa: 'sim', Arquivos: JSON.stringify(arq.metas) };
      if (exo) linhasOps.push({ ...exo, ...row }); else novasOps.push(row);
    }
    existentes.filter((e) => ativo(e.Ativa) && !subm.some((o) => txt(o.id) === txt(e.ID))).forEach((e) => { desativar.push(e); json_(e.Arquivos, []).forEach((a) => apagar.push(a.id)); });

    for (const [fid, buf, meta] of novosArq) await salvarArquivo(fid, buf, meta);

    const row = { ID: idCli, Nome: txt(c.nome), Telefone: foneF(tel), CPF: cpfF(c.cpf), 'Matrícula': txt(c.mat), Senha: txt(c.senha), 'Vínculo': txt(c.vinculo), 'Número (final)': numero, 'Observações': txt(c.obs), Etapa: etapa, 'Cadastrado por': ex ? ex['Cadastrado por'] : ctx.eu.nome, 'Cadastrado em': ex ? ex['Cadastrado em'] : t, 'Atualizado em': t, 'Data de pagamento': pago, Bloqueado: modo === 'bloquear' && ex ? 'sim' : '', Documentos: JSON.stringify(docs.metas) };
    if (ex) await cliGravar({ ...ex, ...row }); else await adicionar('Clientes', [linhaDe(CLI, row)]);
    for (const r of linhasOps) await gravar(`'Operações'!A${r._linha}:${letra(OPS.length - 1)}${r._linha}`, [linhaDe(OPS, r)]);
    for (const r of desativar) await gravar(`'Operações'!L${r._linha}`, [['não']]);
    if (novasOps.length) await adicionar('Operações', novasOps.map((r) => linhaDe(OPS, r)));
    for (const fid of apagar) await apagarArquivo(fid);

    const lg = [{ o: ex ? 'Editou os dados' : 'Cadastrou o cliente', cid: idCli, nome: row.Nome }];
    if ((ex && antes !== etapa) || (!ex && etapa !== SYS.NOVO)) lg.push({ o: `Etapa: ${ex ? antes + ' → ' : ''}${etapa}`, cid: idCli, nome: row.Nome });
    if (modo === 'bloquear' && ex) lg.push({ o: 'Bloqueou o cliente', cid: idCli, nome: row.Nome });
    await logar(ctx, lg);
    const msg = { enviar: 'Cadastrado e enviado pra simulação. Caiu na fila do Rafael.', devolver: 'Simulação devolvida pra Melissa.', digitar: 'Enviado pra digitação.', bloquear: 'Cliente bloqueado.' }[modo] || 'Salvo.';
    return { msg: modo === 'enviar' && ex ? 'Enviado pra simulação.' : msg, id: idCli };
  },

  async mover(ctx, c) {
    const ex = achaCli(ctx, c.id);
    if (!ex) throw new Erro('Cliente não encontrado.', 404);
    if (bloqueado(ex)) throw new Erro('Cliente bloqueado. Só o gestor desbloqueia.', 409);
    const alvo = txt(c.etapa);
    if (!ctx.listas.status.some((s) => s.n === alvo) && alvo !== SYS.PERDIDO) throw new Erro('Etapa inválida.');
    if (alvo === SYS.PRONTA && ctx.eu.perfil !== 'gestor') throw new Erro('A simulação quem devolve é o gestor.', 403);
    const antes = txt(ex.Etapa) || SYS.NOVO;
    if (antes === alvo) return { msg: 'Já está nessa etapa.' };
    await cliGravar({ ...ex, Etapa: alvo, 'Atualizado em': agora(), 'Data de pagamento': alvo === SYS.PAGO && !txt(ex['Data de pagamento']) ? hojeStr() : ex['Data de pagamento'] });
    await logar(ctx, [{ o: `Etapa: ${antes} → ${alvo}`, cid: txt(ex.ID), nome: txt(ex.Nome) }]);
    return { msg: `Movido pra "${alvo}".` };
  },

  async desbloquear(ctx, c) {
    if (ctx.eu.perfil !== 'gestor') throw new Erro('Só o gestor desbloqueia.', 403);
    const ex = achaCli(ctx, c.id);
    if (!ex) throw new Erro('Cliente não encontrado.', 404);
    await cliGravar({ ...ex, Bloqueado: '', 'Atualizado em': agora() });
    await logar(ctx, [{ o: 'Desbloqueou o cliente', cid: txt(ex.ID), nome: txt(ex.Nome) }]);
    return { msg: 'Cliente desbloqueado.' };
  },

  async lista(ctx, c) {
    if (ctx.eu.perfil !== 'gestor') throw new Erro('Só o gestor mexe nas listas.', 403);
    const nome = TIPOS[c.tipo];
    if (!nome) throw new Erro('Lista inválida.');
    let valor = txt(c.valor);
    if (!valor) throw new Erro('Escreva o que quer adicionar.');
    if (c.tipo === 'numeros') { valor = valor.replace(/\D/g, ''); if (valor.length !== 4) throw new Erro('Coloque só os 4 últimos dígitos do número.'); }
    if (c.tipo === 'prazos') { const n = parseInt(valor, 10); if (!(n > 0 && n <= 480)) throw new Erro('Prazo precisa ser um número de meses.'); valor = n; }
    const rows = ctx.listasRows.filter((r) => norm(r.Tipo) === norm(nome));
    const mesmo = rows.find((r) => norm(r.Valor) === norm(valor));

    if (c.op === 'add') {
      if (mesmo && ativo(mesmo.Ativo)) throw new Erro(c.tipo === 'etapa' ? 'Essa etapa já existe.' : 'Já existe na lista.');
      if (c.tipo === 'etapa' && norm(valor) === norm(SYS.PERDIDO)) throw new Erro('Essa etapa já existe.');
      if (mesmo) { await gravar(`'Listas'!D${mesmo._linha}`, [['sim']]); return { msg: 'Adicionado.' }; }
      let fase = '', ordem = '';
      if (c.tipo === 'etapa') {
        const st = ctx.listas.status, est = c.fase === 'est';
        fase = est ? 'Esteira' : 'Negociação';
        let i = est ? st.findIndex((s) => s.n === SYS.PAGO) : st.map((s) => s.f).lastIndexOf('neg') + 1;
        if (i < 0) i = st.length;
        const ant = st[i - 1], dep = st[i];
        ordem = ant && dep ? (ant.o + dep.o) / 2 : ant ? ant.o + 1 : 1;
      }
      await adicionar('Listas', [[nome, valor, fase, 'sim', ordem]]);
      return { msg: 'Adicionado.' };
    }

    if (c.op === 'rm') {
      if (!mesmo || !ativo(mesmo.Ativo)) throw new Erro('Não achei esse item.', 404);
      const usadoCli = (col) => ctx.clientes.some((r) => txt(r[col]) === String(valor));
      const usadoOp = (col) => ctx.ops.some((o) => ativo(o.Ativa) && txt(o[col]) === String(valor));
      if (c.tipo === 'etapa' && (SISTEMA.includes(String(valor)))) throw new Erro('Essa etapa o painel usa nos botões. Não dá pra apagar.');
      const uso = { etapa: usadoCli('Etapa'), vinculos: usadoCli('Vínculo'), numeros: usadoCli('Número (final)'), produtos: usadoOp('Produto'), operacoes: usadoOp('Operação'), bancos: usadoOp('Banco'), prazos: ctx.ops.some((o) => ativo(o.Ativa) && num(o.Prazo) === valor) }[c.tipo];
      if (uso) throw new Erro(`"${c.tipo === 'prazos' ? valor + 'x' : valor}" está em uso. Troque nos clientes antes de apagar.`, 409);
      await gravar(`'Listas'!D${mesmo._linha}`, [['não']]);
      return { msg: 'Removido.' };
    }
    throw new Erro('Pedido inválido.');
  },
};
