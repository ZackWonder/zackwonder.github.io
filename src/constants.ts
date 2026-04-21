const constants = {
  PLAYER_A: 1,
  PLAYER_B: 2,
  WIDTH: 7,
  HEIGHT: 6,
} as const;

export type Player = typeof constants.PLAYER_A | typeof constants.PLAYER_B;

export default constants;
