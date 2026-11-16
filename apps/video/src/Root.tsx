import { Composition } from "remotion";
import { Clip, type ClipProps, calculateClipMetadata, FPS, H, W } from "./Clip";
import { calculateHeroMetadata, HERO_FPS, HERO_H, HERO_W, Hero, type HeroProps } from "./Hero";
import { LAUNCH_FPS, LAUNCH_FRAMES, Launch } from "./Launch";

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
  </>
);
