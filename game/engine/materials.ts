/**
 * Shaders and materials.
 *
 * Chunk lighting (directional face shade × ambient occlusion) is baked into a
 * vertex attribute by the mesher, so the chunk shader only has to sample the
 * texture array, animate water, and apply distance fog. Shared uniforms are
 * passed by reference so the game loop updates them once for every material.
 */
import * as THREE from "three"

export interface SharedUniforms {
  uTime: THREE.IUniform<number>
  uFogColor: THREE.IUniform<THREE.Color>
  uFogNear: THREE.IUniform<number>
  uFogFar: THREE.IUniform<number>
  uSunDir: THREE.IUniform<THREE.Vector3>
}

/** Palette for the sky dome; the horizon doubles as the fog colour. */
export const SKY = {
  zenith: new THREE.Color("#2f7fd6"),
  horizon: new THREE.Color("#c3e3f7"),
  ground: new THREE.Color("#8aa9b8"),
  sun: new THREE.Color("#fff1c4"),
} as const

export const SUN_DIRECTION = new THREE.Vector3(0.45, 0.72, 0.3).normalize()

export function createSharedUniforms(): SharedUniforms {
  return {
    uTime: { value: 0 },
    uFogColor: { value: SKY.horizon.clone() },
    uFogNear: { value: 80 },
    uFogFar: { value: 120 },
    uSunDir: { value: SUN_DIRECTION.clone() },
  }
}

const CHUNK_VERT = /* glsl */ `
  uniform float uTime;
  attribute vec2 aData;
  varying vec2 vUv;
  varying vec2 vData;
  varying vec3 vWorldPos;

  void main() {
    vec3 p = position;
    #ifdef WATER
      p.y += sin(uTime * 1.4 + (position.x + position.z) * 0.6) * 0.035 - 0.02;
    #endif
    vUv = uv;
    vData = aData;
    vec4 worldPos = modelMatrix * vec4(p, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`

const CHUNK_FRAG = /* glsl */ `
  precision highp float;
  precision highp sampler2DArray;
  uniform sampler2DArray uAtlas;
  uniform float uTime;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec2 vData;
  varying vec3 vWorldPos;

  void main() {
    float tile = floor(vData.x * 255.0 + 0.5);
    vec4 tex = texture(uAtlas, vec3(vUv, tile));
    #ifdef WATER
      float ripple = sin(vWorldPos.x * 1.1 + uTime * 0.8) * cos(vWorldPos.z * 0.9 - uTime * 0.6);
      tex.rgb *= 1.0 + ripple * 0.08;
    #else
      if (tex.a < 0.5) discard;
    #endif
    vec3 color = tex.rgb * vData.y;
    float fog = smoothstep(uFogNear, uFogFar, distance(vWorldPos, cameraPosition));
    gl_FragColor = vec4(mix(color, uFogColor, fog), tex.a * uOpacity);
  }
`

export type ChunkKind = "opaque" | "water"

export function createChunkMaterial(
  shared: SharedUniforms,
  atlas: THREE.Texture,
  kind: ChunkKind,
): THREE.ShaderMaterial {
  const water = kind === "water"
  return new THREE.ShaderMaterial({
    name: `chunk-${kind}`,
    uniforms: {
      uAtlas: { value: atlas },
      uTime: shared.uTime,
      uFogColor: shared.uFogColor,
      uFogNear: shared.uFogNear,
      uFogFar: shared.uFogFar,
      uOpacity: { value: water ? 0.72 : 1 },
    },
    vertexShader: CHUNK_VERT,
    fragmentShader: CHUNK_FRAG,
    defines: water ? { WATER: 1 } : {},
    transparent: water,
    depthWrite: !water,
    // Water is visible from below when swimming; everything else is single-sided.
    side: water ? THREE.DoubleSide : THREE.FrontSide,
  })
}

const SKY_VERT = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const SKY_FRAG = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uGround;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  varying vec3 vDirection;

  void main() {
    vec3 dir = normalize(vDirection);
    float h = dir.y;
    vec3 above = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.5));
    vec3 below = mix(uHorizon, uGround, clamp(-h * 3.0, 0.0, 1.0));
    vec3 color = h >= 0.0 ? above : below;
    float sun = max(dot(dir, uSunDir), 0.0);
    color += uSunColor * (pow(sun, 800.0) * 1.4 + pow(sun, 16.0) * 0.12 + pow(sun, 3.0) * 0.04);
    gl_FragColor = vec4(color, 1.0);
  }
`

export function createSkyMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: "sky",
    uniforms: {
      uZenith: { value: SKY.zenith.clone() },
      uHorizon: { value: SKY.horizon.clone() },
      uGround: { value: SKY.ground.clone() },
      uSunDir: { value: SUN_DIRECTION.clone() },
      uSunColor: { value: SKY.sun.clone() },
    },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
  })
}

const CLOUD_VERT = /* glsl */ `
  varying vec3 vWorldPos;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`

const CLOUD_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  varying vec3 vWorldPos;

  void main() {
    float fog = smoothstep(uFogNear, uFogFar, distance(vWorldPos, cameraPosition) * 0.6);
    gl_FragColor = vec4(mix(uColor, uFogColor, fog), uOpacity * (1.0 - fog));
  }
`

export function createCloudMaterial(shared: SharedUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: "clouds",
    uniforms: {
      uColor: { value: new THREE.Color("#ffffff") },
      uOpacity: { value: 0.82 },
      uFogColor: shared.uFogColor,
      uFogNear: shared.uFogNear,
      uFogFar: shared.uFogFar,
    },
    vertexShader: CLOUD_VERT,
    fragmentShader: CLOUD_FRAG,
    transparent: true,
    depthWrite: false,
  })
}

/** Upload the procedural tiles as a 2D texture array (one layer per tile). */
export function createAtlasTexture(
  data: Uint8Array,
  width: number,
  height: number,
  depth: number,
): THREE.DataArrayTexture {
  const texture = new THREE.DataArrayTexture(data, width, height, depth)
  texture.format = THREE.RGBAFormat
  texture.type = THREE.UnsignedByteType
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.colorSpace = THREE.NoColorSpace
  texture.needsUpdate = true
  return texture
}
