import coreWebVitals from "eslint-config-next/core-web-vitals";

const config = [
  { ignores: [".next/**", "node_modules/**", "out/**", "build/**"] },
  ...coreWebVitals
];

export default config;
