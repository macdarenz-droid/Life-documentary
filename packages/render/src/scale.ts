/**
 * Design tokens are in device points for a ~360 pt wide phone. The episode is 1080 px wide,
 * so token sizes are multiplied by this factor on video.
 */
export const VIDEO_SCALE = 3;

export const px = (points: number): number => points * VIDEO_SCALE;
