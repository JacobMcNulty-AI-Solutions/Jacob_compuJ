import React, { useState, useEffect, useCallback } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';

const ChessboardComponent: React.FC = () => {
  const [game, setGame] = useState(new Chess());
  const [boardSize, setBoardSize] = useState(400);

  // Handle window resize to make the board responsive
  useEffect(() => {
    const handleResize = () => {
      // Limit the chessboard size based on container width
      const maxWidth = window.innerWidth < 768 ? window.innerWidth - 40 : 400;
      setBoardSize(maxWidth);
    };

    // Set initial size
    handleResize();

    // Add event listener for resize
    window.addEventListener('resize', handleResize);
    
    // Clean up
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Make a move
  const makeAMove = useCallback((move: any) => {
    try {
      const result = game.move(move);
      setGame(new Chess(game.fen()));
      return result;
    } catch (e) {
      return null;
    }
  }, [game]);

  // Handle piece drop
  const onDrop = (sourceSquare: string, targetSquare: string) => {
    const move = makeAMove({
      from: sourceSquare,
      to: targetSquare,
      promotion: 'q', // always promote to queen for simplicity
    });

    // If the move is illegal, return false to revert the piece
    if (move === null) return false;
    return true;
  };

  // Reset the game
  const resetGame = () => {
    setGame(new Chess());
  };

  // Custom pieces configuration
  const customPieces = () => {
    const pieces = {
      wP: ({ squareWidth }: { squareWidth: number }) => (
        <img 
          src="/chess_pieces/w_pawn.svg" 
          alt="White Pawn" 
          style={{ width: squareWidth * 0.85, height: squareWidth * 0.85 }} 
        />
      ),
      wN: ({ squareWidth }: { squareWidth: number }) => (
        <img 
          src="/chess_pieces/w_knight.svg" 
          alt="White Knight" 
          style={{ width: squareWidth * 0.85, height: squareWidth * 0.85 }} 
        />
      ),
      wB: ({ squareWidth }: { squareWidth: number }) => (
        <img 
          src="/chess_pieces/w_bishop.svg" 
          alt="White Bishop" 
          style={{ width: squareWidth * 0.85, height: squareWidth * 0.85 }} 
        />
      ),
      wR: ({ squareWidth }: { squareWidth: number }) => (
        <img 
          src="/chess_pieces/w_rook.svg" 
          alt="White Rook" 
          style={{ width: squareWidth * 0.85, height: squareWidth * 0.85 }} 
        />
      ),
      wQ: ({ squareWidth }: { squareWidth: number }) => (
        <img 
          src="/chess_pieces/w_queen.svg" 
          alt="White Queen" 
          style={{ width: squareWidth * 0.85, height: squareWidth * 0.85 }} 
        />
      ),
      wK: ({ squareWidth }: { squareWidth: number }) => (
        <img 
          src="/chess_pieces/w_king.svg" 
          alt="White King" 
          style={{ width: squareWidth * 0.85, height: squareWidth * 0.85 }} 
        />
      ),
      bP: ({ squareWidth }: { squareWidth: number }) => (
        <img 
          src="/chess_pieces/b_pawn.svg" 
          alt="Black Pawn" 
          style={{ width: squareWidth * 0.85, height: squareWidth * 0.85 }} 
        />
      ),
      bN: ({ squareWidth }: { squareWidth: number }) => (
        <img 
          src="/chess_pieces/b_knight.svg" 
          alt="Black Knight" 
          style={{ width: squareWidth * 0.85, height: squareWidth * 0.85 }} 
        />
      ),
      bB: ({ squareWidth }: { squareWidth: number }) => (
        <img 
          src="/chess_pieces/b_bishop.svg" 
          alt="Black Bishop" 
          style={{ width: squareWidth * 0.85, height: squareWidth * 0.85 }} 
        />
      ),
      bR: ({ squareWidth }: { squareWidth: number }) => (
        <img 
          src="/chess_pieces/b_rook.svg" 
          alt="Black Rook" 
          style={{ width: squareWidth * 0.85, height: squareWidth * 0.85 }} 
        />
      ),
      bQ: ({ squareWidth }: { squareWidth: number }) => (
        <img 
          src="/chess_pieces/b_queen.svg" 
          alt="Black Queen" 
          style={{ width: squareWidth * 0.85, height: squareWidth * 0.85 }} 
        />
      ),
      bK: ({ squareWidth }: { squareWidth: number }) => (
        <img 
          src="/chess_pieces/b_king.svg" 
          alt="Black King" 
          style={{ width: squareWidth * 0.85, height: squareWidth * 0.85 }} 
        />
      ),
    };

    return pieces;
  };

  return (
    <div className="bg-[#FFFFFF] rounded-lg shadow-md p-4 mb-8">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-[#333333]">Have a break...have a chess match :)</h2>
        <button 
          onClick={resetGame}
          className="px-4 py-2 bg-[#4A90E2] text-white rounded hover:bg-[#E2A400] transition-colors"
        >
          Reset Game
        </button>
      </div>
      
      <div className="flex justify-center">
        <div className="mx-auto">
          <Chessboard 
            id="PlayableChess" 
            boardWidth={boardSize}
            position={game.fen()}
            onPieceDrop={onDrop}
            boardOrientation="white"
            customPieces={customPieces()}
            areArrowsAllowed={true}
            customBoardStyle={{
              borderRadius: '4px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
            }}
            customDarkSquareStyle={{ backgroundColor: '#4A90E2' }}
            customLightSquareStyle={{ backgroundColor: '#F7F7F7' }}
          />
        </div>
      </div>
    </div>
  );
};

export default ChessboardComponent; 