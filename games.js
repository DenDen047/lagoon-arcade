/* ゲーム一覧のデータ。ゲームを1本足すときは、ここに1件足して
   assets/thumbs/<slug>.jpg を置く（tools/capture-thumbs.sh で作れる）。 */
const GENRES = [
  { id: 'raising', ja: '育成', en: 'Raising' },
];

const GAMES = [
  {
    slug: 'mantis-keeper', genre: 'raising', players: '1P', date: '2026-10-20',
    ja: {
      title: 'カマキリ飼育日記 ― MANTIS KEEPER',
      desc: 'オオカマキリを1齢の幼虫から育てて卵鞘を産ませ、次の世代へつなぐ育成ゲーム。スマホ対応。',
    },
    en: {
      title: 'Mantis Keeper',
      desc: 'Raise a Chinese mantis from a tiny nymph until she lays an egg case, and carry the line on to the next generation. Plays on phones.',
    },
  },
];
