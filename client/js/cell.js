import { Game } from "./game.js"
import { pointInHexagon } from "./utils.js"
import { drawHexagon } from "./hexagon.js"

export class Cell {
    constructor(x, y, num, q, r, s, size, ctx){

        this.x = x
        this.y = y

        this.num = num

        this.q = q
        this.r = r
        this.s = s

        this.occupied = false
        this.occupiedBy = ''

        this.landable = false

        this.hovering = false

        this.ctx = ctx
        this.size = size

    }

    checkMouseHover(){
        return pointInHexagon(Game.mouse, this, this.size)
    }

    update(){
        this.hovering = this.checkMouseHover()

        this.occupied = false
        this.occupiedBy = ''

        /*

        for(const piece of pieces){
            if(piece.currentCell?.num == this.num){
                this.occupied = true
                this.occupiedBy = piece.piece
                break
            }
        }
            */
    }

    display(showCellNumbers, showCoords, showOccupiedBy, colorPerspective){

        if(colorPerspective == 'black'){
            this.ctx.save()
            this.ctx.translate(this.x, this.y)
            this.ctx.rotate(Math.PI)
            this.ctx.translate(-this.x, -this.y)
        }

        if(showCellNumbers){
            this.ctx.fillStyle = '#000'
            this.ctx.font = '20px sans-serif'
            this.ctx.fillText(this.num, this.x, this.y)
        }
        if(showCoords){
            this.ctx.font = '13px sans-serif'

            this.ctx.fillStyle = 'rgba(0, 100, 0, 1)'
            this.ctx.fillText(this.q, this.x, this.y - (this.size / 1.4))

            this.ctx.fillStyle = 'rgba(0, 0, 200, 1)'
            this.ctx.fillText(this.r, this.x + (this.size / 1.8), this.y + (this.size / 2.8))

            this.ctx.fillStyle = 'rgba(255, 20, 147, 1)'
            this.ctx.fillText(this.s, this.x - (this.size / 1.8), this.y + (this.size / 2.8))
        }
        if(showOccupiedBy){
            this.ctx.fillStyle = '#000'
            this.ctx.font = '10px sans-serif'
            this.ctx.fillText(this.occupiedBy, this.x, this.y + this.size / 1.6)
        }
        if(this.hovering && this.occupied){
            canvas.style.cursor = 'pointer'
            drawHexagon(this.x, this.y, this.size, '#00611FAA', false, 0, this.ctx)
        }

        this.ctx.restore()
    }
}