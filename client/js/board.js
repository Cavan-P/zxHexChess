import { Game } from './game.js'
import { drawHexagon } from './hexagon.js'
import { Cell } from './cell.js'
import { Piece } from './piece.js'

export let cells = []

// Logical drawing area: the board plus a margin for the coordinate labels.
export const BOARD_WIDTH = 880
export const BOARD_HEIGHT = 950

export const drawBoard = (colors, stroke, strokeWeight, populateCells) => {
    let cellNum = 0
    const hexSize = Game.cellSize

    // The board is laid out in a fixed logical space; main.js scales it to fit the canvas.
    const centerX = BOARD_WIDTH / 2
    const centerY = BOARD_HEIGHT / 2

    const rows = [1, 2, 3, 4, 5, 6, 5, 6, 5, 6, 5, 6, 5, 6, 5, 6, 5, 4, 3, 2, 1]

    const columnOffset = hexSize * 3
    const rowOffset = hexSize * Math.sqrt(3) / 2

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

    let y = centerY - ((rows.length - 1) * rowOffset / 2)
    let colorIndex = 0

    for(let row = 0; row < rows.length; row++){
        const numCols = rows[row]
        
        let x = centerX - ((numCols - 1) * columnOffset) / 2

        for(let col = 0; col < numCols; col++){
            const fill = colors ? colors[colorIndex] : undefined

            // Wood: give every cell its own grain direction and offset, like an inlaid board.
            if(fill instanceof CanvasPattern){
                const angle = [0, 60, 120][(cellNum * 7) % 3] + ((cellNum * 37) % 11) - 5
                fill.setTransform(new DOMMatrix().translateSelf(x + (cellNum * 53) % 97, y + (cellNum * 29) % 89).rotateSelf(angle))
            }

            drawHexagon(x, y, hexSize, fill, stroke, Game.palette?.edge || '#3b2718', strokeWeight, Game.ctx)

            // Hairline seams between wooden cells.
            if(fill instanceof CanvasPattern){
                drawHexagon(x, y, hexSize - 0.5, 'rgba(0, 0, 0, 0)', true, Game.palette.ink(0.35), 1, Game.ctx)
            }

            if(populateCells){

                let q = coordinates[cellNum][0]
                let r = coordinates[cellNum][1]
                let s = coordinates[cellNum][2]

                //Add cells here
                Game.cells.push(
                    new Cell(x, y, cellNum, q, r, s, hexSize, Game.ctx)
                )
                

            }

            x += columnOffset
            cellNum++
        }

        y+= rowOffset
        colorIndex = (++colorIndex) % 3
    }
}

export const populateBoardFromFen = fen => {
    Game.pieces.length = 0
    let cellIndex = 0

    for(let char of fen){
        if(/\d/.test(char)){
            cellIndex += +char
            continue
        }

        const cell = Game.cells[cellIndex]

        Game.pieces.push(
            new Piece(char, cell.x, cell.y, Game.cellSize, Game.ctx)
        )
        Game.pieces[Game.pieces.length - 1].currentCell = cell

        cell.occupiedBy = char
        cell.occupied = true
        cellIndex++
    }
}
