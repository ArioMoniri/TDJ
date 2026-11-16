import { Composition } from "remotion";
import { Clip, type ClipProps, calculateClipMetadata, FPS, H, W } from "./Clip";
import { calculateHeroMetadata, HERO_FPS, HERO_H, HERO_W, Hero, type HeroProps } from "./Hero";
import { LAUNCH_FPS, LAUNCH_FRAMES, Launch } from "./Launch";
import { calculateShowcase, SHOWCASE_DEFAULTS, Showcase } from "./Showcase";
import { calculateStorePreview, STORE_PREVIEW_DEFAULTS, StorePreview } from "./StorePreview";
import { calculateDeviceFrameMetadata, DeviceFrame, type DeviceFrameProps } from "./three/DeviceFrame";

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
      id="Hero"
      component={Hero}
      durationInFrames={HERO_FPS * 20}
      fps={HERO_FPS}
      width={HERO_W}
      height={HERO_H}
      defaultProps={{ name: "hero" } as HeroProps}
      calculateMetadata={calculateHeroMetadata}
    />
    <Composition
      id="DeviceFrame"
      component={DeviceFrame}
      durationInFrames={1}
      fps={30}
      width={1000}
      height={1000}
      defaultProps={{ kind: "phone" } as DeviceFrameProps}
      calculateMetadata={calculateDeviceFrameMetadata}
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
    <Composition
      id="Showcase"
      component={Showcase}
      durationInFrames={1}
      fps={30}
      width={SHOWCASE_DEFAULTS.width}
      height={SHOWCASE_DEFAULTS.height}
      defaultProps={SHOWCASE_DEFAULTS}
      calculateMetadata={calculateShowcase}
    />
  </>
);
