import type { NextConfig } from "next";
import { resolve } from "path";

const config: NextConfig = {
  turbopack: {
    root: resolve(__dirname),
  },
};

export default config;
