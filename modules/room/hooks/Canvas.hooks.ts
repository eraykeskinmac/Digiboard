import { handleMove } from './../helpers/Canvas.helpers';
import { useBoardPosition } from './useBoardPosition';
import { socket } from '@/common/lib/socket';
import { useOptions } from '@/common/recoil/options';
import { useCallback, useEffect, useState } from 'react';
import { drawOnUndo } from '../helpers/Canvas.helpers';
import usersAtom, { useUsers } from '@/common/recoil/users';
import { getPos } from '@/common/lib/getPos';
import { useSetRecoilState } from 'recoil';

const savedMoves: Move[] = [];
let moves: [number, number][] = [];

export const useDraw = (
  ctx: CanvasRenderingContext2D | undefined,
  blocked: boolean,
  handleEnd: () => void
) => {
  const users = useUsers();
  const options = useOptions();
  const [drawing, setDrawing] = useState(false);

  const boardPosition = useBoardPosition();
  const movedX = boardPosition.x;
  const movedY = boardPosition.y;

  useEffect(() => {
    if (ctx) {
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.lineWidth = options.lineWidth;
      ctx.strokeStyle = options.lineColor;
    }
  });

  const handleUndo = useCallback(() => {
    if (ctx) {
      savedMoves.pop();
      socket.emit('undo');

      drawOnUndo(ctx, savedMoves, users);

      handleEnd();
    }
  }, [ctx, handleEnd, users]);

  useEffect(() => {
    const handleUndoKeyboard = (e: KeyboardEvent) => {
      if (e.key === 'z' && e.ctrlKey) {
        handleUndo();
      }
    };

    document.addEventListener('keydown', handleUndoKeyboard);

    return () => {
      document.removeEventListener('keydown', handleUndoKeyboard);
    };
  }, [handleUndo]);

  const handleStartDrawing = (x: number, y: number) => {
    if (!ctx || blocked) return;

    setDrawing(true);

    ctx.beginPath();
    ctx.lineTo(getPos(x, movedX), getPos(y, movedY));
    ctx.stroke();
  };

  const handleEndDrawing = () => {
    if (!ctx || blocked) return;
    ctx.closePath();
    setDrawing(false);

    const move: Move = {
      path: moves,
      options,
    };

    savedMoves.push(move);
    socket.emit('draw', move);

    moves = [];
    handleEnd();
  };

  const handleDraw = (x: number, y: number) => {
    if (!ctx || !drawing || blocked) {
      return;
    }
    ctx.lineTo(getPos(x, movedX), getPos(y, movedY));
    ctx.stroke();

    moves.push([getPos(x, movedX), getPos(y, movedY)]);
  };

  return {
    handleDraw,
    handleEndDrawing,
    handleStartDrawing,
    handleUndo,
    drawing,
  };
};

export const useSocketDraw = (
  ctx: CanvasRenderingContext2D | undefined,
  drawing: boolean,
  handleEnd: () => void
) => {
  const setUsers = useSetRecoilState(usersAtom);

  useEffect(() => {
    socket.emit('joined_room');
  }, []);

  useEffect(() => {
    socket.on('joined', (roomJSON) => {
      const room: Room = new Map(JSON.parse(roomJSON));

      room.forEach((userMoves, userId) => {
        if (ctx) userMoves.forEach((move) => handleMove(move, ctx));
        handleEnd();

        setUsers((prevUsers) => ({ ...prevUsers, [userId]: userMoves }));
      });
    });

    return () => {
      socket.off('room');
    };
  }, [ctx, handleEnd, setUsers]);

  useEffect(() => {
    let moveToDrawLater: Move | undefined;
    let userIdLater = '';
    socket.on('user_draw', (move, userId) => {
      if (ctx && !drawing) {
        handleMove(move, ctx);

        setUsers((prevUsers) => {
          const newUsers = { ...prevUsers };
          if (newUsers[userId]) newUsers[userdId] = [...newUsers[userId], move];
          return newUsers;
        });
      } else {
        moveToDrawLater = move;
        userIdLater = userId;
      }
    });

    return () => {
      socket.off('user_draw');
      if (moveToDrawLater && userIdLater && ctx) {
        handleMove(moveToDrawLater, ctx);
        handleEnd();
        setUsers((prevUsers) => {
          const newUsers = { ...prevUsers };
          newUsers[userIdLater] = [
            ...newUsers[userIdLater],
            moveToDrawLater as Move,
          ];
          return newUsers;
        });
      }
    };
  }, [ctx, handleEnd, setUsers, drawing]);

  useEffect(() => {
    socket.on('user_undo', (userId) => {
      setUsers((prevUsers) => {
        const newUsers = { ...prevUsers };
        newUsers[userId] = newUsers[userId]?.slice(0, -1);

        if (ctx) {
          drawOnUndo(ctx, savedMoves, newUsers);
          handleEnd();
        }
        return newUsers;
      });
    });
    return () => {
      socket.off('user_undo');
    };
  }, [ctx, handleEnd, setUsers]);
};
