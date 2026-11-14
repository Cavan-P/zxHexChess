// Single source of truth for applying moves and deciding when a game ends.
// Used by live rooms, headless self-play (tournaments/training) and anything else that plays a game.

const {
    parseFen, boardToFen, generateFilteredLegals, isKingAttacked, coordToIndex,
    promotionCells, cellName, NUM_CELLS
} = require('./moves')

const START_FEN = 'bqknbnr2rp1b1p1p2p2p1p3pp4p993P4PP3P1P2P2P1P1B1PR2RNBNQKB'
const PROMOTION_PIECES = ['q', 'r', 'b', 'n']
const FIFTY_MOVE_PLIES = 100

const other = color => color == 'white' ? 'black' : 'white'

const isValidCell = n => Number.isInteger(n) && n >= 0 && n < NUM_CELLS

const isPromotionMove = (piece, to) =>
    piece.piece.toLowerCase() == 'p' && promotionCells[piece.color].includes(to)

// Each cell has one of three shades; a bishop never leaves its shade. The "middle" shade is the
// one the centre cell f6 has (white's f3 bishop, black's f9 bishop).
const isMiddleShade = ([q, r]) => ((q - r) % 3 + 3) % 3 == 0

// A dead position: no sequence of legal moves can ever reach checkmate, so the game is drawn.
//
// Gliński's board differs from the square board here. Exhaustive searches over every placement
// show that a lone king CAN be checkmated by king + knight, and by king + a light- or dark-shade
// bishop (a corner king has only five moves), so those are NOT draws - play continues, though the
// mate can't be forced. But a middle-shade bishop can never deliver mate: not alone, not two of
// them, and not against a defending middle-shade bishop. So the position is dead exactly when every
// piece except the kings is a bishop on a middle-shade cell (including bare kings).
const hasInsufficientMaterial = board =>
    board.every(c => !c.piece || c.piece.toLowerCase() == 'k' || (c.piece.toLowerCase() == 'b' && isMiddleShade(c.coords)))

// Could `color` ever checkmate, by any sequence of moves? Not with only middle-shade bishops.
const canEverMate = (board, color) =>
    board.some(c => c.color == color && c.piece.toLowerCase() != 'k' && !(c.piece.toLowerCase() == 'b' && isMiddleShade(c.coords)))

class GameState {
    constructor({ fen = START_FEN, turn = 'white', enPassant = null } = {}){
        this.fen = fen
        this.turn = turn
        this.enPassant = enPassant
        this.halfmoveClock = 0
        this.history = []          // [{ from, to, notation }]
        this.positionCounts = new Map()
        this.result = null         // { winner: 'white'|'black'|null, reason, score }
        this.countPosition()
    }

    positionKey(){
        return `${this.fen}|${this.turn}|${this.enPassant ? this.enPassant.captureCell : '-'}`
    }

    countPosition(){
        const key = this.positionKey()
        const count = (this.positionCounts.get(key) || 0) + 1
        this.positionCounts.set(key, count)
        return count
    }

    board(){
        return parseFen(this.fen)
    }

    // The given side's last `count` moves, oldest first, as [{ from, to }].
    recentMovesBy(color, count = 6){
        return this.history.filter(m => m.color == color).slice(-count).map(m => ({ from: m.from, to: m.to }))
    }

    // The given side's most recent move ({ from, to }), or null.
    lastMoveBy(color){
        for(let i = this.history.length - 1; i >= 0; i--){
            if(this.history[i].color == color) return { from: this.history[i].from, to: this.history[i].to }
        }
        return null
    }

    // Every legal move for the side to move, as { fromCell: [toCell, ...] }.
    allLegalMoves(){
        if(this.result) return {}
        const board = this.board()
        const map = {}
        for(const c of board){
            if(c.color != this.turn) continue
            const moves = generateFilteredLegals(board, c.cell, this.turn, this.enPassant)
            if(moves.length) map[c.cell] = moves
        }
        return map
    }

    // Every position that has occurred so far, as "fen|turn" keys (bots use this to avoid repeating).
    seenPositions(){
        return [...new Set([...this.positionCounts.keys()].map(k => k.split('|').slice(0, 2).join('|')))]
    }

    legalMovesFrom(color, from){
        from = +from
        if(this.result || color != this.turn || !isValidCell(from)) return []
        const board = this.board()
        if(board[from].color != color) return []
        return generateFilteredLegals(board, from, color, this.enPassant)
    }

    // Does this move need a promotion choice before it can be played?
    needsPromotion(from, to){
        if(!isValidCell(from) || !isValidCell(to)) return false
        const piece = this.board()[from]
        return Boolean(piece.piece) && isPromotionMove(piece, to)
    }

    // Validates and plays a move for `color`. Returns { ok: true, move } or { ok: false, reason }.
    // `move` holds everything a client needs to animate it and update the game.
    play(color, from, to, promotion){
        from = +from
        to = +to

        if(this.result) return { ok: false, reason: 'Game is over' }
        if(color != this.turn) return { ok: false, reason: 'Not your turn' }
        if(!isValidCell(from) || !isValidCell(to)) return { ok: false, reason: 'Bad cell index' }

        const board = this.board()
        const movingPiece = board[from]

        if(!movingPiece.piece || movingPiece.color != color) return { ok: false, reason: 'No piece of yours there' }
        if(!generateFilteredLegals(board, from, color, this.enPassant).includes(to)) return { ok: false, reason: 'Illegal move' }

        const promoting = isPromotionMove(movingPiece, to)
        if(promoting){
            if(typeof promotion != 'string' || !PROMOTION_PIECES.includes(promotion.toLowerCase())){
                return { ok: false, reason: 'Promotion piece required', needsPromotion: true }
            }
        }

        const isPawn = movingPiece.piece.toLowerCase() == 'p'
        let captured = board[to].piece || null
        let capturedCell = to

        if(isPawn && this.enPassant && this.enPassant.color != color && to == this.enPassant.captureCell){
            capturedCell = this.enPassant.pawnCell
            captured = board[capturedCell].piece || null
            board[capturedCell] = { ...board[capturedCell], piece: '', color: '' }
        }

        const newPiece = promoting
            ? (color == 'white' ? promotion.toUpperCase() : promotion.toLowerCase())
            : movingPiece.piece

        board[to] = { ...board[to], piece: newPiece, color }
        board[from] = { ...board[from], piece: '', color: '' }

        // A two-step pawn advance leaves an en passant target behind it.
        let enPassant = null
        if(isPawn && Math.abs(movingPiece.coords[1] - board[to].coords[1]) == 2){
            const [fq, fr, fs] = movingPiece.coords
            const [tq, tr, ts] = board[to].coords
            const mid = coordToIndex((fq + tq) / 2, (fr + tr) / 2, (fs + ts) / 2)
            if(mid != undefined) enPassant = { captureCell: mid, pawnCell: to, color }
        }

        this.fen = boardToFen(board)
        this.enPassant = enPassant
        this.turn = other(color)
        this.halfmoveClock = (isPawn || captured) ? 0 : this.halfmoveClock + 1

        const opponentInCheck = isKingAttacked(board, this.turn, this.enPassant)
        const kingCell = opponentInCheck
            ? board.find(c => c.piece.toLowerCase() == 'k' && c.color == this.turn)?.cell ?? null
            : null

        this.result = this.computeResult(board, this.countPosition())

        const notation = [
            isPawn ? '' : movingPiece.piece.toUpperCase(),
            cellName(from),
            captured ? 'x' : '-',
            cellName(to),
            promoting ? '=' + newPiece.toUpperCase() : '',
            this.result?.reason == 'checkmate' ? '#' : opponentInCheck ? '+' : ''
        ].join('')

        const move = { from, to, color, captured, capturedCell, promotion: promoting ? newPiece : null, check: kingCell, notation }
        this.history.push(move)

        return { ok: true, move }
    }

    computeResult(board, repetitions){
        const toMove = this.turn
        const hasMove = board.some(c => c.color == toMove && generateFilteredLegals(board, c.cell, toMove, this.enPassant).length)

        if(!hasMove){
            if(isKingAttacked(board, toMove, this.enPassant)){
                return { winner: other(toMove), reason: 'checkmate', score: other(toMove) == 'white' ? '1-0' : '0-1' }
            }
            // Gliński's rule: stalemating the opponent wins ¾ of a point.
            return { winner: other(toMove), reason: 'stalemate', score: other(toMove) == 'white' ? '¾-¼' : '¼-¾' }
        }

        if(hasInsufficientMaterial(board)) return { winner: null, reason: 'insufficient material', score: '½-½' }
        if(repetitions >= 3) return { winner: null, reason: 'threefold repetition', score: '½-½' }
        if(this.halfmoveClock >= FIFTY_MOVE_PLIES) return { winner: null, reason: '50-move rule', score: '½-½' }

        return null
    }

    // `color` ran out of time. The opponent wins - unless they could never checkmate anyway, in
    // which case it's a draw (the standard rule, using Gliński's insufficient-material analysis).
    timeout(color){
        if(this.result) return null
        const opponent = other(color)
        this.result = canEverMate(this.board(), opponent)
            ? { winner: opponent, reason: 'timeout', score: opponent == 'white' ? '1-0' : '0-1' }
            : { winner: null, reason: 'timeout vs insufficient material', score: '½-½' }
        return this.result
    }

    resign(color){
        if(this.result) return null
        this.result = { winner: other(color), reason: 'resignation', score: other(color) == 'white' ? '1-0' : '0-1' }
        return this.result
    }

    agreeDraw(){
        if(this.result) return null
        this.result = { winner: null, reason: 'agreement', score: '½-½' }
        return this.result
    }

    abandon(color){
        if(this.result) return null
        this.result = { winner: other(color), reason: 'abandonment', score: other(color) == 'white' ? '1-0' : '0-1' }
        return this.result
    }
}

module.exports = { GameState, START_FEN, PROMOTION_PIECES, other, isValidCell }
