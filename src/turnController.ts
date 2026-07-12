import { createGame, endTurn, enemyTurn, type GameState } from './sim/game'

export type Scheduler = (callback: () => void, delay: number) => number
export type Canceller = (handle: number) => void

export class TurnController {
  private pending?: number

  constructor(
    private state: GameState,
    private readonly render: (state: GameState) => void,
    private readonly schedule: Scheduler = window.setTimeout.bind(window),
    private readonly cancel: Canceller = window.clearTimeout.bind(window),
  ) {}

  get current(): GameState { return this.state }

  replace(state: GameState): void {
    this.state = state
    this.render(state)
  }

  end(): void {
    const next = endTurn(this.state)
    if (next === this.state || this.pending !== undefined) return
    this.state = next
    this.render(this.state)
    this.pending = this.schedule(() => {
      this.pending = undefined
      this.state = enemyTurn(this.state)
      this.render(this.state)
    }, 650)
  }

  restart(): void {
    if (this.pending !== undefined) this.cancel(this.pending)
    this.pending = undefined
    this.state = createGame(this.state.mission)
    this.render(this.state)
  }
}
