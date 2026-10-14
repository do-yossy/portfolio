'use strict';
// 投稿の共通の形。アダプタは、新しい形（post）と、従来の形（text・media・options）のどちらでも受け取れる。
//   post = { category: 'text'|'image'|'video'|'tree', text, medias: [メディア], tree: [{ text, medias: [] }], options }
function normalize(args = {}) {
  if (args.post) {
    const p = args.post;
    return { category: p.category, text: p.text || '', medias: p.medias || [], tree: p.tree || [], options: p.options || {} };
  }
  const medias = args.media ? [args.media] : [];
  const category = !medias.length ? 'text' : (medias[0].kind === 'video' ? 'video' : 'image');
  return { category, text: args.text || '', medias, tree: [], options: args.options || {} };
}
const images = (p) => p.medias.filter((m) => m.kind === 'image');
const videos = (p) => p.medias.filter((m) => m.kind === 'video');
module.exports = { normalize, images, videos };
