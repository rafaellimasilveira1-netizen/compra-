import { autenticar } from '../lib/regras.mjs';
import { lerArquivo } from '../lib/blobs.mjs';
import { chaveDe, json } from '../lib/auth.mjs';

export default async (req) => {
  try {
    await autenticar(chaveDe(req));
    const id = new URL(req.url).searchParams.get('id') || '';
    if (!/^F[a-z0-9]{6,40}$/i.test(id)) return json({ erro: 'Arquivo inválido.' }, 400);
    const a = await lerArquivo(id);
    if (!a) return json({ erro: 'Arquivo não encontrado.' }, 404);
    const nome = encodeURIComponent(String((a.meta && a.meta.name) || 'arquivo'));
    return new Response(a.buf, { status: 200, headers: { 'content-type': (a.meta && a.meta.type) || 'application/octet-stream', 'content-disposition': `inline; filename*=UTF-8''${nome}`, 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff' } });
  } catch (e) {
    return json({ erro: e.message || 'Erro.' }, e.status || 502);
  }
};
