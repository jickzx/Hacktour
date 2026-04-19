/** Root Remotion composition registration. */
import { Composition } from "remotion";
import type { RemotionRenderProps } from "../types/remotion";
import { HacktourVideo } from "./HacktourVideo";

const DEFAULT_PROPS: RemotionRenderProps = {
  composition: {
    fps: 30,
    width: 1080,
    height: 1920,
    background: { type: "solid", color: "#000000" },
    clips: [],
    transitions: [],
    overlays: [],
    audio: { volume: 1 },
    totalDurationFrames: 30,
  },
  mediaClips: [],
};

/** Register the main renderable Hacktour composition. */
export const RemotionRoot = () => {
  return (
    <Composition
      id="hacktour-video"
      component={HacktourVideo}
      defaultProps={DEFAULT_PROPS}
      durationInFrames={DEFAULT_PROPS.composition.totalDurationFrames}
      fps={DEFAULT_PROPS.composition.fps}
      width={DEFAULT_PROPS.composition.width}
      height={DEFAULT_PROPS.composition.height}
      calculateMetadata={({ props }: { props: RemotionRenderProps }) => ({
        durationInFrames: props.composition.totalDurationFrames,
        fps: props.composition.fps,
        width: props.composition.width,
        height: props.composition.height,
      })}
    />
  );
};
