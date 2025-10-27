import React from "react";
import "./Board.css";
import constants from "./constants";
import useSound from "use-sound";

function Square(props) {
  let cn = "square";
  if (props.value !== undefined) {
    if (props.value === constants.PLAYER_A) {
      cn += " playerA";
    } else {
      cn += " playerB";
    }
    if (props.winned) {
      cn += " winned";
    }
  }
  let lastStepSpan = null;
  if (props.isLastStep && !props.winned) {
    lastStepSpan = <span className="lastStep"></span>;
  }

  const [playActive] = useSound("./pop-down.mp3", { volume: 0.25 });
  const [playOn] = useSound("./pop-up-on.mp3", { volume: 0.25 });
  const [playOff] = useSound("./pop-up-off.mp3", { volume: 0.25 });


  return (
    <span>
      {lastStepSpan}
      <button
        className={cn}
        onClick={props.onClick}
        onMouseDown={() => {
          playActive();
        }}
        onMouseUp={()=>{
          if (props.aTurn) {
            playOn();
          } else {
            playOff();
          }
          
        }}
      ></button>
    </span>
  );
}

class Board extends React.Component {
  renderSquare(i, j) {
    let winned = undefined;
    let pointValue = this.props.squares[i][j];
    if (this.props.winPoints && pointValue) {
      this.props.winPoints.forEach((v) => {
        if (v[0] === i && v[1] === j) {
          winned = true;
        }
      });
    }
    let isLastStep = false;
    if (this.props.lastStep !== undefined) {
      if (this.props.lastStep[0] === i && this.props.lastStep[1] === j) {
        isLastStep = true;
      }
    }
 
    
    return (
      <Square
        key={i * this.props.w + j}
        value={pointValue}
        winned={winned}
        isLastStep={isLastStep}
        onClick={() => this.props.onClick(i, j)}
        aTurn={this.props.aTurn}
      />
    );
  }

  render() {
    let rows = [];
    for (let h = this.props.h - 1; h >= 0; --h) {
      let cols = [];
      for (let w = 0; w < this.props.w; ++w) {
        cols.push(this.renderSquare(w, h));
      }
      let r = (
        <div key={h} className="board-row">
          {cols}
        </div>
      );
      rows.push(r);
    }
    return <div>{rows}</div>;
  }
}

export default Board;
