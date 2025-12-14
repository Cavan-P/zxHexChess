
import { Game } from "./game.js"
import { pointInHexagon, Smooth } from "./utils.js"

export class Piece {
    constructor(piece, x, y, cellSize, ctx){
        this.piece = piece

        this.x = x
        this.y = y
        this.startX = x
        this.startY = y

        this.targetX = x
        this.targetY = y
        this.slideSpeed = 4

        this.defaultSize = 60
        this.dragSize = 75
        this.size = this.defaultSize
        this.targetSize = this.defaultSize
        this.scaleSpeed = 3

        this.cellSize = cellSize

        this.hovering = false
        this.isDragging = false

        this.offsetX = 0
        this.offsetY = 0

        this.originalCell = null
        this.currentCell = null

        this.ctx = ctx
    }

    checkMouseHover(){
        return pointInHexagon(Game.mouse, this, this.size)
    }

    isMyPiece(myColor){
        return (this.piece == this.piece.toUpperCase()) == (myColor == 'white')
    }

    drop(){
        this.isDragging = false
        Game.draggedPiece = null
        Game.cells.forEach(cell => cell.isLegalTarget = false)
        this.targetSize = this.defaultSize

        let dropCell = null
        for(const cell of Game.cells){
            if(cell.checkMouseHover()){
                dropCell = cell
                break
            }
        }

        if(!dropCell || !Game.legalMoves.includes(dropCell.num)){
            this.snapBack()
            return
        }

        //console.log('Piece drop cell', dropCell)

        Game.socket.send(JSON.stringify({
            type: 'attemptMove',
            from: this.originalCell.num,
            to: dropCell.num,
            color: Game.playerColor
        }))

        Game.pendingMove = {
            piece: this,
            from: this.originalCell.num,
            to: dropCell.num,
            originalX: this.startX,
            originalY: this.startY
        }

        //this.snapBack()
        this.x = dropCell.x
        this.y = dropCell.y
    }

    snapBack(){
        this.x = this.startX
        this.y = this.startY
        this.currentCell = this.originalCell
    }

    update(){

        this.hovering = this.checkMouseHover()
        this.size += Smooth(this.size, this.targetSize, this.scaleSpeed)

        this.x += Smooth(this.x, this.targetX, this.slideSpeed)
        this.y += Smooth(this.y, this.targetY, this.slideSpeed)

        if(Math.abs(this.x - this.targetX) < 0.5) this.x = this.targetX
        if(Math.abs(this.y - this.targetY) < 0.5) this.y = this.targetY


        if(Game.playerColor != Game.turn) return

        if(Game.draggedPiece && Game.draggedPiece != this) return

        if(!this.isDragging && this.hovering && Game.mouse.pressed){
            if(this.isMyPiece(Game.playerColor)){

                Game.draggedPiece = this

                this.isDragging = true
                this.startX = this.x
                this.startY = this.y

                this.originalCell = this.currentCell

                Game.socket.send(JSON.stringify({
                    type: 'requestLegalMoves',
                    from: this.originalCell.num
                }))
            }
        }

        if(this.isDragging){
            if(Game.mouse.pressed){
                
                this.targetSize = this.dragSize
                this.x = Game.mouse.x
                this.y = Game.mouse.y
            }
            else {
                this.drop()
            }
        }
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
            Game.pieceSprite, sx, sy, 200, 200,
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