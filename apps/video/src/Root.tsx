import { Composition } from "remotion";
import { Clip, type ClipProps, calculateClipMetadata, FPS, H, W } from "./Clip";
import { LAUNCH_FPS, LAUNCH_FRAMES, Launch } from "./Launch";
import { calculateStorePreview, STORE_PREVIEW_DEFAULTS, StorePreview } from "./StorePreview";

export const Root = () => (
  <>
    <Composition
      id="Launch"
      component={Launch}
      durationInFrames={LAUNCH_FRAMES}
      fps={LAUNCH_FPS}
      width={1920}
      height={1080}
    />
    <Composition
      id="Clip"
      component={Clip}
      durationInFrames={FPS * 10}
      fps={FPS}
      width={W}
      height={H}
      defaultProps={{ name: "compose" } as ClipProps}
      calculateMetadata={calculateClipMetadata}
    />
    <Composition
      id="StorePreview"
      component={StorePreview}
      durationInFrames={STORE_PREVIEW_DEFAULTS.intro + STORE_PREVIEW_DEFAULTS.outro + 1}
      fps={STORE_PREVIEW_DEFAULTS.fps}
      width={STORE_PREVIEW_DEFAULTS.width}
      height={STORE_PREVIEW_DEFAULTS.height}
      defaultProps={STORE_PREVIEW_DEFAULTS}
      calculateMetadata={calculateStorePreview}
    />
  </>
);
