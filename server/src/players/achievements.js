// Achievements: little badges earned by playing. Each one has an id, a name, a description, an
// icon (Font Awesome) and a group, and is checked at the end of every rated game.
//
// Some are about the game that just finished (checkmate with a knight, win with under a second on
// the clock...). Others are about the player's record (reach a 1000 rating, beat every Expert bot),
// so they're picked up even if they were really earned before achievements existed.

const RATING_STEPS = []
for(let r = 900; r <= 2500; r += 100) RATING_STEPS.push(r)

const TIERS = ['Beginner', 'Novice', 'Apprentice', 'Intermediate', 'Advanced', 'Expert', 'Master']

const PIECE_NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }
const VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }

const def = (id, group, name, description, icon) => ({ id, group, name, description, icon })

const DEFINITIONS = [
    // Ratings: a new one every 100 points.
    ...RATING_STEPS.map(r => def(`rating-${r}`, 'Rating', String(r), `Reach a ${r} rating`, 'fa-arrow-trend-up')),

    // Bots
    ...TIERS.flatMap(tier => [
        def(`tier-${tier.toLowerCase()}`, 'Bots', `${tier} beaten`, `Beat a ${tier} bot`, 'fa-robot'),
        def(`clear-${tier.toLowerCase()}`, 'Bots', `${tier} cleared`, `Beat every ${tier} bot`, 'fa-medal')
    ]),
    def('clear-all', 'Bots', 'Last one standing', 'Beat every bot on the site', 'fa-crown'),

    // Playing
    def('first-game', 'Playing', 'First moves', 'Finish a rated game', 'fa-chess-pawn'),
    def('live-game', 'Playing', 'Face to face', 'Play a game against another person', 'fa-user-group'),
    def('live-win', 'Playing', 'Human after all', 'Beat another person', 'fa-handshake'),
    def('games-10', 'Playing', 'Regular', 'Play 10 rated games', 'fa-mug-hot'),
    def('games-50', 'Playing', 'Club member', 'Play 50 rated games', 'fa-id-card'),
    def('games-100', 'Playing', 'Part of the furniture', 'Play 100 rated games', 'fa-couch'),
    def('streak-5', 'Playing', 'On a roll', 'Win 5 games in a row', 'fa-fire'),
    def('giant-killer', 'Playing', 'Giant killer', 'Beat someone rated 200+ points above you', 'fa-hand-fist'),

    // Checkmates
    def('mate-p', 'Checkmates', 'Pawn power', 'Checkmate with a pawn', 'fa-chess-pawn'),
    def('mate-n', 'Checkmates', 'Horsing around', 'Checkmate with a knight', 'fa-chess-knight'),
    def('mate-b', 'Checkmates', 'On the diagonal', 'Checkmate with a bishop', 'fa-chess-bishop'),
    def('mate-r', 'Checkmates', 'Straight lines', 'Checkmate with a rook', 'fa-chess-rook'),
    def('mate-q', 'Checkmates', 'Her majesty', 'Checkmate with a queen', 'fa-chess-queen'),
    def('mate-k', 'Checkmates', 'Royal decree', 'Checkmate by moving your king (a discovered mate)', 'fa-chess-king'),
    def('mate-promo', 'Checkmates', 'Crowning glory', 'Promote a pawn with checkmate', 'fa-wand-magic-sparkles'),

    // Style
    def('photo-finish', 'Style', 'Photo finish', 'Win with less than a second on your clock', 'fa-stopwatch'),
    def('quick-mate', 'Style', 'In a hurry', 'Checkmate in 10 moves or fewer', 'fa-bolt'),
    def('flawless', 'Style', 'Flawless', 'Win by checkmate without losing a single piece', 'fa-shield-halved'),
    def('comeback', 'Style', 'Comeback', 'Win after being 5 or more points of material down', 'fa-rotate-left'),
    def('stalemate-win', 'Style', 'Three quarters', 'Win by stalemate (worth ¾ of a point in Gliński)', 'fa-scale-unbalanced'),
    def('flagged', 'Style', 'Out of time', 'Win on time', 'fa-hourglass-end'),
    def('en-passant', 'Style', 'En passant', 'Capture en passant', 'fa-person-walking-arrow-right'),
    def('underpromote', 'Style', 'Humble beginnings', 'Promote a pawn to something other than a queen', 'fa-chess-knight'),
    def('marathon', 'Style', 'Marathon', 'Play a game lasting 100 moves', 'fa-person-running')
]

const BY_ID = Object.fromEntries(DEFINITIONS.map(d => [d.id, d]))

const isWhitePiece = letter => letter == letter.toUpperCase()

// Material for `color` minus the opponent's, read straight from a FEN.
const materialBalance = (fen, color) => {
    let balance = 0
    for(const ch of fen.split(' ')[0]){
        const value = VALUES[ch.toLowerCase()]
        if(value == null) continue
        balance += (isWhitePiece(ch) == (color == 'white')) ? value : -value
    }
    return balance
}

// Everything earned by `color` in the game that just ended.
//   game        - the GameState (history, positions); `result` defaults to game.result
//   player      - the player's stored record, already updated with this game
//   opponent    - { rating, isBot }
//   clockMs     - the player's remaining time, or null for untimed games
//   bots        - the current bot list ({ id, category }) for the bot achievements
const checkGame = ({ color, game, result = game.result, player, opponent, ratingBefore, clockMs = null, bots = [] }) => {
    const earned = new Set()
    result ||= {}
    const won = result.winner == color
    const mine = game.history.filter(m => m.color == color)
    const last = game.history.at(-1)

    // Record-based
    const best = Math.max(player.peak || 0, player.elo || 0)
    RATING_STEPS.forEach(r => { if(best >= r) earned.add(`rating-${r}`) })

    const beaten = new Set(Object.keys(player.botsBeaten || {}))
    for(const tier of TIERS){
        const inTier = bots.filter(b => b.category == tier)
        if(!inTier.length) continue
        if(inTier.some(b => beaten.has(b.id))) earned.add(`tier-${tier.toLowerCase()}`)
        if(inTier.every(b => beaten.has(b.id))) earned.add(`clear-${tier.toLowerCase()}`)
    }
    if(bots.length && bots.every(b => beaten.has(b.id))) earned.add('clear-all')

    if(player.gamesPlayed >= 1) earned.add('first-game')
    if(player.gamesPlayed >= 10) earned.add('games-10')
    if(player.gamesPlayed >= 50) earned.add('games-50')
    if(player.gamesPlayed >= 100) earned.add('games-100')
    if((player.streak || 0) >= 5) earned.add('streak-5')

    // This game
    if(!opponent.isBot){
        earned.add('live-game')
        if(won) earned.add('live-win')
    }
    if(won && opponent.rating != null && ratingBefore != null && opponent.rating - ratingBefore >= 200) earned.add('giant-killer')

    if(mine.some(m => m.captured && m.capturedCell != m.to)) earned.add('en-passant')
    if(mine.some(m => m.promotion && m.promotion.toLowerCase() != 'q')) earned.add('underpromote')
    if(game.history.length >= 200) earned.add('marathon')

    if(won){
        if(result.reason == 'checkmate' && last?.color == color){
            const piece = (last.piece || '').toLowerCase()
            if(last.promotion) earned.add('mate-promo')
            if(PIECE_NAMES[piece]) earned.add(`mate-${piece}`)
            if(mine.length <= 10) earned.add('quick-mate')
            if(!game.history.some(m => m.color != color && m.captured)) earned.add('flawless')
        }
        if(result.reason == 'stalemate') earned.add('stalemate-win')
        if(result.reason == 'timeout') earned.add('flagged')
        if(clockMs != null && clockMs < 1000) earned.add('photo-finish')
        if(Math.min(...game.positions.map(fen => materialBalance(fen, color))) <= -5) earned.add('comeback')
    }

    return [...earned]
}

module.exports = { DEFINITIONS, BY_ID, checkGame, materialBalance }
