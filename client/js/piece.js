
import { Game } from "./game.js"
import { premoveTargets, setPremove, cancelPremove } from "./premove.js"
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

// Drops any tap-selection and its move highlights.
export const clearSelection = _ => {
    Game.selectedPiece = null
    Game.cells.forEach(cell => cell.isLegalTarget = false)
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

    // Where the piece rests: its premoved cell if moves are queued for it, else its real cell.
    homeCell(){
        return this.premoveCell || this.currentCell
    }

    isMyPiece(myColor){
        return (this.piece == this.piece.toUpperCase()) == (myColor == 'white')
    }

    drop(){
        this.isDragging = false
        Game.draggedPiece = null
        this.targetSize = this.defaultSize

        let dropCell = null
        for(const cell of Game.cells){
            if(cell.checkMouseHover()){
                dropCell = cell
                break
            }
        }

        // Released on its own cell: that's a tap. Select the piece (keeping its highlights) so the
        // next tap on a highlighted cell moves it - or deselect it if it was already selected.
        if(dropCell == this.originalCell){
            this.snapBack()
            if(this.wasSelected) clearSelection()
            else Game.selectedPiece = this
            return
        }

        clearSelection()

        // Picked up during the opponent's turn: queue it as a premove (or, if the turn arrived
        // while you were still holding the piece, play it now if it's legal).
        if(this.pickedForPremove){
            const myTurnNow = Game.turn == Game.playerColor
            // If the turn arrived mid-drag, only a piece with no other premoves queued can play now.
            const ok = dropCell && (myTurnNow
                ? this.originalCell == this.currentCell && !Game.premoves?.length && Game.legalMap?.[this.originalCell.num]?.includes(dropCell.num)
                : Game.legalMoves.includes(dropCell.num))
            if(!ok){ this.snapBack(); return }
            if(!myTurnNow){
                setPremove(this.originalCell.num, dropCell.num)
                this.snapBack()
                return
            }
            this.sendMove(dropCell, 'q')
            this.x = dropCell.x
            this.y = dropCell.y
            return
        }

        if(!dropCell || !Game.legalMoves.includes(dropCell.num)){
            this.snapBack()
            return
        }

        // Park the piece on its new cell right away. Its animation target must move too, or it
        // slides back to where it came from while waiting for the server to confirm the move.
        this.sendMove(dropCell)
        this.x = dropCell.x
        this.y = dropCell.y
    }

    // Tap-to-move: glide from the selected piece's cell to the tapped one.
    tapMoveTo(cell, promotion){
        this.originalCell = this.currentCell
        this.startX = this.currentCell.x
        this.startY = this.currentCell.y
        clearSelection()
        this.sendMove(cell, promotion)
    }

    sendMove(cell, promotion){
        Game.socket.send(JSON.stringify({
            type: 'attemptMove',
            from: this.originalCell.num,
            to: cell.num,
            ...(promotion ? { promotion } : {})
        }))

        Game.pendingMove = {
            piece: this,
            from: this.originalCell.num,
            to: cell.num,
            originalX: this.startX,
            originalY: this.startY
        }

        this.targetX = cell.x
        this.targetY = cell.y
    }

    // Glide back to where the piece rests (an illegal drop, a tap, or a queued premove).
    snapBack(){
        const home = this.homeCell()
        if(!home) return
        this.targetX = home.x
        this.targetY = home.y
    }

    update(){

        this.hovering = this.checkMouseHover()
        this.size += Smooth(this.size, this.targetSize, this.scaleSpeed)

        const glide = Game.slideDivisor || this.slideSpeed
        this.x += Smooth(this.x, this.targetX, glide)
        this.y += Smooth(this.y, this.targetY, glide)

        if(Math.abs(this.x - this.targetX) < 0.5) this.x = this.targetX
        if(Math.abs(this.y - this.targetY) < 0.5) this.y = this.targetY


        // On your turn you move; on the opponent's turn you can queue a premove.
        const myTurn = Game.playerColor == Game.turn
        if(Game.state != 'playing' || Game.viewPly != null) return
        if(Game.playerColor != 'white' && Game.playerColor != 'black') return

        if(Game.draggedPiece && Game.draggedPiece != this) return

        if(!this.isDragging && this.hovering && Game.mouse.pressed && !Game.draggedPiece){
            if(this.isMyPiece(Game.playerColor) && !this.premoveCaptured){

                Game.draggedPiece = this
                this.wasSelected = Game.selectedPiece == this

                this.isDragging = true
                this.pickedForPremove = !myTurn

                // Measure from the cell itself, not from where the piece happens to be drawn: it
                // may still be mid-slide, and snapping back there would strand it between cells.
                this.originalCell = myTurn ? this.currentCell : this.homeCell()
                this.startX = this.originalCell.x
                this.startY = this.originalCell.y

                // Legal moves for this turn arrive with the opponent's move, so highlights can show
                // instantly. Only ask the server if we somehow don't have them.
                const cached = Game.legalMap?.[this.originalCell.num]
                if(!myTurn){
                    Game.legalMoves = premoveTargets(this)
                    Game.onLegalMoves?.(this.originalCell.num, Game.legalMoves)
                }
                else if(cached){
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

        // A piece a queued premove would capture is shown faded.
        if(this.premoveCaptured && !this.isDragging){
            this.ctx.save()
            this.ctx.globalAlpha = 0.35
            this.drawSprite(this.x, this.y, this.size, colorPerspective)
            this.ctx.restore()
        }
        else this.drawSprite(this.x, this.y, this.size, colorPerspective)

        if(showCurrentCell){
            this.ctx.fillStyle = '#A00'
            this.ctx.font = '15px sans-serif'
            this.ctx.fillText(this.currentCell?.num, this.x - this.cellSize / 2, this.y - this.cellSize / 2.8)
        }
    }
}