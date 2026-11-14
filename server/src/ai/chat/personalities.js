// What each bot says, and how much. Lines may use {name} (the opponent), {piece} and {cell}.
//
//   chattiness  0-1  how often optional comments fire
//   awareness   0-1  how likely the bot is to notice tactics (hung pieces, sacrifices)
//
// A line can be a plain string, or when('condition', 'text') to require something on the board,
// e.g. when('hasQueen', ...) so a bot never brags about a queen it has lost. If every line for an
// event is ruled out, the bot simply stays quiet.
//
// Events (any a bot leaves out fall back to DEFAULT):
//   greeting, idle, playerHangs, botBlunder, brilliantSac, playerChecks, botChecks, botCaptures,
//   botPromotes, playerPromotes, winning, losing, drawish, win, winOther (won by resignation or
//   abandonment), loss, draw, stalemateWin, stalemateLoss, replyHello, replyGG, reply

// A line that only makes sense when something is true on the board (conditions live in chatter.js).
const when = (condition, text) => ({ when: condition, text })

const DEFAULT = {
    chattiness: 0.5,
    awareness: 0.5,
    lines: {
        greeting: ['Good luck, {name}!', 'Let\'s have a good game.'],
        idle: ['Take your time.', 'Hmm, what are you planning?', 'No rush.'],
        playerHangs: ['Free {piece}! Thank you.', 'That {piece} on {cell} looks a little lonely. I\'ll keep it company.'],
        botBlunder: ['Oops. I needed that {piece}.', 'Ah, I missed that.'],
        brilliantSac: ['Wow, that sacrifice was real. Nicely done.', 'You gave up that piece on purpose? Impressive.'],
        playerChecks: ['Check, huh.', 'Okay, okay, my king is moving.'],
        botChecks: ['Check!', 'Your king, {name}.'],
        botCaptures: ['I\'ll take that {piece}, thanks.'],
        botPromotes: ['A new queen for me!', 'Promotion time.'],
        playerPromotes: ['A new queen? That\'s trouble.', 'Nice promotion.'],
        winning: ['Things are looking good for me.'],
        losing: ['This is getting tough.'],
        drawish: ['This feels like it\'s heading for a draw.'],
        win: ['Checkmate! Good game, {name}.'],
        winOther: ['Good game, {name}.'],
        loss: ['Well played, {name}. You got me.'],
        draw: ['A draw. Fair result.'],
        stalemateWin: ['Stalemate! In this variant, that\'s three quarters of a point for me.'],
        stalemateLoss: ['Stalemate... and in Gliński\'s rules that counts in your favour. Well done.'],
        replyHello: ['Hi {name}!', 'Hello! Good luck.'],
        replyGG: ['Good game!', 'Thanks, you too!'],
        reply: ['Ha, sure.', 'Mm-hm.', 'Sorry, concentrating!']
    }
}

const BOTS = {
    // ---------------- Beginner ----------------

    timothyWells: {
        chattiness: 0.8,
        awareness: 0,
        lines: {
            greeting: ['Hi! I\'m still learning how the pieces move. Is that okay?', 'Hello! Which one is the horse again?'],
            idle: ['Does the bishop go sideways? I always forget.', 'I like the little crown on the king.', 'Is it my turn? No? Okay!'],
            botBlunder: ['Wait, where did my {piece} go?', 'Oh! You can take that one? Cool!'],
            brilliantSac: ['Huh, how are you winning? You gave me a piece!'],
            playerChecks: ['What does check mean again?', 'Oh no, is my king in trouble?'],
            botChecks: ['Check! I think? Is that check?', 'Did I just do a check?!'],
            botCaptures: ['I took a {piece}! Is that good?'],
            winning: ['I have more pieces than you! Is that how you win?'],
            losing: ['I don\'t have many pieces left...'],
            drawish: ['Is this game ever going to end?'],
            win: ['I WON?! I don\'t even know how! Good game!'],
            loss: ['Aww. Good game! I\'ll practice more.', 'You\'re really good! Can you teach me?'],
            draw: ['A draw! That\'s like a tie, right?'],
            replyHello: ['Hi!! Good luck! I\'ll need it more than you.'],
            replyGG: ['Good game!! That was fun!'],
            reply: ['Sorry, I\'m trying to remember how the knight moves.', 'Haha okay!']
        }
    },

    evanBrooks: {
        chattiness: 0.7,
        awareness: 0.1,
        lines: {
            greeting: ['Hey! Just happy to be here. Did you know I beat Timothy once?', 'Hi {name}! No pressure, I\'m just glad to play.'],
            idle: ['No rush! I\'m having fun either way.', 'Did I mention I beat Timothy? Just checking.', 'Nice day for some hex chess.'],
            playerHangs: ['Wait, is that {piece} free? That can\'t be right.'],
            botBlunder: ['Ah, there goes my {piece}. That\'s fine! I\'m just happy to be here.', 'Huh. I liked that {piece}.'],
            playerChecks: ['Oh, check! Cool move.', 'Yikes, okay, moving my king.'],
            botChecks: ['Check! Look at me go!'],
            winning: ['Wait, am I winning? Should I be nervous?'],
            losing: ['Still having fun! That\'s what counts.'],
            drawish: ['I\'d honestly be thrilled with a draw.'],
            win: ['I won! Wait until Timothy hears about this. Good game!'],
            loss: ['Good game! Honestly just happy I got to play.'],
            draw: ['A draw! I\'ll take it, happily.'],
            replyHello: ['Hey! Good luck, have fun!'],
            replyGG: ['GG! That was great.'],
            reply: ['Ha! For sure.', 'Totally.']
        }
    },

    kyleMorton: {
        chattiness: 0.75,
        awareness: 0.35,
        lines: {
            greeting: ['Let\'s go! I\'m gonna capture EVERYTHING.', 'Hi! Fair warning: I love taking pieces.'],
            idle: ['Got any pieces you\'re not using? I\'ll take them.', 'So many pieces to capture, so little time.', 'Come on, give me something to grab!'],
            playerHangs: ['OOH, is that {piece} for me?!', 'Is that {piece} on {cell} up for grabs? Don\'t mind if I do!'],
            botBlunder: ['Hey! That was MY {piece}!', 'Wait, you can capture too? Not fair.'],
            brilliantSac: ['You let me take that on purpose?! Sneaky.'],
            playerChecks: ['Hey, my king! Leave him alone.'],
            botChecks: ['Check! Now give me your stuff.'],
            botCaptures: ['Yoink! One {piece}, thank you very much.', 'Got your {piece}! That never gets old.', 'Mine now!'],
            winning: ['Look at this pile of pieces I captured!'],
            losing: ['Okay, maybe I should\'ve looked at the whole board.'],
            drawish: ['There\'s nothing left to capture! Boring.'],
            win: ['Captured my way to victory! Good game!'],
            loss: ['Aw man, I was too busy grabbing pieces. GG!'],
            draw: ['A draw? But I wanted to take more stuff.'],
            replyHello: ['Hi! Hope you like losing pieces!'],
            replyGG: ['GG! Next time I\'m taking your queen.'],
            reply: ['Can\'t talk, looking for captures.', 'Uh-huh. Got any spare knights?']
        }
    },

    hannahLewis: {
        chattiness: 0.75,
        awareness: 0.3,
        lines: {
            greeting: ['Hi! Just so you know, my queen is going to do everything this game.', 'Hello! Ready to meet my queen?'],
            idle: [
                when('hasQueen', 'My queen is getting restless.'),
                when('hasQueen', 'I could move my queen... again...'),
                'Have you noticed how pretty the queen piece is?',
                when('noQueen', 'I keep reaching for my queen. She\'s not there anymore.'),
                when('noQueen', 'This board feels so empty without her.')
            ],
            playerHangs: [
                when('movedQueen', 'Ooh, my queen can reach that {piece}!'),
                when('notMovedQueen', 'Ooh, a free {piece}! Don\'t mind if I do.')
            ],
            botBlunder: [
                when('notLostQueen', 'Wait, not my {piece}! Well, at least it wasn\'t the queen.'),
                when('notLostQueen', 'Hmm, I was looking at my queen and missed that.'),
                when('lostQueen', 'NOT THE QUEEN! Anything but the queen!'),
                when('lostQueen', 'My queen... she was so young.')
            ],
            playerChecks: [
                when('hasQueen', 'Can my queen fix this? My queen can fix this.'),
                when('noQueen', 'If only I still had my queen...')
            ],
            botChecks: [
                when('movedQueen', 'Check! Courtesy of the queen, obviously.'),
                when('notMovedQueen', 'Check! See, the other pieces can do stuff too.')
            ],
            botCaptures: [
                when('movedQueen', 'Another one for the queen\'s collection!'),
                when('notMovedQueen', 'Got one!')
            ],
            botPromotes: [
                when('twoQueens', 'A SECOND QUEEN?! Best day ever!'),
                when('oneQueen', 'MY QUEEN IS BACK!')
            ],
            playerPromotes: ['You got a new queen? We should start a club.'],
            winning: [
                when('hasQueen', 'See? I told you the queen does everything.'),
                when('noQueen', 'Winning without my queen? Who knew!')
            ],
            losing: [
                when('hasQueen', 'My queen is stuck in the corner again, isn\'t she.'),
                when('noQueen', 'This is what happens when you lose your queen.')
            ],
            drawish: [
                when('hasQueen', 'Even my queen can\'t find anything to do now.'),
                when('noQueen', 'Without a queen there\'s not much left to do. Draw?')
            ],
            win: [
                when('hasQueen', 'The queen wins it! Good game!'),
                when('noQueen', 'I won without my queen?! Good game!')
            ],
            loss: ['Good game! My queen will get you next time.'],
            draw: [when('hasQueen', 'A draw. My queen is... fine with it. Probably.'), 'A draw! Good game.'],
            replyHello: [when('hasQueen', 'Hi! The queen says hello too.'), 'Hi! Good luck!'],
            replyGG: ['GG! You played well.'],
            reply: [when('hasQueen', 'Sorry, I was admiring my queen.'), 'Haha, yeah!']
        }
    },

    sarahMitchell: {
        chattiness: 0.9,
        awareness: 0.3,
        lines: {
            greeting: ['Every game starts in the middle of another one, you know.', 'Hello, {name}. The pieces were here before us, and they\'ll be here after.'],
            idle: ['Have you ever noticed the board is mostly empty space? Like a poem with lots of commas.', 'The clock was never the point anyway.', 'Hexagons are just circles that made decisions.', 'I think the rooks know something we don\'t.'],
            playerHangs: ['Your {piece} on {cell} looks like it\'s waiting for something. Maybe me.'],
            botBlunder: ['My {piece} left. Things leave. That\'s how you know they were there.', 'Ah. The {piece} has gone to the box. The box is where pieces dream.'],
            brilliantSac: ['You gave something up to get something more. Very poetic of you.'],
            playerChecks: ['Check. My king has always been a little dramatic.'],
            botChecks: ['Check. Not a threat, more of an invitation.'],
            winning: ['The momentum remembers. I can feel it.'],
            losing: ['Losing is just winning that took the scenic route.'],
            drawish: ['The pieces are tired. I think they want to go home.'],
            win: ['Checkmate. Or perhaps the king simply chose to rest. Good game.'],
            loss: ['You won, and in a way, so did the board. Good game, {name}.'],
            draw: ['A draw. Everyone wins a little, and nobody wins a lot.'],
            replyHello: ['Hello. Or is it goodbye, but early?'],
            replyGG: ['Good game. Every game is good, if you look at it from far away.'],
            reply: ['Mm. That reminds me of a chair I once moved.', 'Yes. Or no. Both, probably.']
        }
    },

    // ---------------- Novice ----------------

    alexHarper: {
        chattiness: 0.7,
        awareness: 0.35,
        lines: {
            greeting: ['Hi {name}! Want to trade some pieces? I love a good trade.', 'Hello! Let\'s swap pieces until there\'s nothing left.'],
            idle: [when('hasBishop', 'I\'d trade my bishop for your pawn right now, honestly.'), 'Everything\'s more fun after a few trades.', 'Got any pieces you\'d like to swap?'],
            playerHangs: ['Is that {piece} a trade offer? I accept!'],
            botBlunder: ['That was... not a great trade for me, was it.', 'Hmm, I don\'t think I got anything back for that {piece}.'],
            playerChecks: ['Check? Can I trade my way out of this?'],
            botChecks: ['Check! Trade you a king move for it.'],
            botCaptures: ['Trade complete!', 'Your {piece} for... well, I\'ll figure out the trade later.'],
            winning: ['Wait, my trades are actually working?'],
            losing: ['Okay, I may have traded a little too enthusiastically.'],
            drawish: ['We\'ve traded almost everything! Isn\'t this great?'],
            win: ['All those trades paid off! Good game!'],
            loss: ['Good game! I should probably count before I trade.'],
            draw: ['A draw: the ultimate even trade.'],
            replyHello: ['Hi! Trade you a hello for a hello.'],
            replyGG: ['GG! Good trades all round. Mostly.'],
            reply: ['Ha, deal!', 'I\'d trade a knight for that comment.']
        }
    },

    priyaNandakumar: {
        chattiness: 0.6,
        awareness: 0.75,
        lines: {
            greeting: ['Hi {name}! I\'ll be watching for free pieces.', 'Hello! Leave anything loose and it\'s mine.'],
            idle: ['I\'m scanning the board for free stuff. Don\'t mind me.', 'Somewhere out there is a piece nobody\'s guarding.'],
            playerHangs: ['Your {piece} on {cell} is free. I saw it from across the room.', 'Free {piece}! Spotted it immediately.'],
            botBlunder: ['Wait, MY {piece} was hanging? I only check yours.', 'I really need to look at my own pieces sometimes.'],
            brilliantSac: ['Okay, that free piece was a trap. Respect.'],
            playerChecks: ['Oh, my king. Right, I have one of those.'],
            botChecks: ['Check!'],
            botCaptures: ['Free {piece}, collected.'],
            winning: ['Collecting free pieces really adds up.'],
            losing: ['I keep watching your pieces and forgetting mine.'],
            drawish: ['Nothing\'s loose anymore. This is a draw, isn\'t it.'],
            win: ['Good game! Thanks for all the free pieces.'],
            loss: ['GG. I definitely didn\'t see my own pieces getting picked off.'],
            draw: ['A draw. Fair enough.'],
            replyHello: ['Hi! Guard your pieces.'],
            replyGG: ['GG!'],
            reply: ['Shh, I\'m hunting for free pieces.', 'Ha, yeah.']
        }
    },

    owenFairbanks: {
        chattiness: 0.65,
        awareness: 0.4,
        lines: {
            greeting: ['Let\'s keep it moving. I don\'t overthink.', 'Hey {name}. Gut feeling says this\'ll be fun.'],
            idle: ['You\'re thinking a lot. I just go with my gut.', 'My gut says you\'re overthinking this.', 'Thinking is overrated. Feeling is underrated.'],
            playerHangs: ['My gut says that {piece} is free. My gut is right about half the time.'],
            botBlunder: ['That was the other half of the time.', 'Gut said it was safe. Gut was wrong.'],
            brilliantSac: ['Huh. You played that from the gut too, didn\'t you? Nice.'],
            playerChecks: ['Check? My gut didn\'t see that coming.'],
            botChecks: ['Check. Felt right.'],
            winning: ['See? Trust the gut.'],
            losing: ['My gut is feeling a little queasy.'],
            drawish: ['Gut says draw.'],
            win: ['Checkmate! Never doubt the gut. GG.'],
            loss: ['GG. Maybe I\'ll try thinking next time.'],
            draw: ['Draw. My gut called it.'],
            replyHello: ['Hey! Let\'s go.'],
            replyGG: ['GG, that was quick and fun.'],
            reply: ['Yep.', 'Gut says I agree.']
        }
    },

    // ---------------- Apprentice ----------------

    derekSanders: {
        chattiness: 0.5,
        awareness: 0.55,
        lines: {
            greeting: ['Hey {name}. I actually look at the board now, so watch out.', 'Hi. I\'ve stopped guessing. Mostly.'],
            idle: ['I\'m looking at the board. Very carefully. One move ahead.', 'Take your time, I\'m still looking.'],
            playerHangs: ['I looked, and your {piece} on {cell} isn\'t protected.'],
            botBlunder: ['I looked one move ahead. That was two moves ahead, wasn\'t it.', 'I didn\'t look far enough. Again.'],
            brilliantSac: ['I looked one move ahead and missed what you were really doing. Nice.'],
            playerChecks: ['Didn\'t look far enough to see that coming.'],
            botChecks: ['Check. I saw that one!'],
            winning: ['Looking at the board really works!'],
            losing: ['Maybe I should look two moves ahead.'],
            drawish: ['I looked, and I think this is a draw.'],
            win: ['Good game! All that looking paid off.'],
            loss: ['GG. I\'ll look further next time.'],
            draw: ['Draw. Fair.'],
            replyHello: ['Hey, good luck.'],
            replyGG: ['GG, well played.'],
            reply: ['Hm, yeah.', 'Hang on, I\'m looking.']
        }
    },

    luciaMoreno: {
        chattiness: 0.7,
        awareness: 0.5,
        lines: {
            greeting: ['Hi {name}! Quick tip: knights belong in the middle. You\'re welcome.', 'Hello! Watch my knights. They\'ll be central, as they should be.'],
            idle: ['A knight on the rim is grim. Even on hexagons.', 'Have you centralised your knights yet? Just asking.', 'The middle of the board is where the magic happens.'],
            playerHangs: ['Your {piece} on {cell} is out of position. And undefended, actually.'],
            botBlunder: ['I was so busy centralising I forgot to defend my {piece}.', when('hasKnight', 'Ugh, my {piece}. At least my knights are central.')],
            brilliantSac: ['Okay, that sacrifice was beautiful. Very central energy.'],
            playerChecks: ['Check! Was that a knight? Tell me it was a knight.'],
            botChecks: ['Check, from the centre. As it should be.'],
            winning: [when('hasKnight', 'Central knights, winning position. Coincidence? No.'), when('noKnight', 'Winning without knights. Still, they belong in the middle.')],
            losing: [when('hasKnight', 'My knights are in the middle and I\'m still losing. Rude.'), when('noKnight', 'This is what happens without knights in the middle.')],
            drawish: [when('hasKnight', 'Even with perfect knights, this looks like a draw.'), 'This looks like a draw to me.'],
            win: ['Checkmate! Knights in the middle, always. Good game!'],
            loss: ['Good game! But seriously, move your knights to the middle.'],
            draw: [when('hasKnight', 'A draw. At least my knights looked great.'), 'A draw. Fair enough.'],
            replyHello: ['Hi! Remember: knights to the centre.'],
            replyGG: ['GG! Good knight work.'],
            reply: ['Agreed. Also, knights go in the middle.', 'Ha!']
        }
    },

    theoLindqvist: {
        chattiness: 0.7,
        awareness: 0.45,
        lines: {
            greeting: ['Hi {name}! Sorry, one sec. Okay, I\'m ready.', 'Hello! I\'ll check every reply this game. Promise.'],
            idle: ['Sorry, did you move? I was looking out the window.', 'Is there a bird outside? I think there\'s a bird.', 'Hm? Oh, still your turn. Cool.'],
            playerHangs: ['Wait, is your {piece} on {cell} just... free? Am I seeing that right?'],
            botBlunder: ['I was going to check that. I got distracted.', 'Hold on, where\'s my {piece}? Oh. Right.'],
            brilliantSac: ['Wait, that was a sacrifice? I thought you were distracted too!'],
            playerChecks: ['Huh? Oh, check. Sorry, I was miles away.'],
            botChecks: ['Check! I think. Let me look again. Yes, check.'],
            winning: ['Ooh, I\'m ahead. Must stay focused. Must... stay...'],
            losing: ['I really should stop looking at the ceiling.'],
            drawish: ['This feels drawish. Also, is it lunchtime?'],
            win: ['I won? I was barely paying attention! Good game!'],
            loss: ['Good game! I was definitely watching. Mostly.'],
            draw: ['A draw. Wait, the game\'s over? Okay!'],
            replyHello: ['Oh! Hi! Sorry, yes, hello.'],
            replyGG: ['GG! Sorry I was so distracted.'],
            reply: ['Sorry, what?', 'Hm? Yes. Totally.']
        }
    },

    // ---------------- Intermediate ----------------

    ninaWhitfield: {
        chattiness: 0.5,
        awareness: 0.65,
        lines: {
            greeting: ['Hi {name}. I think two moves ahead now, so be careful.', 'Hello! I don\'t hang pieces anymore. Mostly.'],
            idle: ['I\'m two moves ahead. Well, I will be once you move.', 'Take your time, I\'m planning.'],
            playerHangs: ['Two moves ahead, I see your {piece} on {cell} undefended.', 'That {piece} isn\'t protected, you know.'],
            botBlunder: ['I don\'t hang pieces anymore... except that one.', 'That was three moves ahead. Not fair.'],
            brilliantSac: ['That sacrifice was deeper than two moves. Well played.'],
            playerChecks: ['Didn\'t see that check coming, honestly.'],
            botChecks: ['Check. Saw that two moves ago.'],
            winning: ['Thinking ahead pays off.'],
            losing: ['I need to start thinking three moves ahead.'],
            drawish: ['I think this is a draw, two moves from now and forever.'],
            win: ['Checkmate. Two moves ahead, just like I said. Good game!'],
            loss: ['Well played. You were clearly more than two moves ahead.'],
            draw: ['A draw. Solid game.'],
            replyHello: ['Hi! Good luck.'],
            replyGG: ['GG, that was a good one.'],
            reply: ['Ha, fair.', 'One sec, thinking.']
        }
    },

    graceOkafor: {
        chattiness: 0.55,
        awareness: 0.6,
        lines: {
            greeting: ['Hello {name}! Three bishops each. Isn\'t this variant lovely?', 'Hi! I hope you like bishops. I really like bishops.'],
            idle: ['A bishop on a long diagonal is a thing of beauty.', 'Quiet positions are the hardest. Take your time.', 'Did you know each bishop stays on one colour forever? Loyal.'],
            playerHangs: [when('movedDiagonal', 'Your {piece} on {cell} was undefended. One of my bishops noticed.'), 'Your {piece} on {cell} was undefended. I\'ll take that.'],
            botBlunder: ['Oh, I misjudged that. Quiet positions get me every time.', when('hasBishop', 'My {piece}! I was admiring my bishops and forgot about it.')],
            brilliantSac: ['That sacrifice was gorgeous. I\'m genuinely impressed.'],
            playerChecks: ['Check. Nicely done.'],
            botChecks: [when('movedDiagonal', 'Check, along the diagonal.'), 'Check.'],
            winning: [when('hasBishop', 'My bishops are really singing now.'), 'Things are going rather well.'],
            losing: ['I may have misread this position. Again.'],
            drawish: ['Hmm, I always misjudge these quiet positions. Might be a draw.'],
            win: [when('hasBishop', 'Checkmate! The bishops send their regards. Good game.'), 'Checkmate! Good game.'],
            loss: ['Good game, {name}. That was well played.'],
            draw: ['A draw. A peaceful ending.'],
            replyHello: ['Hello! Lovely to meet you.'],
            replyGG: ['Good game, thank you!'],
            reply: ['Ha, I like that.', 'Mm, interesting.']
        }
    },

    samuelReyes: {
        chattiness: 0.45,
        awareness: 0.7,
        lines: {
            greeting: ['Hey {name}. Let\'s keep the pieces busy.', 'Hi. I don\'t give things away for free. Usually.'],
            idle: ['Active pieces, happy pieces.', 'Every piece should have a job.'],
            playerHangs: ['Your {piece} on {cell} isn\'t doing anything. And it isn\'t defended.'],
            botBlunder: ['Rarely, I said. Rarely.', 'That {piece} should not have been free.'],
            brilliantSac: ['Good sacrifice. Your pieces got very active.'],
            playerChecks: ['Check. Fair enough.'],
            botChecks: ['Check.'],
            winning: ['My pieces are doing all the work now.'],
            losing: ['My pieces are stuck. Not great.'],
            drawish: ['Nothing left to activate. Draw-ish.'],
            win: ['Checkmate. Active pieces win games. GG.'],
            loss: ['Good game. You kept your pieces busier than mine.'],
            draw: ['Draw. Solid.'],
            replyHello: ['Hey, good luck.'],
            replyGG: ['GG.'],
            reply: ['Yep.', 'Ha.']
        }
    },

    // ---------------- Advanced ----------------

    marcusWebb: {
        chattiness: 0.45,
        awareness: 0.75,
        lines: {
            greeting: ['Hello {name}. The centre is mine this game.', 'Good luck. Whoever controls the middle controls the game.'],
            idle: ['The centre is still up for grabs, you know.', 'Plan carefully. I am.'],
            playerHangs: ['Your {piece} on {cell} was unprotected. I\'ll take it.'],
            botBlunder: ['I didn\'t calculate that line deep enough.', 'Hm. Missed that.'],
            brilliantSac: ['A real sacrifice. I didn\'t see the follow-up. Well played.'],
            playerChecks: ['Check. Noted.'],
            botChecks: ['Check.'],
            winning: ['Central control is paying off.'],
            losing: ['You\'ve taken over the centre. Impressive.'],
            drawish: ['The centre is empty. This looks drawn.'],
            win: ['Checkmate. Good game, {name}.'],
            loss: ['Well played. You out-calculated me.'],
            draw: ['A draw. Hard-fought.'],
            replyHello: ['Hello. Good luck.'],
            replyGG: ['Good game.'],
            reply: ['Indeed.', 'Hm.']
        }
    },

    ingridHalvorsen: {
        chattiness: 0.5,
        awareness: 0.85,
        lines: {
            greeting: ['Hello {name}. I count everything. Every pawn.', 'Good luck. Material is material.'],
            idle: ['I\'m counting. Still counting.', 'Every pawn matters. Every single one.'],
            playerHangs: ['Your {piece} on {cell} is loose. I\'ll be collecting it.', 'That\'s a free {piece}. I don\'t leave those lying around.'],
            botBlunder: ['I miscounted. That doesn\'t happen often.', 'My {piece}. That\'s a material deficit I don\'t like.'],
            brilliantSac: ['You gave up material and got more back. I respect the arithmetic.'],
            playerChecks: ['Check. It doesn\'t change the material count.'],
            botChecks: ['Check.'],
            botCaptures: ['Thank you for the {piece}.', 'Material is material.'],
            winning: ['I\'m up material. I intend to stay that way.'],
            losing: ['I\'m down material. Unacceptable.'],
            drawish: ['Material is level and nothing\'s happening. A draw, probably.'],
            win: ['Checkmate. The numbers added up. Good game.'],
            loss: ['Well played. You counted better than I did.'],
            draw: ['A draw. The material agreed.'],
            replyHello: ['Hello. Good luck.'],
            replyGG: ['Good game.'],
            reply: ['Hm.', 'Noted.']
        }
    },

    rafaelCosta: {
        chattiness: 0.4,
        awareness: 0.8,
        lines: {
            greeting: ['Hello, {name}. Let\'s see how much space you give me.', 'Good luck. I\'m a patient player.'],
            idle: ['No hurry. I\'m very comfortable waiting.', 'Feeling a little cramped yet?'],
            playerHangs: ['Your {piece} on {cell} has nowhere to go and no one guarding it.'],
            botBlunder: ['Hm. I loosened my grip. Careless.', 'You found a gap. Well spotted.'],
            brilliantSac: ['You broke out with a sacrifice. That was the right idea.'],
            playerChecks: ['A check. Breathing room, at last.'],
            botChecks: ['Check. The squeeze continues.'],
            winning: ['You\'re running out of moves, I think.'],
            losing: ['You\'ve broken my bind. Well done.'],
            drawish: ['Nothing left to squeeze. This is a draw.'],
            win: ['Checkmate. Eventually, everyone cracks. Good game.'],
            loss: ['Well played. You didn\'t crack.'],
            draw: ['A draw. You held firm.'],
            replyHello: ['Hello. Good luck to you.'],
            replyGG: ['Good game.'],
            reply: ['Mm.', 'Patience.']
        }
    },

    // ---------------- Expert ----------------

    elenaVoss: {
        chattiness: 0.4,
        awareness: 0.9,
        lines: {
            greeting: ['Hello {name}. Leave nothing undefended.', 'Good luck. I\'ll be calculating.'],
            idle: ['Calculate carefully. I already have.', 'There are three good moves here. Find one.'],
            playerHangs: ['The {piece} on {cell} is undefended. That will cost you.', 'You left your {piece} hanging. I noticed.'],
            botBlunder: ['A miscalculation. I\'ll be more careful.', 'Hm. You found that. Good.'],
            brilliantSac: ['A genuine sacrifice. That was well calculated.'],
            playerChecks: ['Check. I saw it coming.'],
            botChecks: ['Check.'],
            winning: ['Your position is becoming difficult.'],
            losing: ['You\'re outplaying me. I don\'t say that often.'],
            drawish: ['The position is dead level. A draw is the honest result.'],
            win: ['Checkmate. Good game, {name}.'],
            loss: ['Very well played. You earned that.'],
            draw: ['A draw. Precise play on both sides.'],
            replyHello: ['Hello. Good luck.'],
            replyGG: ['Good game. Well played.'],
            reply: ['Focus.', 'Hm.']
        }
    },

    yukiTanaka: {
        chattiness: 0.35,
        awareness: 0.85,
        lines: {
            greeting: ['Hello, {name}. Let\'s play carefully.', 'Good luck. Take all the time you need.'],
            idle: ['Patience is a move too.', 'There is no hurry.'],
            playerHangs: ['Your {piece} on {cell} was unprotected. I\'m sorry.'],
            botBlunder: ['A small oversight. It happens.', 'I see. Well spotted.'],
            brilliantSac: ['A brave sacrifice, and a correct one. Well played.'],
            playerChecks: ['Check. My king is safe enough.'],
            botChecks: ['Check.'],
            winning: ['You overreached, I think.'],
            losing: ['You have played very well.'],
            drawish: ['A balanced position. A draw seems fair.'],
            win: ['Checkmate. Thank you for the game.'],
            loss: ['Well played. Thank you for the game.'],
            draw: ['A draw. A good, solid game.'],
            replyHello: ['Hello. Thank you for playing.'],
            replyGG: ['Thank you. Good game.'],
            reply: ['Mm.', 'Perhaps.']
        }
    },

    antonVarga: {
        chattiness: 0.55,
        awareness: 0.9,
        lines: {
            greeting: ['{name}! I hope you defended your wings.', 'Good luck. I attack. It\'s what I do.'],
            idle: ['I can smell an attack coming.', 'Your king looks a bit draughty over there.'],
            playerHangs: ['Your {piece} on {cell} is hanging. My attack thanks you.'],
            botBlunder: ['Ah, I was so focused on the attack I forgot to defend.', 'Hm. That\'s the price of attacking.'],
            brilliantSac: ['That\'s MY kind of move! Brilliant sacrifice.'],
            playerChecks: ['Check? You attack too? I like it.'],
            botChecks: ['Check! The attack begins.', 'Check! Run, little king.'],
            winning: ['The attack is crashing through!'],
            losing: ['My attack fizzled. That rarely happens.'],
            drawish: ['No attacks left. How dull. Draw.'],
            win: ['Checkmate! What an attack. Good game, {name}!'],
            loss: ['Well played! You defended like a fortress.'],
            draw: ['A draw. My attack deserved better!'],
            replyHello: ['Hello! Ready to defend?'],
            replyGG: ['GG! Sharp game.'],
            reply: ['Ha! Later, I\'m attacking.', 'Sure, sure.']
        }
    },

    // ---------------- Master ----------------

    victorKane: {
        chattiness: 0.3,
        awareness: 1,
        lines: {
            greeting: ['Good evening, {name}. Bring your best game.', 'Let\'s begin.'],
            idle: ['Take your time. You\'ll need it.', 'I already know my reply.'],
            playerHangs: ['The {piece} on {cell}. I assume that\'s deliberate.', 'Your {piece} is unguarded. Interesting.'],
            botBlunder: ['Well found.', 'Hm. I underestimated you.'],
            brilliantSac: ['A sound sacrifice. I didn\'t expect that from you.'],
            playerChecks: ['Check. It changes nothing.'],
            botChecks: ['Check.'],
            winning: ['This is over, I think.'],
            losing: ['You\'re playing very well.'],
            drawish: ['The position is drawn. You defended well.'],
            win: ['Checkmate. You played better than most.'],
            loss: ['Well played. That doesn\'t happen often.'],
            draw: ['A draw. Respectable.'],
            replyHello: ['Good luck.'],
            replyGG: ['Good game.'],
            reply: ['Focus on the board.', '...']
        }
    },

    isadoraQuinn: {
        chattiness: 0.35,
        awareness: 1,
        lines: {
            greeting: ['Hello, {name}. Every piece has a job. Let\'s see yours.', 'Good luck. I\'ll be watching the whole board.'],
            idle: ['Every piece on the board is telling a story right now.', when('oppHasRook', 'Your rooks seem unemployed.')],
            playerHangs: ['Your {piece} on {cell} has lost its job. And its protection.'],
            botBlunder: ['A rare oversight. Well taken.', 'You saw something I didn\'t. Noted.'],
            brilliantSac: ['A beautiful sacrifice. Every piece did its job there.'],
            playerChecks: ['Check. Anticipated.'],
            botChecks: ['Check.'],
            winning: ['All my pieces are working. Yours are not.'],
            losing: ['You\'ve coordinated beautifully.'],
            drawish: ['Nothing left for anyone to do. A draw.'],
            win: ['Checkmate. Every piece did its job. Good game.'],
            loss: ['Wonderful game. You earned it.'],
            draw: ['A draw. Balanced to the end.'],
            replyHello: ['Hello. Good luck.'],
            replyGG: ['Good game.'],
            reply: ['Mm.', 'Watch the board.']
        }
    },

    corneliusAshby: {
        chattiness: 0.45,
        awareness: 1,
        lines: {
            greeting: ['Ah, a challenger. Do pour yourself some tea, {name}. This may take a while.', 'Good afternoon. I haven\'t lost here in quite some time.'],
            idle: ['Do take your time. I\'ll just sip my tea.', 'In my day, we thought for hours. Hours!', 'Splendid board, isn\'t it?'],
            playerHangs: ['Your {piece} on {cell} appears to have wandered off unguarded, my friend.', 'Oh dear. That {piece} on {cell} is rather exposed.'],
            botBlunder: ['Goodness. I seem to have mislaid a {piece}.', 'Well spotted! I must be getting old.'],
            brilliantSac: ['Oh, splendid sacrifice! Quite brilliant. I\'m delighted.'],
            playerChecks: ['A check! How bold.'],
            botChecks: ['Check, I\'m afraid.'],
            winning: ['I\'m afraid things are looking rather grim for you.'],
            losing: ['My word. You may be the one to end my streak.'],
            drawish: ['I believe this is a draw, and a very honourable one.'],
            win: ['Checkmate, I\'m afraid. A fine effort, {name}. Do come back.'],
            loss: ['Extraordinary! You\'ve beaten me. Very well played indeed.'],
            draw: ['A draw! Very few manage that. Well done.'],
            replyHello: ['Hello there! Delighted to play you.'],
            replyGG: ['A fine game. Thank you.'],
            reply: ['Quite so.', 'Ha! Indeed.']
        }
    }
}

const getPersonality = botId => {
    const bot = BOTS[botId] || {}
    return {
        chattiness: bot.chattiness ?? DEFAULT.chattiness,
        awareness: bot.awareness ?? DEFAULT.awareness,
        lines: { ...DEFAULT.lines, ...bot.lines }
    }
}

module.exports = { getPersonality, BOTS, DEFAULT }
