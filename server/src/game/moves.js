const parseFen = fen => {
    //bqknbnr2rp1b1p1p2p2p1p3pp4p993P4PP3P1P2P2P1P1B1PR2RNBNQKB

    let pieces = []

    for(let i = 0; i < fen.length; i++){
        const char = fen[i]

        if(isNaN(+char)){
            pieces.push({
                piece: char,
                color: char == char.toUpperCase() ? 'white' : 'black',
                cell: i
            })
        }
        else {
            for(let j = 0; j < +char; j++){
                pieces.push('')
            }
        }
    }

    console.log(pieces, 'ParseFen Function!')

    return pieces
}

//Generate legal moves for the current 'board' and the piece currently on cell 'cell'
const generateLegalMoves = (board, cell) => {
    const piece = board[cell]
    if(!piece) return []

    switch(piece.type){
        case 'pawn': return pawnMoves(board, position, piece.color)
        case 'knight': return knightMoves(board, position, piece.color)
        case 'bishop': return bishopMoves(board, position, piece.color)
        case 'rook': return rookMoves(board, position, piece.color)
        case 'queen': return queenMoves(board, position, piece.color)
        case 'king': return kingMoves(board, position, piece.color)

        default: return []
    }
}

function pawnMoves(board, pos, color){
    const moves = []

    return moves
}

function knightMoves(board, pos, color){
    const moves = []

    return moves
}

function bishopMoves(board, pos, color){
    const moves = []

    return moves
}
function rookMoves(board, pos, color){
    const moves = []

    return moves
}

function queenMoves(board, pos, color){
    return [...rookMoves(board, pos, color), ...bishopMoves(board, pos, color)]
}

function kingMoves(board, pos, color){
    const moves = []

    return moves
}

function isMoveLegal(board, from, to, color){
    const legal = generateLegalMoves(board, +from)
    return legal.some(cell => cell.num == to.num)
}

module.exports = {parseFen, isMoveLegal, generateLegalMoves}