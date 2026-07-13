// English source bundle. Single source of truth for translation keys — every
// new player-facing string gets a key here first; the per-language files in
// this folder mirror the shape. Vite ships each non-English locale as its own
// lazy chunk (see `src/i18n/index.ts`).
export default {
  'gameName': 'Cookie Watch',
  'cancel': 'Cancel',
  'close': 'Close',
  'ok': 'Ok',
  'continue': 'Continue',
  'tapToContinue': 'Tap to continue',
  'clickToContinue': 'Click to continue',
  'stage': 'Kitchen',
  'rewards': 'REWARDS',
  'tip': 'Tip',
  'crazyGamesOnly': 'This game is only available on',
  'startTouch': 'Tap to Start',
  'startDesktop': 'Click to Start',
  'startSubhint': 'Hold a side to sneak, let go to play dead. Hold into the cookie to harvest chunks, carry them home — and FREEZE when the cat wakes!',
  'hints': {
    'tapToMove': 'Hold a side to sneak — double-tap to dash, let go to play dead',
    'keysToMove': 'Hold ◀ ▶ to sneak — double-tap to dash, let go to play dead',
    'freeze': 'Freeze! Don\'t move!',
    'run': 'Run! Don\'t stop!'
  },
  'tutorial': {
    'harvestTouch': 'Hold right at the cookie to harvest',
    'harvestDesktop': 'Hold ▶ at the cookie to harvest',
    'playDeadTouch': 'Let go to play dead',
    'playDeadDesktop': 'Let go to play dead',
    'avoidCat': 'Don’t let the cat catch you'
  },
  'cat': {
    'asleep': 'Asleep',
    'awake': 'Awake'
  },
  'frenzy': {
    'title': 'Eating Frenzy!',
    'sub': 'Devour the whole dessert before time runs out!',
    'tap': 'Tap! Tap! Tap!',
    'click': 'Click! Click! Click!',
    'chokeHint': 'Pace yourself — mash too fast and you’ll choke!',
    'choking': 'Choking!'
  },
  'review': {
    'title': 'Level Review',
    'delivery': 'Delivery',
    'greedy': 'Greedy Bonus',
    'closeCall': 'Close Call',
    'insaneEscape': 'Insane Escape',
    'daringTotal': 'Daring Total',
    'pass': 'Stage Clear',
    'perfectClear': 'Perfect Clear!',
    'goldClear': 'Gold Clear!',
    'toFrenzy': 'Eat the Cookie!'
  },
  'secondChance': {
    'title': 'One more chance?',
    'body': 'Watch a short ad to slip away and keep your haul.',
    'watch': 'Watch & Escape',
    'skip': 'Give up'
  },
  'result': {
    'win': 'STAGE CLEAR!',
    'lose': 'CAUGHT!',
    'caught': 'The cat’s laser vaporized you!',
    'timeout': 'Out of time — you didn’t steal enough!',
    'outOfLives': 'Out of lives — back to the first kitchen.',
    'daring': 'Daring Total',
    'scoreLost': 'Score lost',
    'double': 'Double coins',
    'firstRunDouble': '2× — first run today!',
    'retry': 'Retry'
  },
  'ads': {
    'watch': 'Watch',
    'revive': 'Escape',
    'secondChance': 'Second Chance',
    'doubleCoins': '2× Coins',
    'plusCoins': '+{n} coins'
  },
  'achievements': {
    'title': 'Achievements',
    'subtitle': 'Hit lifetime milestones to earn coins.',
    'claim': 'Claim',
    'claimed': 'Claimed',
    'progress': '{c} / {t}',
    'items': {
      'tiles1k': { 'name': 'Crumb Collector', 'desc': 'Score 10,000 points in total.' },
      'tiles5k': { 'name': 'Cookie Burglar', 'desc': 'Score 50,000 points in total.' },
      'tiles10k': { 'name': 'Master Thief', 'desc': 'Score 100,000 points in total.' },
      'tiles100k': { 'name': 'Legend of the Larder', 'desc': 'Score 1,000,000 points in total.' },
      'stage5': { 'name': 'Getting Sneaky', 'desc': 'Reach kitchen 5.' },
      'stage10': { 'name': 'Whisker Whisperer', 'desc': 'Reach kitchen 10.' },
      'stage20': { 'name': 'Ghost Mouse', 'desc': 'Reach kitchen 20.' },
      'clears25': { 'name': 'Cookie Run', 'desc': 'Clear 25 kitchens in total.' },
      'clears100': { 'name': 'Pantry Plunderer', 'desc': 'Clear 100 kitchens in total.' },
      'bestRun100': { 'name': 'Big Haul', 'desc': 'Score 5,000 in a single kitchen.' },
      'bestRun250': { 'name': 'Daring Raid', 'desc': 'Score 15,000 in a single kitchen.' },
      'coins5k': { 'name': 'Coin Nibbler', 'desc': 'Collect 5,000 coins in total.' },
      'coins50k': { 'name': 'Coin Hoarder', 'desc': 'Collect 50,000 coins in total.' },
      'items50': { 'name': 'Chunk Chomper', 'desc': 'Deposit 50 cookie chunks in total.' },
      'items250': { 'name': 'Crumb King', 'desc': 'Deposit 250 cookie chunks in total.' }
    }
  },
  'missions': {
    'title': 'Daily Missions',
    'subtitle': 'Complete goals each day for coins.',
    'claim': 'Claim',
    'done': 'Claimed',
    'types': {
      'coins': 'Collect {n} coins today',
      'tiles': 'Score {n} in one kitchen',
      'items': 'Deposit {n} cookie chunks today',
      'clears': 'Clear {n} kitchens today'
    }
  },
  'boon': {
    'title': 'Choose a boon',
    'names': {
      'secondChance': 'Second Chance',
      'startPowerup': 'Calm Start',
      'coinBoost': 'Coin Rush'
    },
    'descriptions': {
      'secondChance': 'Begin the next kitchen with a Second Chance escape.',
      'startPowerup': 'Begin the next kitchen with the cat extra-sleepy.',
      'coinBoost': '1.2× coins for the whole next kitchen.'
    }
  },
  'upgrades': {
    'title': 'Mouse Upgrades',
    'subtitle': 'Spend coins to become a stealthier thief.',
    'level': 'Lv.{n}',
    'maxedOut': 'MAXED',
    'sellBack': 'Sell +{n}',
    'spotlight': 'Spend!',
    'unlocksAtStage': '🔒 Kitchen {n}',
    'names': {
      'calmNerves': 'Calm Nerves',
      'lightPaws': 'Light Paws',
      'extraTime': 'Night Owl',
      'deepHole': 'Cozy Burrow',
      'sixthSense': 'Sixth Sense'
    },
    'descriptions': {
      'calmNerves': 'A longer grace buffer to freeze after the cat wakes (+0.05s per level).',
      'lightPaws': 'The cat sleeps longer — a longer green light (+4% per level).',
      'extraTime': 'Start every kitchen with more time (+5s per level).',
      'deepHole': 'Your haul drops down the mouse hole faster (+12% per level).',
      'sixthSense': 'The laser takes longer to charge, so you get longer to dodge (+0.15s per level).'
    },
    'secondChance': {
      'name': 'Second Chance',
      'description': 'Start each run ready to slip away once — survive one pounce or trap. Active until used.',
      'active': 'ACTIVE',
      'watch': 'Free'
    }
  },
  'battlePass': {
    'title': 'Cookie Pass',
    'progress': '{current} / {total}',
    'daysLeft': '{n}d left',
    'maxed': 'COOKIE PASS COMPLETE',
    'xpProgress': '{current} / {total} XP',
    'howToEarn': 'How to earn XP',
    'perAttempt': 'per run',
    'perStageFinish': 'per kitchen cleared',
    'unlockHint': 'Reach {n} XP to unlock the next reward — unclaimed rewards stay until you tap them.'
  },
  'dailyRewards': {
    'title': 'Daily Rewards',
    'subtitle': 'Sign in every day to keep your streak.',
    'day': 'Day {n}',
    'dayShort': 'D{n}'
  },
  'skins': {
    'title': 'Mouse Skins',
    'subtitle': 'Spend coins to unlock and equip new looks.',
    'equip': 'Equip',
    'equipped': 'Equipped',
    'locked': 'Kitchen {n}',
    'new': 'New!',
    'rarity': {
      'common': 'Common',
      'rare': 'Rare',
      'epic': 'Epic'
    }
  },
  'options': {
    'title': 'Options',
    'general': 'General',
    'audio': 'Audio',
    'language': 'Language',
    'difficulty': 'Difficulty',
    'soundEffects': 'Sound Effects',
    'music': 'Music',
    'musicTrack': 'Music Track',
    'musicTracks': {
      'cozy': 'Cozy Kitchen',
      'trance': 'Midnight Sneak'
    },
    'close': 'Save & Close',
    'difficulties': {
      'easy': 'Easy',
      'medium': 'Medium',
      'hard': 'Hard'
    },
    'difficultyHints': {
      'easy': 'The cat sleeps deeper — more room for mistakes.',
      'medium': 'The standard, balanced cat nap.',
      'hard': 'A light sleeper — tighter, more precise sneaking.'
    }
  },
  'adsBlocked': {
    'title': "Couldn't show ad",
    'body': 'We tried to show you a video so you could earn your reward, but something on your browser is blocking ads.',
    'allowPrefix': 'Please allow ads on',
    'allowSuffix': '(or pause your ad-blocker for this game) and try again.',
    'gotIt': 'Got it'
  },
  'saveStatus': {
    'restoredTitle': 'Cloud save restored',
    'restoredBody': '+{n} bonus coins for the recovery',
    'tap': 'tap',
    'pausedTitle': 'Cloud sync paused',
    'pausedBody': 'Playing offline. Your progress is saved here.',
    'retry': 'Retry',
    'dismiss': 'dismiss'
  },
  'loading': {
    'tooLong': 'Loading taking too long? Try disabling your ad blocker and refresh.'
  },
  'license': {
    'denied': 'Access Denied: Please purchase a license.'
  }
}
