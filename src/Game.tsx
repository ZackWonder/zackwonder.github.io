import { useState, useEffect, useCallback } from 'react'
import constants, { type Player } from './constants'
import './App.css'
import Board from './Board'
import PlayAffect from './effect'

type Point = [number, number]
type Winner = Player | 3

function playWinSound(winner: Winner) {
  const soundMap: Record<number, string> = {
    [constants.PLAYER_A]: './tansonwin.mp3',
    [constants.PLAYER_B]: './sherlywin.mp3',
    3: './allwin.mp3',
  }
  const url = soundMap[winner]
  if (url) {
    const audio = new Audio(url)
    audio.volume = 0.25
    audio.play().catch(() => {})
  }
}

function Crown({
  value,
  handlePlayAgain,
}: {
  value: Winner | undefined
  handlePlayAgain: () => void
}) {
  useEffect(() => {
    if (value) {
      const btn = document.querySelector('.crownSpan')
      if (btn instanceof HTMLElement) {
        PlayAffect(btn)
      }
    }
  }, [value])

  if (!value) return null

  if (value !== 3) {
    const cn =
      value === constants.PLAYER_A ? 'playerA crown' : 'playerB crown'
    return (
      <div className="crownDiv">
        <span className="crownSpan">
          <button className={cn}></button>
        </span>
        <br />
        贏了！
        <br />
        <button id="playAgainBtn" onClick={handlePlayAgain}>
          再玩一次
        </button>
        <hr />
      </div>
    )
  }

  return (
    <div className="crownDiv">
      <span className="crownSpan">
        <button className="playerA crown"></button>
        <button className="playerB crown"></button>
      </span>
      <br />
      <button id="playAgainBtn" onClick={handlePlayAgain}>
        再玩一次
      </button>
      <hr />
    </div>
  )
}

function createEmptyBoard(): (Player | undefined)[][] {
  return Array.from({ length: constants.WIDTH }, () =>
    new Array<Player | undefined>(constants.HEIGHT).fill(undefined)
  )
}

function drop(player: Player, col: (Player | undefined)[]): number | undefined {
  for (let i = 0; i < col.length; i++) {
    if (col[i] === undefined) {
      col[i] = player
      return i
    }
  }
  return undefined
}

function linePoints(
  square: (Player | undefined)[][],
  x1: number,
  y1: number,
  dx: number,
  dy: number
): Point[] {
  const points: Point[] = [[x1, y1]]
  const v = square[x1]![y1]
  for (
    let i = x1 + dx, j = y1 + dy;
    i < constants.WIDTH && i >= 0 && j < constants.HEIGHT && j >= 0;
    i += dx, j += dy
  ) {
    if (square[i]![j] === v) {
      points.push([i, j])
    } else {
      break
    }
  }
  for (
    let i = x1 - dx, j = y1 - dy;
    i < constants.WIDTH && i >= 0 && j < constants.HEIGHT && j >= 0;
    i -= dx, j -= dy
  ) {
    if (square[i]![j] === v) {
      points.push([i, j])
    } else {
      break
    }
  }
  return points
}

function isLine4(
  square: (Player | undefined)[][],
  x1: number,
  y1: number
): Point[] | undefined {
  const directions: [number, number][] = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ]
  for (const [dx, dy] of directions) {
    const points = linePoints(square, x1, y1, dx, dy)
    if (points.length >= 4) return points
  }
  return undefined
}

export default function GameApp() {
  const [squares, setSquares] = useState(createEmptyBoard)
  const [history, setHistory] = useState<Point[]>([])
  const [aTurn, setATurn] = useState(true)
  const [aIsStarter, setAIsStarter] = useState(true)
  const [winner, setWinner] = useState<Winner | undefined>(undefined)
  const [winPoints, setWinPoints] = useState<Point[] | undefined>(undefined)
  const [droppingCell, setDroppingCell] = useState<Point | null>(null)

  const handlePlayAgain = useCallback(() => {
    setSquares(createEmptyBoard())
    setHistory([])
    setATurn(!aIsStarter)
    setAIsStarter((prev) => !prev)
    setWinner(undefined)
    setWinPoints(undefined)
    setDroppingCell(null)
  }, [aIsStarter])

  const handleClick = useCallback(
    (i: number, _j: number) => {
      if (winner !== undefined || squares[i]![constants.HEIGHT - 1] !== undefined) {
        return
      }

      const newSquares = squares.map((col) => [...col])
      const droppedJ = drop(
        aTurn ? constants.PLAYER_A : constants.PLAYER_B,
        newSquares[i]!
      )

      if (droppedJ !== undefined) {
        const newHistory = [...history, [i, droppedJ] as Point]
        let newWinner: Winner | undefined = undefined
        const newWinPoints = isLine4(newSquares, i, droppedJ)
        if (newWinPoints) {
          newWinner = aTurn ? constants.PLAYER_A : constants.PLAYER_B
        } else if (
          newSquares.every((col) => col[constants.HEIGHT - 1] !== undefined)
        ) {
          newWinner = 3
        }

        if (newWinner !== undefined) {
          playWinSound(newWinner)
        }

        setDroppingCell([i, droppedJ])
        setTimeout(() => setDroppingCell(null), 400)

        setSquares(newSquares)
        setHistory(newHistory)
        setATurn(!aTurn)
        setWinner(newWinner)
        setWinPoints(newWinPoints ?? undefined)
      }
    },
    [squares, history, aTurn, winner]
  )

  const handleUndo = useCallback(() => {
    if (history.length === 0) return
    const last = history[history.length - 1]!
    const newSquares = squares.map((col) => [...col])
    newSquares[last[0]]![last[1]] = undefined
    setSquares(newSquares)
    setHistory(history.slice(0, -1))
    setATurn(!aTurn)
  }, [squares, history, aTurn])

  const lastStep = history.length > 0 ? history[history.length - 1] : undefined

  return (
    <div className="App">
      <header className="App-header">
        <Crown value={winner} handlePlayAgain={handlePlayAgain} />
        <Board
          w={constants.WIDTH}
          h={constants.HEIGHT}
          squares={squares}
          lastStep={lastStep}
          droppingCell={droppingCell}
          aTurn={aTurn}
          winPoints={winPoints}
          onClick={handleClick}
        />
        <hr />
        {!winner && <button onClick={handleUndo}>悔棋</button>}
      </header>
    </div>
  )
}
