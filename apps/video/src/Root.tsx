import { Composition } from "remotion";
import { Launch } from "./Launch";
export const Root = () => (
  <Composition
    id="Launch"
    component={Launch}
    durationInFrames={30 * 24}
    fps={30}
    width={1920}
    height={1080}
  />
);
