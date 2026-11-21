const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const botManager = require('./botManager')

const AI_DIR = __dirname

// Relative files a source file requires that live under src/ai - the bot's own "brain" code (engine,
// heuristics, ...). The rules in src/game are left out: a rules bugfix shouldn't throw away every game.
const aiDeps = (file, seen = new Set()) => {
    if(seen.has(file)) return seen
    seen.add(file)
    const src = fs.readFileSync(file, 'utf8')
    for(const [, req] of src.matchAll(/require\(\s*['"](\.[^'"]+)['"]\s*\)/g)){
        let dep
        try { dep = require.resolve(path.resolve(path.dirname(file), req)) }
        catch(e){ continue }
        if(dep.startsWith(AI_DIR + path.sep) && !dep.includes(`${path.sep}node_modules${path.sep}`)) aiDeps(dep, seen)
    }
    return seen
}

// A short hash of a bot's file plus all the src/ai code it runs on. Two games with the same version
// were played by identical code, so ratings can safely pool them; change the bot (or the engine
// under it) and it becomes a new version whose old games no longer count.
const botVersion = id => {
    const file = botManager.getBotFile(id)
    if(!file) return null
    const hash = crypto.createHash('sha1')
    for(const f of [...aiDeps(file)].sort()) hash.update(path.relative(AI_DIR, f)).update('\0').update(fs.readFileSync(f)).update('\0')
    return hash.digest('hex').slice(0, 10)
}

module.exports = { botVersion }
