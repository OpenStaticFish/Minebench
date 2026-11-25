import type { MeshBasicMaterial } from 'three';

/** Water shares the opaque chunk draw. The atlas tile identifies its vertices. */
export function lightRiver(material: MeshBasicMaterial) {
  const clock = { value: 0 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.riverTime = clock;
    shader.vertexShader =
      `varying vec3 vRiverPosition; varying float vIsRiver;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vRiverPosition=(modelMatrix*vec4(position,1.)).xyz;
        vIsRiver=float(uv.x>.50 && uv.x<.75 && uv.y>.50 && uv.y<.75);`,
      );
    shader.fragmentShader =
      `uniform float riverTime; varying vec3 vRiverPosition; varying float vIsRiver;\n${shader.fragmentShader}`.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
      if(vIsRiver>.9){
        vec2 p=vRiverPosition.xz;
        vec3 eye=normalize(cameraPosition-vRiverPosition);
        vec2 cell=floor(vec2(p.x*1.3,p.y*5.5));
        float seed=fract(sin(dot(cell,vec2(15.35,78.39)))*4375.54);
        float crest=.5+.5*sin(p.y*1.8+sin(p.x*.15)*2.1-riverTime*.56);
        float shimmer=smoothstep(.89,.98,seed)*smoothstep(.44,.92,crest);
        float gleam=pow(max(0.,dot(normalize(eye.xz+vec2(.0001)),normalize(vec2(-.10,1.)))),26.);
        diffuseColor.rgb*=.96+.055*crest;
        diffuseColor.rgb+=vec3(.46,.36,.18)*shimmer*(.22+.78*gleam);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.58,.65,.48),.10*pow(1.-max(.0,eye.y),3.));
      }`,
      );
  };
  return clock;
}
