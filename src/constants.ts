// Global tunable constants for VOXL.

/** Horizontal size of a chunk in blocks (x and z). */
export const CHUNK_SIZE = 16;
/** Vertical size of a chunk in blocks. */
export const CHUNK_HEIGHT = 64;
/** Sea level — water fills up to this y and beaches form around it. */
export const SEA_LEVEL = 24;

/** Number of solid blocks in a chunk. */
export const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT;

/** Player collision half-width (player box is ~0.6 wide). */
export const PLAYER_HALF_WIDTH = 0.3;
/** Player eye height (camera offset from feet). */
export const PLAYER_EYE_HEIGHT = 1.62;
/** Total player height. */
export const PLAYER_HEIGHT = 1.8;

export const GRAVITY = 28; // blocks/s^2 (tuned for snappy arcade feel)
export const JUMP_SPEED = 9.2; // blocks/s
export const WALK_SPEED = 5.4; // blocks/s
export const SPRINT_SPEED = 8.6; // blocks/s
export const FLY_SPEED = 12; // blocks/s
export const FLY_SPRINT_SPEED = 24; // blocks/s
export const TERMINAL_VELOCITY = 60;

/** Reach distance for block break/place raycasts. */
export const REACH = 6;

/** Max chunks generated/meshed per frame to avoid hitches. */
export const MAX_CHUNK_GEN_PER_FRAME = 2;
export const MAX_CHUNK_MESH_PER_FRAME = 2;

/** Default game settings. */
export const DEFAULT_SEED = "voxl";

export const VERSION = "1.0.0";
export const GAME_NAME = "VOXL";
