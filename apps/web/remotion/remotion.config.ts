import { Config } from "@remotion/cli/config";
import { enableTailwind } from "@remotion/tailwind";

Config.overrideWebpackConfig((currentConfig) => {
  return enableTailwind(currentConfig);
});
