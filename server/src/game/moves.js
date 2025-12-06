const coordinates = [
    [0, -5, 5],
    [-1, -4, 5],
    [1, -5, 4],
    [-2, -3, 5],
    [0, -4, 4],
    [2, -5, 3],
    [-3, -2, 5],
    [-1, -3, 4],
    [1, -4, 3],
    [3, -5, 2],
    [-4, -1, 5],
    [-2, -2, 4],
    [0, -3, 3],
    [2, -4, 2],
    [4, -5, 1],
    [-5, 0, 5],
    [-3, -1, 4],
    [-1, -2, 3],
    [1, -3, 2],
    [3, -4, 1],
    [5, -5, 0],
    [-4, 0, 4],
    [-2, -1, 3],
    [0, -2, 2],
    [2, -3, 1],
    [4, -4, 0],
    [-5, 1, 4],
    [-3, 0, 3],
    [-1, -1, 2],
    [1, -2, 1],
    [3, -3, 0],
    [5, -4, -1],
    [-4, 1, 3],
    [-2, 0, 2],
    [0, -1, 1],
    [2, -2, 0],
    [4, -3, -1],
    [-5, 2, 3],
    [-3, 1, 2],
    [-1, 0, 1],
    [1, -1, 0],
    [3, -2, -1],
    [5, -3, -2],
    [-4, 2, 2],
    [-2, 1, 1],
    [0, 0, 0],
    [2, -1, -1],
    [4, -2, -2],
    [-5, 3, 2],
    [-3, 2, 1],
    [-1, 1, 0],
    [1, 0, -1],
    [3, -1, -2],
    [5, -2, -3],
    [-4, 3, 1],
    [-2, 2, 0],
    [0, 1, -1],
    [2, 0, -2],
    [4, -1, -3],
    [-5, 4, 1],
    [-3, 3, 0],
    [-1, 2, -1],
    [1, 1, -2],
    [3, 0, -3],
    [5, -1, -4],
    [-4, 4, 0],
    [-2, 3, -1],
    [0, 2, -2],
    [2, 1, -3],
    [4, 0, -4],
    [-5, 5, 0],
    [-3, 4, -1],
    [-1, 3, -2],
    [1, 2, -3],
    [3, 1, -4],
    [5, 0, -5],
    [-4, 5, -1],
    [-2, 4, -2],
    [0, 3, -3],
    [2, 2, -4],
    [4, 1, -5],
    [-3, 5, -2],
    [-1, 4, -3],
    [1, 3, -4],
    [3, 2, -5],
    [-2, 5, -3],
    [0, 4, -4],
    [2, 3, -5],
    [-1, 5, -4],
    [1, 4, -5],
    [0, 5, -5]
]

const coordIndexMap = {}


const parseFen = fen => {
    //bqknbnr2rp1b1p1p2p2p1p3pp4p993P4PP3P1P2P2P1P1B1PR2RNBNQKB

    let pieces = []

    for(let i = 0, boardIndex = 0; i < fen.length; i++){
        const char = fen[i]

        if(/[0-9]/.test(char)){
            for(let j = 0; j < +char; j++){
                pieces.push({
                    piece: '',
                    color: '',
                    cell: boardIndex,
                    coords: [...coordinates[boardIndex]]
                })

                const k = coordinates[boardIndex].join(',')
                coordIndexMap[k] = boardIndex

                boardIndex ++
            }
        }
        else {
            pieces.push({
                piece: char,
                color: char == char.toUpperCase() ? 'white' : 'black',
                cell: boardIndex,
                coords: [...coordinates[boardIndex]]
            })

            const k = coordinates[boardIndex].join(',')
            coordIndexMap[k] = boardIndex

            boardIndex ++
        }
    }

    //console.log(pieces, 'ParseFen Function!')

    return pieces
}

//Generate legal moves for the current 'board' and the piece currently on cell 'cell'
const generateLegalMoves = (board, cell, color) => {
    const piece = board[cell]
    if(!piece) return []

    switch(piece.piece.toLowerCase()){
        case 'p': return pawnMoves(board, cell, color)
        case 'n': return knightMoves(board, cell, color)
        case 'b': return bishopMoves(board, cell, color)
        case 'r': return rookMoves(board, cell, color)
        case 'q': return queenMoves(board, cell, color)
        case 'k': return kingMoves(board, cell, color)

        default: return []
    }
}
/* ------------------------

    BOARD:
        Index of element is its current cell
        Pieces have
         - piece: alphabetical representation of piece
         - color: is it white or black
         - cell: its current cell
        Empty string means nothing on that cell

   ------------------------ */
function pawnMoves(board, cell, color){
    const moves = []

    return moves
}

function knightMoves(board, cell, color){
    const moves = []

    const offsets = [
        [1, -3, 2], [-1, -2, 3],
        [1, 2, -3], [-1, 3, -2],
        [2, -3, 1], [3, -2, -1],
        [3, -1, -2], [2, 1, -3],
        [-2, -1, 3], [-3, 1, 2],
        [-3, 2, 1], [-2, 3, -1]
    ]

    const from = board[cell]
    const [q, r, s] = from.coords

    for(const [dq, dr, ds] of offsets){
        const nq = q + dq
        const nr = r + dr
        const ns = s + ds

        const key = `${nq},${nr},${ns}`
        const targetIndex = coordIndexMap[key]

        if(targetIndex == undefined) continue //Off the board
        const target = board[targetIndex]

        if(!target.piece){
            moves.push(targetIndex)
            continue
        }

        if(target.color != color){
            moves.push(targetIndex)
        }
    }

    return moves
}

function bishopMoves(board, cell, color){
    const moves = []

    return moves
}
function rookMoves(board, cell, color){
    const moves = []

    return moves
}

function queenMoves(board, cell, color){
    return [...rookMoves(board, cell, color), ...bishopMoves(board, cell, color)]
}

function kingMoves(board, cell, color){
    const moves = []

    return moves
}

function isMoveLegal(board, from, to, color){
    const legal = generateLegalMoves(board, +from)
    return legal.some(cell => cell.num == to.num)
}

module.exports = {parseFen, isMoveLegal, generateLegalMoves}