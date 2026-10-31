import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import * as THREE from "three";

export function createPostFx(renderer, scene, camera) {
  if(renderer.userData?.lowPower)return {render(){renderer.render(scene,camera);},dispose(){}};
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.025, // strength
    0.55, // radius
    4.0, // threshold
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    composer.setSize(w, h);
    bloom.resolution.set(w, h);
  }
  window.addEventListener("resize", resize);

  return {
    composer,
    render() {
      composer.render();
    },
    dispose() {
      window.removeEventListener("resize", resize);
    },
  };
}
