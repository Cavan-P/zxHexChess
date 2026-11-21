const { makeEngineBot } = require('../../engine')

// THE RATING ANCHOR. Milo is pinned at exactly 400 by scripts/rateBots.js and every other bot's
// rating is measured relative to him, so DO NOT EDIT his settings. If he ever has to change, the
// whole scale moves with him: re-run a full tournament afterwards so every bot gets re-rated.
//
// He's the definition of 400: he only looks at his own move (never your reply), so he walks into
// everything, but he does know what checkmate is - when he happens to notice a mate in one, he
// plays it. Heavy blind spots mean he notices it about half the time.
module.exports = makeEngineBot({
    id: 'miloPruitt',
    name: 'Milo Pruitt',
    description: 'Knows a checkmate when he sees one. He just doesn\'t always see it.',
    category: 'Novice',
    icon: 'fa-chess-pawn',
    elo: 400,
}, {
    maxDepth: 1, timeLimitMs: 500, eval: 'material', oversight: 0.55, blunderChance: 0.15
})
