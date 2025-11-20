// src/features/tetris/lib/types.ts
export type Shape = (number | string)[][];
export type Board = (number | string)[][];

export type Player = {
  pos: { x: number; y: number };
  shape: Shape;
  collided: boolean;
};
