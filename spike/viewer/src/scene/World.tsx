import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { planetStyle } from "../github/planetStyle";
import type { Repository } from "../github/api";

const vertex = `
  varying vec3 vPoint;
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    vPoint = position;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
  }
`;
const noise = `
  float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }
  float noise(vec3 p) {
    vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
      mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
  }
  float fbm(vec3 p) {
    float n=0.0; float a=0.5;
    for(int i=0;i<5;i++){n+=a*noise(p);p=p*2.03+vec3(7.1,3.7,1.3);a*=0.5;}
    return n;
  }
`;
const surface = `${noise}
  varying vec3 vPoint; varying vec3 vNormal; varying vec3 vWorld;
  uniform vec3 uDark; uniform vec3 uLand; uniform vec3 uGlow;
  uniform float uSeed; uniform float uKind;
  void main() {
    vec3 p=normalize(vPoint); vec3 q=p*4.0+uSeed*73.0;
    float terrain=fbm(q); float detail=fbm(q*7.0);
    vec3 color;
    if(uKind < 0.5) {
      float land=smoothstep(0.44,0.51,terrain);
      color=mix(uDark*(0.7+detail*0.6),uLand*(0.5+detail),land);
      float coast=smoothstep(0.425,0.445,terrain)*(1.0-smoothstep(0.445,0.47,terrain));
      color+=coast*uGlow*0.14;
      float ice=smoothstep(0.84,0.96,abs(p.y)+(terrain-.5)*.18);
      color=mix(color,vec3(.78,.88,.91),ice);
      float cloud=smoothstep(.61,.76,fbm(q*1.8+vec3(4.0,1.0,7.0)));
      color=mix(color,vec3(.86,.9,.94),cloud*.6);
    } else if(uKind < 1.5) {
      float bands=sin(p.y*30.0 + terrain*3.5 + sin(p.x*5.0)*.3)*.5+.5;
      color=mix(uDark,uLand,bands*.65+.25);
      color*=.72+detail*.6;
      float swirl=sin(p.y*75.0+terrain*6.0)*.5+.5;
      color=mix(color,uGlow,swirl*.09);
    } else {
      color=mix(uDark,uLand,smoothstep(.25,.75,terrain));
      float craters=smoothstep(.48,.53,noise(q*8.0));
      color*=.6+detail*.65+craters*.17;
    }
    vec3 normal=normalize(vNormal);
    vec3 light=normalize(vec3(-9.0,12.0,16.0)-vWorld*.1);
    float daylight=dot(normal,light);
    float diffuse=smoothstep(-.18,.9,daylight);
    float rim=pow(1.0-max(dot(normal,normalize(cameraPosition-vWorld)),0.0),3.0);
    color=color*(.10+diffuse*1.3)+uGlow*rim*.25*max(daylight+.25,0.0);
    gl_FragColor=vec4(color,1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
const atmosphere = `
  varying vec3 vNormal; varying vec3 vWorld; uniform vec3 uGlow;
  void main(){
    float rim=pow(1.0-abs(dot(normalize(vNormal),normalize(cameraPosition-vWorld))),3.0);
    gl_FragColor=vec4(uGlow,rim*.34);
    #include <colorspace_fragment>
  }
`;
const ringFragment = `
  varying vec2 vUv; uniform vec3 uColor;
  void main(){
    float r=length(vUv-.5)*2.0;
    float bands=.5+.16*sin(r*65.0)+.08*sin(r*110.0);
    float a=smoothstep(.50,.57,r)*(1.0-smoothstep(.93,1.0,r));
    if(abs(r-.77)<.012) a*=.12;
    gl_FragColor=vec4(uColor*(.65+bands*.4),a*bands*.7);
    #include <colorspace_fragment>
  }
`;

export function World({ repo, radius = 1, active = false, onClick, animate = true }: {
  repo: Pick<Repository, "name" | "id" | "language" | "size">;
  radius?: number; active?: boolean; onClick?: () => void; animate?: boolean;
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const style = useMemo(() => planetStyle(repo), [repo]);
  const uniforms = useMemo(() => ({
    uDark: { value: new THREE.Color(style.dark) }, uLand: { value: new THREE.Color(style.land) },
    uGlow: { value: new THREE.Color(style.glow) }, uSeed: { value: style.seed }, uKind: { value: style.kind },
  }), [style]);
  useFrame((_, delta) => { if (mesh.current && animate) mesh.current.rotation.y += delta * .025; });
  return <group scale={radius} rotation={[.12, style.seed * 6, .15]}>
    <mesh ref={mesh} onClick={onClick ? e => { e.stopPropagation(); onClick(); } : undefined}>
      <sphereGeometry args={[1, 64, 48]} />
      <shaderMaterial vertexShader={vertex} fragmentShader={surface} uniforms={uniforms} />
    </mesh>
    <mesh scale={1.035} raycast={() => null}>
      <sphereGeometry args={[1, 48, 32]} />
      <shaderMaterial vertexShader={vertex} fragmentShader={atmosphere} uniforms={uniforms}
        transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>
    {style.rings && <mesh rotation={[-Math.PI / 2.6, .1, .2]} raycast={() => null}>
      <planeGeometry args={[4.1, 4.1]} />
      <shaderMaterial vertexShader={`varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`}
        fragmentShader={ringFragment} uniforms={{ uColor: { value: new THREE.Color(style.glow) } }}
        transparent side={THREE.DoubleSide} depthWrite={false} />
    </mesh>}
    {active && <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
      <ringGeometry args={[2.2, 2.215, 100]} />
      <meshBasicMaterial color={style.glow} transparent opacity={.5} side={THREE.DoubleSide} />
    </mesh>}
  </group>;
}

const sunFragment = `${noise}
  varying vec3 vPoint; varying vec3 vNormal; varying vec3 vWorld; uniform float uTime;
  void main(){
    float n=fbm(vPoint*5.0+vec3(uTime*.04));
    float grain=noise(vPoint*85.0+uTime*.03);
    vec3 color=mix(vec3(.95,.23,.04),vec3(1.0,.86,.43),n*.85+grain*.2);
    gl_FragColor=vec4(color,1.0);
    #include <colorspace_fragment>
  }
`;
export function Sun({ small = false, animate = true }: { small?: boolean; animate?: boolean }) {
  const material = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);
  const glow = useMemo(() => {
    const canvas = document.createElement("canvas"); canvas.width=128;canvas.height=128;
    const ctx=canvas.getContext("2d")!;
    const gradient=ctx.createRadialGradient(64,64,2,64,64,64);
    gradient.addColorStop(0,"rgba(255,187,90,.6)");gradient.addColorStop(.25,"rgba(251,118,44,.2)");gradient.addColorStop(1,"rgba(251,118,44,0)");
    ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
    return new THREE.CanvasTexture(canvas);
  }, []);
  useFrame((_, delta) => { if(animate && material.current) material.current.uniforms.uTime.value += delta; });
  useEffect(() => () => glow.dispose(), [glow]);
  return <group scale={small ? .85 : 1.95}>
    <sprite scale={[9,9,1]} raycast={() => null}><spriteMaterial map={glow} transparent depthWrite={false} blending={THREE.AdditiveBlending} /></sprite>
    <mesh><sphereGeometry args={[1,48,32]} /><shaderMaterial ref={material} vertexShader={vertex} fragmentShader={sunFragment} uniforms={uniforms} /></mesh>
  </group>;
}
