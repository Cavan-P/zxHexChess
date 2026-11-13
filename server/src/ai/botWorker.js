
const { parentPort } = require('worker_threads')
const botManager = require('./botManager')

parentPort.on('message', ({ jobId, botId, state }) => {
    try {
        let play = botManager.getBotByName(botId)

        if(!play){
            botManager.reload()
            play = botManager.getBotByName(botId)
        }

        if(!play) throw new Error(`Unknown bot: ${botId}`)

        parentPort.postMessage({ jobId, move: play(state) || null })
    }
    catch(e){
        parentPort.postMessage({ jobId, error: e.message })
    }
})
