
import { Game } from "./game.js"
import { pointInHexagon, Smooth } from "./utils.js"

// Where each piece sits in img/pieces.png (200px squares; white on the top row, black below).
const SPRITES = {
    "p":[1000,200], "P":[1000,0],
    "r":[800,200],  "R":[800,0],
    "n":[600,200],  "N":[600,0],
    "b":[400,200],  "B":[400,0],
    "q":[200,200],  "Q":[200,0],
    "k":[0,200],    "K":[0,0]
}

export class Piece {
    constructor(piece, x, y, cellSize, ctx){
        this.piece = piece

        this.x = x
        this.y = y
        this.startX = x
        this.startY = y

        this.targetX = x
        this.targetY = y
        this.slideSpeed = 5

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

        Game.socket.send(JSON.stringify({
            type: 'attemptMove',
            from: this.originalCell.num,
            to: dropCell.num
        }))

        Game.pendingMove = {
            piece: this,
            from: this.originalCell.num,
            to: dropCell.num,
            originalX: this.startX,
            originalY: this.startY
        }

        // Park the piece on its new cell right away. Its animation target must move too, or it
        // slides back to where it came from while waiting for the server to confirm the move.
        this.x = this.targetX = dropCell.x
        this.y = this.targetY = dropCell.y
    }

    // Glide back to the starting cell (an illegal drop, or the server rejected the move).
    snapBack(){
        this.targetX = this.startX
        this.targetY = this.startY
        this.currentCell = this.originalCell
    }

    update(){

        this.hovering = this.checkMouseHover()
        this.size += Smooth(this.size, this.targetSize, this.scaleSpeed)

        this.x += Smooth(this.x, this.targetX, this.slideSpeed)
        this.y += Smooth(this.y, this.targetY, this.slideSpeed)

        if(Math.abs(this.x - this.targetX) < 0.5) this.x = this.targetX
        if(Math.abs(this.y - this.targetY) < 0.5) this.y = this.targetY


        if(Game.state == 'gameOver' || Game.playerColor != Game.turn) return

        if(Game.draggedPiece && Game.draggedPiece != this) return

        if(!this.isDragging && this.hovering && Game.mouse.pressed){
            if(this.isMyPiece(Game.playerColor)){

                Game.draggedPiece = this

                this.isDragging = true
                this.startX = this.x
                this.startY = this.y

                this.originalCell = this.currentCell

                // Legal moves for this turn arrive with the opponent's move, so highlights can show
                // instantly. Only ask the server if we somehow don't have them.
                const cached = Game.legalMap?.[this.originalCell.num]
                if(cached){
                    Game.legalMoves = cached
                    Game.onLegalMoves?.(this.originalCell.num, cached)
                }
                else {
                    Game.socket.send(JSON.stringify({
                        type: 'requestLegalMoves',
                        from: this.originalCell.num
                    }))
                }
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

    // Draws this piece's sprite centred on (x, y), upright for whoever is viewing.
    drawSprite(x, y, size, colorPerspective){
        const [sx, sy] = SPRITES[this.piece]
        this.ctx.save()

        if(colorPerspective == 'black'){
            this.ctx.translate(x, y)
            this.ctx.rotate(Math.PI)
            this.ctx.translate(-x, -y)
        }

        this.ctx.drawImage(Game.pieceSprite, sx, sy, 200, 200, x - size / 2, y - size / 2, size, size)
        this.ctx.restore()
    }

    display(showCurrentCell, colorPerspective){
        // While dragging, leave a faint ghost on the cell the piece was picked up from.
        if(this.isDragging && this.originalCell){
            this.ctx.save()
            this.ctx.globalAlpha = 0.3
            this.drawSprite(this.startX, this.startY, this.defaultSize, colorPerspective)
            this.ctx.restore()
        }

        this.drawSprite(this.x, this.y, this.size, colorPerspective)

        if(showCurrentCell){
            this.ctx.fillStyle = '#A00'
            this.ctx.font = '15px sans-serif'
            this.ctx.fillText(this.currentCell?.num, this.x - this.cellSize / 2, this.y - this.cellSize / 2.8)
        }
    }
}