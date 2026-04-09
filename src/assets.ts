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
