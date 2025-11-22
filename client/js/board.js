import { drawHexagon, getHexagonPoints } from './hexagon.js'
import { Cell } from './cell.js'
import { Piece } from './piece.js'

export let cells = []

export const drawBoard = (hexSize, colors, stroke, strokeWeight, ctx, populateCells) => {
    let cellNum = 0

    const centerX = window.innerWidth / 2
    const centerY = window.innerHeight / 2

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
            drawHexagon(x, y, hexSize, colors[colorIndex], stroke, strokeWeight, ctx)

            if(populateCells){

                let q = coordinates[cellNum][0]
                let r = coordinates[cellNum][1]
                let s = coordinates[cellNum][2]

                //Add cells here
                cells.push(
                    new Cell(x, y, cellNum, q, r, s, hexSize, ctx)
                )

            }

            x += columnOffset
            cellNum++
        }

        y+= rowOffset
        colorIndex = (++colorIndex) % 3
    }
}

export const populateBoardFromFen = (fen, cells, pieces, ctx) => {
    let cellIndex = 0

    for(let i = 0; i < fen.length; i++){
        const char = fen[i]

        if(/\d/.test(char)){
            cellIndex += +char
            continue
        }

        const cell = cells[cellIndex]

        pieces.push(
            new Piece(char, cell.x, cell.y, ctx)
        )

        cell.occupiedBy = char
        cellIndex++
    }
}
