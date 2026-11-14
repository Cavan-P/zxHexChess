import { Game } from './game.js'
import { play } from './sound.js'
import { addSystemMessage } from './chat.js'

const $ = id => document.getElementById(id)

const el = (tag, className, text) => {
    const node = document.createElement(tag)
    if(className) node.className = className
    if(text != null) node.textContent = text
    return node
}

const icon = name => el('i', `fa-solid ${name}`)

// ------ Profile grid ------

// Fills the achievements section of the profile modal: earned ones in colour, the rest greyed out.
// Tapping a badge shows its name and what it's for underneath (hover shows it too).
export const renderAchievements = profile => {
    const container = $('profile-achievements')
    const caption = $('profile-achievement-caption')
    const defs = Game.achievementDefs || []
    container.replaceChildren()
    caption.textContent = 'Tap a badge to see what it\'s for.'
    if(!defs.length) return

    const earned = profile?.achievements || {}
    const describe = (def, got) => {
        caption.replaceChildren(el('span', 'font-semibold text-(--text-strong)', def.name), document.createTextNode(` · ${def.description}${got ? ` · earned ${new Date(earned[def.id]).toLocaleDateString()}` : ''}`))
    }

    const groups = [...new Set(defs.map(d => d.group))]
    for(const group of groups){
        const inGroup = defs.filter(d => d.group == group)
        container.append(el('h3', 'achievement-group', group))

        // Ratings read best as a row of milestones; show those earned plus the next one.
        if(group == 'Rating'){
            const row = el('div', 'flex flex-wrap gap-1.5')
            const nextIndex = inGroup.findIndex(d => !earned[d.id])
            inGroup.forEach((def, i) => {
                if(nextIndex != -1 && i > nextIndex) return
                const got = Boolean(earned[def.id])
                const pill = el('button', `rating-pill${got ? ' is-earned' : ''}`, def.name)
                pill.type = 'button'
                pill.title = def.description
                pill.onclick = _ => describe(def, got)
                row.append(pill)
            })
            container.append(row)
            continue
        }

        const grid = el('div', 'grid grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-1.5')
        for(const def of inGroup){
            const got = Boolean(earned[def.id])
            const badge = el('button', `achievement-badge${got ? ' is-earned' : ''}`)
            badge.type = 'button'
            badge.title = `${def.name}: ${def.description}`
            badge.setAttribute('aria-label', `${def.name}${got ? ' (earned)' : ''}: ${def.description}`)
            badge.append(icon(def.icon))
            badge.onclick = _ => describe(def, got)
            grid.append(badge)
        }
        container.append(grid)
    }
}

// ------ Unlock pop-ups ------

const queue = []
let showing = false

const showNext = _ => {
    const def = queue.shift()
    if(!def){ showing = false; return }
    showing = true

    const toast = el('div', 'achievement-toast')
    const badge = el('span', 'achievement-badge is-earned flex-none')
    badge.append(icon(def.icon))
    const text = el('div', 'min-w-0')
    text.append(el('p', 'eyebrow', 'Achievement unlocked'), el('p', 'font-semibold text-(--text-strong)', def.name), el('p', 'text-xs text-(--text-muted)', def.description))
    toast.append(badge, text)
    toast.onclick = _ => toast.remove()
    $('achievement-toasts').append(toast)
    play('promote')

    setTimeout(_ => {
        toast.classList.add('is-leaving')
        setTimeout(_ => { toast.remove(); showNext() }, 300)
    }, 4000)
}

export const setupAchievements = _ => {
    Game.onAchievements = earned => {
        for(const def of earned){
            addSystemMessage(`🏅 Achievement unlocked: ${def.name} (${def.description})`)
            queue.push(def)
        }
        if(!showing) showNext()
    }
}
