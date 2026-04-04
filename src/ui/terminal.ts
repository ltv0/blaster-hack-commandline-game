export class TerminalInput {
  private root: HTMLDivElement
  private input = ''
  private lines: string[] = [
    '> booting umbrella-run...',
    '> type run and press ENTER',
  ]
  private onCommand: (value: string) => void

  constructor(root: HTMLDivElement, onCommand: (value: string) => void) {
    this.root = root
    this.onCommand = onCommand
    this.render()
  }

  attach() {
    window.addEventListener('keydown', this.handleKeyDown)
  }

  print(line: string) {
    this.lines.push(line)
    this.render()
  }

  clear() {
    this.lines = []
    this.render()
  }

  private handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Backspace') {
      this.input = this.input.slice(0, -1)
      this.render()
      return
    }

    if (event.key === 'Enter') {
      const value = this.input.trim()
      this.lines.push(`> ${this.input}`)
      this.input = ''
      this.render()
      this.onCommand(value)
      return
    }

    if (event.key.length === 1) {
      this.input += event.key
      this.render()
    }
  }

  private render() {
    const allLines = [...this.lines, `> ${this.input}_`]
    this.root.innerHTML = allLines
      .map((line) => `<p>${escapeHtml(line)}</p>`)
      .join('')
  }
}

function escapeHtml(value: string) {
  return value
    .split('&').join('&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;')
}