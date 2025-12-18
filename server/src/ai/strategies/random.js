const { parseFen, generateFilteredLegals } = require('../../game/moves')

module.exports = function randomBot({ fen, turn, enPassant }) {
    const board = parseFen(fen)
    const candidates = []

    for (let i = 0; i < board.length; i++) {
        const piece = board[i]
        if (!piece || piece.color !== turn) continue

        const legals = generateFilteredLegals(board, i, turn, enPassant)
        for (const to of legals) {
            candidates.push({ from: i, to })
        }
    }

    if (!candidates.length) return null
    return candidates[Math.floor(Math.random() * candidates.length)]
}
