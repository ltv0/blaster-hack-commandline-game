import './style.css'
import { startGameApp } from './game/game'

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <div class="shell">
    <div class="shell-header">umbrella-run.exe</div>
    <div class="shell-body">
      <div id="terminal" class="terminal">
        <p>> booting umbrella-run...</p>
        <p>> drag umbrella to protect runner</p>
        <p>> press ENTER to start</p>
      </div>
      <canvas id="game" width="960" height="540"></canvas>
    </div>
  </div>
`

startGameApp()