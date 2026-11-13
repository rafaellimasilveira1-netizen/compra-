/* Anexos (prints, PDFs, holerites) ficam no Netlify Blobs: não precisa de conta nem de pasta no Drive. */
const mem = new Map();
export const _mem = mem;
async function loja() {
  const { getStore } = await import('@netlify/blobs');
  return getStore({ name: 'anexos', consistency: 'strong' });
}
export async function salvarArquivo(id, buf, meta) {
  if (process.env.MOCK_SHEETS) { mem.set(id, { buf: Buffer.from(buf), meta }); return; }
  const s = await loja();
  await s.set(id, buf, { metadata: meta });
}
export async function lerArquivo(id) {
  if (process.env.MOCK_SHEETS) return mem.get(id) || null;
  const s = await loja();
  const r = await s.getWithMetadata(id, { type: 'arrayBuffer' });
  if (!r || !r.data) return null;
  return { buf: Buffer.from(r.data), meta: r.metadata || {} };
}
export async function apagarArquivo(id) {
  try {
    if (process.env.MOCK_SHEETS) { mem.delete(id); return; }
    const s = await loja();
    await s.delete(id);
  } catch { /* arquivo órfão não atrapalha */ }
}
