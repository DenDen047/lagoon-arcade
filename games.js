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
  {
    slug: 'harabiro-keeper', genre: 'raising', players: '1P', date: '2026-11-03',
    ja: {
      title: 'ハラビロカマキリ飼育日記 ― HARABIRO KEEPER',
      desc: '木の上でくらすハラビロカマキリを1齢の幼虫から育てる育成ゲーム。季節で変わるエサとケースの温度に気をつけて、卵鞘を産ませて次の世代へつなぐ。スマホ対応。',
    },
    en: {
      title: 'Harabiro Keeper',
      desc: 'Raise a tree-dwelling broad-bellied mantis (Hierodula patellifera) from a nymph. Watch the seasons, the prey you can catch, and the temperature of the case, then carry the line on through her egg cases. Plays on phones.',
    },
  },
];
