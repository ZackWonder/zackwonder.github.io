import constants from "./constants.js";
import "./App.css";
import Board from "./Board.js";
import PlayAffect from "./effect.js";
import React, { useEffect } from "react";
import useSound from "use-sound";

function Crown(props) {
  let cn = "";
  if (props.value !== undefined) {
    if (props.value === constants.PLAYER_A) {
      cn += "playerA crown";
    } else {
      cn += "playerB crown";
    }
  }

  const [playTansonWin] = useSound("./tansonwin.mp3", { volume: 0.25 });
  const [playSherlyWin] = useSound("./sherlywin.mp3", { volume: 0.25 });
  const [playAllWin] = useSound("./allwin.mp3", { volume: 0.25 });
  useEffect(() => {
    if (props.value) {
      let winSound = "";
      switch (props.value) {
        case constants.PLAYER_A: playTansonWin();
          break;
        case constants.PLAYER_B: playSherlyWin();
          break;
        default: playAllWin();
          break;
      }
      var btn = document.querySelector(".crownSpan");

      PlayAffect(btn);
    }
    return () => {};
  });
  if (!props.value) {
    return null;
  }

  if (props.value !== 3) {
    return (
      <div className="crownDiv">
        <span className="crownSpan">
          <button className={cn}></button>
        </span>
        <br />
        贏了！
        <br />
        <button id="playAgainBtn" onClick={props.handlePlayAgain}>
          再玩一次
        </button>
        <hr />
      </div>
    );
  } else {
    return (
      <div className="crownDiv">
        <span className="crownSpan">
          <button className="playerA crown"></button>
          <button className="playerB crown"></button>
        </span>
        <br />
        <button id="playAgainBtn" onClick={props.handlePlayAgain}>
          再玩一次
        </button>
        <hr />
      </div>
    );
  }
}

class App extends React.Component {
  constructor(props) {
    super(props);
    let arr = new Array(constants.WIDTH);
    for (var i = 0; i < arr.length; i++) {
      arr[i] = new Array(constants.HEIGHT);
    }

    this.state = {
      history: [],
      squares: arr,
      aTurn: true,
      aIsStarter: true,
      winner: undefined,
      winPoints: undefined,
    };
  }

  handlePlayAgain() {
    let squares = this.state.squares;
    for (let i = 0; i < squares.length; i++) {
      let rol = squares[i];
      for (let j = 0; j < rol.length; j++) {
        squares[i][j] = undefined;
      }
    }
    const aIsStarter = this.state.aIsStarter;
    this.setState({
      history: [],
      squares: squares,
      aTurn: !aIsStarter,
      aIsStarter: !aIsStarter,
      winner: undefined,
      winPoints: undefined,
    });
  }

  handleClick(i, j) {
    const squares = this.state.squares;
    if (
      this.state.winner !== undefined ||
      squares[i][constants.HEIGHT - 1] !== undefined
    ) {
      return;
    }
    const dropedJ = drop(
      this.state.aTurn ? constants.PLAYER_A : constants.PLAYER_B,
      squares[i]
    );
    this.state.history.push([i, dropedJ]);
    if (dropedJ !== undefined) {
      let winner = undefined;
      let winPoints = isLine4(squares, i, dropedJ);
      if (winPoints) {
        winner = this.state.aTurn ? constants.PLAYER_A : constants.PLAYER_B;
      } else {
        if (squares.every((rol) => rol[constants.HEIGHT - 1])) {
          winner = 3;
        }
      }

      this.setState({
        squares: squares,
        aTurn: !this.state.aTurn,
        winner: winner,
        winPoints: winPoints,
      });
    }
  }

  handleUndo() {
    let history = this.state.history.pop();
    if (history) {
      const x = history[0];
      const y = history[1];
      let square = this.state.squares;
      square[x][y] = undefined;
      this.setState({
        squares: square,
        aTurn: !this.state.aTurn,
      });
    }
  }

  render() {
    let lastStep = undefined;
    if (this.state.history.length !== 0) {
      lastStep = this.state.history[this.state.history.length - 1];
    }
    return (
      <div className="App">
        <header className="App-header">
          <Crown
            value={this.state.winner}
            handlePlayAgain={() => {
              this.handlePlayAgain();
            }}
          />
          <Board
            w={constants.WIDTH}
            h={constants.HEIGHT}
            squares={this.state.squares}
            lastStep={lastStep}
            aTurn={this.state.aTurn}
            winPoints={this.state.winPoints}
            onClick={(i, j) => {
              this.handleClick(i, j);
            }}
          />
          <hr />
          <UndoBtn
            winner={this.state.winner}
            onClick={() => {
              this.handleUndo();
            }}
          />
        </header>
      </div>
    );
  }
}

class UndoBtn extends React.Component {
  render() {
    if (this.props.winner) {
      return null;
    }
    return <button onClick={this.props.onClick}>悔棋</button>;
  }
}

export default App;

function drop(player, col) {
  for (var i = 0; i < col.length; i++) {
    if (col[i] === undefined) {
      col[i] = player;
      return i;
    }
  }
  return undefined;
}

function isLine4(square, x1, y1) {
  let points = linePoints(square, x1, y1, 1, 0);
  if (points.length >= 4) {
    console.log("-");
    return points;
  }
  points = linePoints(square, x1, y1, 0, 1);
  if (points.length >= 4) {
    console.log("｜");
    return points;
  }
  points = linePoints(square, x1, y1, 1, 1);
  if (points.length >= 4) {
    console.log("/");
    return points;
  }
  points = linePoints(square, x1, y1, 1, -1);
  if (points.length >= 4) {
    console.log("\\");
    return points;
  }
  return undefined;
}

function linePoints(square, x1, y1, dx, dy) {
  let points = [[x1, y1]];
  const v = square[x1][y1];
  for (
    let i = x1 + dx, j = y1 + dy;
    i < constants.WIDTH && i >= 0 && j < constants.HEIGHT && j >= 0;
    i += dx, j += dy
  ) {
    if (square[i][j] === v) {
      points.push([i, j]);
    } else {
      break;
    }
  }
  for (
    let i = x1 - dx, j = y1 - dy;
    i < constants.WIDTH && i >= 0 && j < constants.HEIGHT && j >= 0;
    i -= dx, j -= dy
  ) {
    if (square[i][j] === v) {
      points.push([i, j]);
    } else {
      break;
    }
  }
  return points;
}
