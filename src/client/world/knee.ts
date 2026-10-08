import { Container, GlProgram, Mesh, MeshGeometry, Shader, Texture } from 'pixi.js';

const vertex = `in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
}`;

/**
 * Below the knee a channel passes as is; above it, it rolls off toward the cap and never reaches it, so stacked lights and glows
 * shade on instead of clipping to a flat disc. The dither breaks up the 8-bit steps a slow gradient leaves on a dark night.
 */
const fragment = `in vec2 vUV;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform float uKnee;
uniform float uCap;
void main() {
  vec4 c = texture(uTexture, vUV);
  float room = uCap - uKnee;
  vec3 over = max(c.rgb - uKnee, 0.0);
  vec3 rgb = min(c.rgb, vec3(uKnee)) + room * (1.0 - exp(-over / room));
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  finalColor = vec4(rgb + n / 255.0, min(c.a, uCap));
}`;

/** A full-target quad that copies `source` through the knee curve; render its `root` into an 8-bit target. */
export function createKnee(knee: number, cap: number) {
  const geometry = new MeshGeometry({ positions: new Float32Array(8), uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), indices: new Uint32Array([0, 1, 2, 0, 2, 3]) });
  const shader = new Shader({
    glProgram: GlProgram.from({ vertex, fragment, name: 'knee' }),
    resources: { uTexture: Texture.EMPTY.source, kneeUniforms: { uKnee: { value: knee, type: 'f32' }, uCap: { value: cap, type: 'f32' } } },
  });
  const mesh = new Mesh({ geometry, shader });
  const root = new Container({ isRenderGroup: true });
  root.addChild(mesh);
  let size = { w: 0, h: 0 };
  return {
    root,
    from(source: Texture) {
      shader.resources.uTexture = source.source;
      if (size.w === source.width && size.h === source.height) return;
      size = { w: source.width, h: source.height };
      geometry.positions = new Float32Array([0, 0, size.w, 0, size.w, size.h, 0, size.h]);
    },
  };
}
