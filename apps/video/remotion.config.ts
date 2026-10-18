import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setChromiumOpenGlRenderer("swangle");
if (process.env.CHROMIUM) Config.setBrowserExecutable(process.env.CHROMIUM);
