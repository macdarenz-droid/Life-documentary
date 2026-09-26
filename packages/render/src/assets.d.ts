// Remotion's bundler emits imported font files as assets and gives their URL.
declare module '*.ttf' {
  const url: string;
  export default url;
}
