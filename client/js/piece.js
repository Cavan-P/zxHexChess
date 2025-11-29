
import { Game } from "./game.js"
import { pointInHexagon } from "./utils.js"

export class Piece {
    constructor(piece, x, y, cellSize, ctx){
        this.piece = piece

        this.x = x
        this.y = y

        this.size = 60
        this.cellSize = cellSize

        this.hovering = false

        this.isDragging = false
        this.offsetX = 0
        this.offsetY = 0

        this.originalCell = null
        this.currentCell = null

        this.ctx = ctx
    }

    containsPoint(mx, my){
        return pointInHexagon({ x: mx, y: my}, { x: this.x, y: this.y }, this.cellSize)
    }

    update(cells){

    }

    display(showCurrentCell, colorPerspective){
        this.ctx.save()

        if(colorPerspective == 'black'){
            this.ctx.translate(this.x, this.y)
            this.ctx.rotate(Math.PI)
            this.ctx.translate(-this.x, -this.y)
        }

        const map = {
            "p":[1000,200], "P":[1000,0],
            "r":[800,200],  "R":[800,0],
            "n":[600,200],  "N":[600,0],
            "b":[400,200],  "B":[400,0],
            "q":[200,200],  "Q":[200,0],
            "k":[0,200],    "K":[0,0]
        }

        const [sx, sy] = map[this.piece]
        this.ctx.drawImage(
            Game.pieceSprite, sx, sy, 200,200,
            this.x - this.size/2,
            this.y - this.size/2,
            this.size, this.size
        )

        if(showCurrentCell){
            this.ctx.fillStyle = '#A00'
            this.ctx.font = '15px sans-serif'
            this.ctx.fillText(this.currentCell?.num, this.x - this.cellSize / 2, this.y - this.cellSize / 2.8)
        }

        this.ctx.restore()
    }
}