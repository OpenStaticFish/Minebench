import {
  BackSide,
  BoxGeometry,
  Color,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';

export function skyDome() {
  const material = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: `varying vec3 dir; void main(){dir=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `varying vec3 dir;
      float h(float x){return fract(sin(x*78.219+2.023)*4291.72);}
      float ridge(float t){float i=floor(t);return mix(h(i),h(i+1.),fract(t));}
      void main(){
        vec3 d=normalize(dir);float t=atan(d.x,-d.z); float y=d.y;
        vec3 sunDir=normalize(vec3(.10,.315,-1.0));float day=length(d-sunDir);
        vec3 c=mix(vec3(.97,.81,.59),vec3(.355,.634,.74),smoothstep(-.035,.50,y));
        c=mix(c,vec3(1.,.845,.61),.73*exp(-day*3.5));
        c+=vec3(.075,.05,.015)*exp(-day*8.);
        vec2 s=floor((d.xy-sunDir.xy)*360.)/360.;
        if(d.z<0. && length(s)<.034)c=vec3(1.,.954,.763);
        float r=.075+ridge(t*9.+61.)*.102+ridge(t*29.)*.043+ridge(t*80.)*.012;
        if(y<r)c=mix(vec3(.71,.71,.64),vec3(.84,.78,.65),smoothstep(.6,1.,dot(d,sunDir)));
        float near=.006+ridge(t*13.-5.)*.078+ridge(t*46.)*.024;
        if(y<near)c=vec3(.69,.72,.62);
        gl_FragColor=vec4(c,1.);
      }`,
  });
  const mesh = new Mesh(new SphereGeometry(360, 48, 24), material);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return mesh;
}

export function cloudBank() {
  const geom = new BoxGeometry(),
    materials = ['#f1e1c3', '#dad3bb', '#fff1d5', '#d3cebb', '#efdec2', '#e6d6ba'].map(
      (c) => new MeshBasicMaterial({ color: c, fog: false }),
    );
  let n = 144,
    seed = 1847;
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) | 0) >>> 0) / 4294967296;
  const cloud = new InstancedMesh(geom, materials, n),
    stub = new Object3D();
  const p = new Vector3(),
    c = new Color();
  let slot = 0;
  for (let i = 0; i < 24; i++) {
    const angle = ((i + 0.25 * rand()) / 24) * Math.PI * 2,
      dist = 140 + rand() * 90,
      alt = 67 + rand() * 43;
    p.set(Math.sin(angle) * dist, alt, -Math.cos(angle) * dist);
    const width = 5 + rand() * 9,
      tall = 1.4 + rand() * 1.9;
    for (let j = 0; j < 6; j++) {
      stub.position.set(
        p.x + (j - 2.5) * width * 0.72,
        p.y + Math.round(Math.sin(j * 0.7) * tall + 0.7 * rand()),
        p.z + Math.round(rand() * 4) * 2,
      );
      stub.scale.set(width * (0.8 + rand()), tall * (1 + Math.sin(j * 0.65)), 6 + rand() * 8);
      stub.updateMatrix();
      cloud.setMatrixAt(slot, stub.matrix);
      cloud.setColorAt(slot++, c.setScalar(0.96 + rand() * 0.04));
    }
  }
  cloud.computeBoundingSphere();
  return cloud;
}
