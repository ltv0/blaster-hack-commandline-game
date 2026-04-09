export type CloudDesignType = 'rain' | 'snow' | 'hail' | 'purpleRain'
export type HazardDesignType = 'rain' | 'snow' | 'hail'

export const CAT_GLYPH = 'C\nA\nT'
export const DOG_GLYPH = 'D\nO\nG'

export const HAZARD_GLYPHS: Record<HazardDesignType, string[]> = {
  rain: ['|', 'I', '╎', '╏', '¦', CAT_GLYPH, DOG_GLYPH],
  snow: ['*', '❄', '∗', '✦', '⁎'],
  hail: ['◆', '●', '■', '◉', '◈'],
}

export const CLOUD_CHARSET = ' .,-:;=+*#%R'
export const CLOUD_DECORATION_CHARS = '.,:+*#@'
export const CLOUD_CHARSETS: Record<CloudDesignType, string> = {
  rain: CLOUD_CHARSET,
  snow: ' .,-:;=+*#%S',
  hail: ' .,-:;=+*#%H',
  purpleRain: ' .,-:;=+*#%P',
}

export const TRAVELER_HEADS = ['(^o^)'] as const
export const TRAVELER_JUMP_HEAD = '(>o<)'
export const TRAVELER_LEGS_IDLE = ['/  \\', '/  \\'] as const
export const TRAVELER_LEGS_WALK = ['/  \\', ' |/ ', '/  \\', ' \\| '] as const
export const TRAVELER_LEGS_RUN = ['/  \\', ' |/ ', '/  \\', ' \\| '] as const
export const TRAVELER_ARMS_ASCENDING = '\\| |/'
export const TRAVELER_ARMS_DESCENDING = '/| |\\'
export const TRAVELER_LEGS_ASCENDING = '^ ^'
export const TRAVELER_LEGS_DESCENDING = 'v v'
export const TRAVELER_ARMS_LEFT = '-| |>'
export const TRAVELER_ARMS_RIGHT = '<| |-'
export const TRAVELER_ARMS_IDLE = '/| |\\'

export type TravelerSprite = {
  name: string
  heads: readonly string[]
  jumpHead: string
  legsIdle: readonly string[]
  legsWalk: readonly string[]
  legsRun: readonly string[]
  armsAscending: string
  armsDescending: string
  legsAscending: string
  legsDescending: string
  armsLeft: string
  armsRight: string
  armsIdle: string
}

export const TRAVELER_SPRITES: readonly TravelerSprite[] = [
  {
    name: 'Classic',
    heads: TRAVELER_HEADS,
    jumpHead: TRAVELER_JUMP_HEAD,
    legsIdle: TRAVELER_LEGS_IDLE,
    legsWalk: TRAVELER_LEGS_WALK,
    legsRun: TRAVELER_LEGS_RUN,
    armsAscending: TRAVELER_ARMS_ASCENDING,
    armsDescending: TRAVELER_ARMS_DESCENDING,
    legsAscending: TRAVELER_LEGS_ASCENDING,
    legsDescending: TRAVELER_LEGS_DESCENDING,
    armsLeft: TRAVELER_ARMS_LEFT,
    armsRight: TRAVELER_ARMS_RIGHT,
    armsIdle: TRAVELER_ARMS_IDLE,
  },
  {
    name: 'Circuit',
    heads: ['[o_o]'],
    jumpHead: '[O_O]',
    legsIdle: ['|  |', '|  |'],
    legsWalk: ['|  |', ' /\\ ', '|  |', ' \\/ '],
    legsRun: ['|  |', ' /\\ ', '|  |', ' \\/ '],
    armsAscending: '\\= =/',
    armsDescending: '/= =\\',
    legsAscending: '^ ^',
    legsDescending: 'v v',
    armsLeft: '-= =|',
    armsRight: '|= =-',
    armsIdle: '/= =\\',
  },
  {
    name: 'Specter',
    heads: ['(o_o)'],
    jumpHead: '(O_O)',
    legsIdle: ['/  \\', '/  \\'],
    legsWalk: ['/~~\\', ' || ', '/~~\\', ' || '],
    legsRun: ['/~~\\', ' || ', '/~~\\', ' || '],
    armsAscending: '\\~ ~/',
    armsDescending: '/~ ~\\',
    legsAscending: '^ ^',
    legsDescending: 'v v',
    armsLeft: '-~ ~>',
    armsRight: '<~ ~-',
    armsIdle: '/~ ~\\',
  },
] as const

export const UMBRELLA_CANOPY = [
  "           ___.----' `----.___",
  "       _.-'   .-'  .  `   -   `-._",
  "    .-'    .'           \\   `-    `-.",
  "  .'              J            `.    `.",
  " /___    /                L      `  .--`.",
  "'    `-.  _.---._ |_.---._ .--\"\"\"-.'",
] as const

export const UMBRELLA_HANDLE_LINES = 8
export const UMBRELLA_FOOT = ['A', 'U', '      LV   ET', '     RC=HP'] as const
