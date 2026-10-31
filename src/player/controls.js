import * as THREE from "three";
import { MODES, LOOK } from "../config.js";
import { resolveMovement } from "./collision.js";
import { clampPitch } from "./look.js";

const UP = new THREE.Vector3(0, 1, 0);

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export class PlayerController {
  constructor(camera, domElement, colliders) {
    this.camera = camera;
    this.domElement = domElement;
    this.colliders = colliders || [];

    this.mode = MODES.walk;
    this.position = new THREE.Vector3(0, this.mode.eyeHeight, 48);
    this.velocity = new THREE.Vector3();
    this.yaw = Math.PI;
    this.pitch = 0;
    this.locked = false;
    this.verticalVel = 0;
    this.onGround = true;

    /** 원하는 각속도 (rad/s), 매 프레임 한도로 클램프 후 적용하고 비움 */
    this._yawVel = 0;
    this._pitchVel = 0;

    this.camera.fov = LOOK.fovDefault;
    this.camera.updateProjectionMatrix();

    this.keys = new Set();
    this._onKeyDown = (e) => {
      if (e.target?.closest?.("input,textarea,select,[contenteditable=true]")) return;
      if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space"].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
      if (e.code === "Digit1") this.setMode("walk");
      if (e.code === "Digit2") this.setMode("bike");
      if (e.code === "Digit3") this.setMode("car");
      if (e.code === "Space" && this.mode.canJump && this.onGround) {
        this.verticalVel = 6.2;
        this.onGround = false;
      }
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onMouseMove = (e) => this.#onMouseMove(e);
    this._onWheel = (e) => this.#onWheel(e);
    this._onPointerLockChange = () => {
      this.locked = document.pointerLockElement === this.domElement;
      // 잠금 순간 잔여 입력 폐기
      this._yawVel = 0;
      this._pitchVel = 0;
      if (!this.locked) this.keys.clear();
      this.onLockChange?.(this.locked);
    };

    this._onBlur = () => { this.keys.clear(); this._yawVel = this._pitchVel = 0; };
    window.addEventListener("blur", this._onBlur);
    window.addEventListener("keydown", this._onKeyDown);
    window.addEventListener("keyup", this._onKeyUp);
    document.addEventListener("pointerlockchange", this._onPointerLockChange);
    this.domElement.addEventListener("mousemove", this._onMouseMove);
    this.domElement.addEventListener("wheel", this._onWheel, { passive: false });
  }

  setMode(id) {
    const next = MODES[id];
    if (!next) return;
    this.mode = next;
    this.position.y = next.eyeHeight;
    this.onModeChange?.(next);
  }

  setColliders(colliders) {
    this.colliders = colliders;
  }

  requestLock() {
    const result = this.domElement.requestPointerLock?.();
    result?.catch?.(() => this.onLockChange?.(false));
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  #onMouseMove(e) {
    // Unlocked canvas movement works immediately; pointer lock is optional, not a gate.
    // 프레임당 여러 mousemove가 올 수 있어 합산하되,
    // update에서 각속도 상한으로만 소비하고 나머지는 전부 폐기
    this._yawVel -= e.movementX * LOOK.yawGain * 60;
    this._pitchVel -= e.movementY * LOOK.pitchGain * 60;
  }

  #onWheel(e) {
    e.preventDefault();
    const dir = Math.sign(e.deltaY);
    this.camera.fov = clamp(
      this.camera.fov + dir * LOOK.zoomStep,
      LOOK.fovMin,
      LOOK.fovMax,
    );
    this.pitch = clampPitch(this.pitch, this.camera.fov);
    this.camera.updateProjectionMatrix();
  }

  #wishDir() {
    let forward = 0;
    let strafe = 0;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) forward += 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) forward -= 1;
    if (this.keys.has("KeyA")) strafe -= 1;
    if (this.keys.has("KeyD")) strafe += 1;

    const dir = new THREE.Vector3();
    if (!forward && !strafe) return dir;

    const forwardVec = new THREE.Vector3(
      -Math.sin(this.yaw),
      0,
      -Math.cos(this.yaw),
    );
    const rightVec = new THREE.Vector3().crossVectors(forwardVec, UP);

    dir.addScaledVector(forwardVec, forward);
    dir.addScaledVector(rightVec, strafe);
    if (dir.lengthSq() > 0) dir.normalize();
    return dir;
  }

  #resolveCollisions(nextX, nextZ, radius = 0.55) {
    return resolveMovement(this.position, {x:nextX,z:nextZ}, this.colliders, radius);
  }

  #applyLook(dt) {
    // 핵심: 요청 각속도를 한도로 자르고, 쓴 뒤 입력은 무조건 0으로 리셋
    const yawRate = clamp(this._yawVel, -LOOK.maxYawRate, LOOK.maxYawRate);
    const pitchRate = clamp(this._pitchVel, -LOOK.maxPitchRate, LOOK.maxPitchRate);
    this._yawVel = 0;
    this._pitchVel = 0;

    const turn = Number(this.keys.has("ArrowLeft")) - Number(this.keys.has("ArrowRight"));
    this.yaw += (yawRate + turn * LOOK.keyboardYawRate) * dt;
    this.pitch = clampPitch(this.pitch + pitchRate * dt, this.camera.fov);
  }

  update(dt) {
    this.#applyLook(dt);

    const mode = this.mode;
    const wish = this.#wishDir();
    const sprint =
      this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") ? 1.25 : 1;

    if (wish.lengthSq() > 0) {
      const speed = Math.min(Math.hypot(this.velocity.x,this.velocity.z) + mode.accel*sprint*dt, mode.maxSpeed*sprint);
      this.velocity.x = wish.x * speed;
      this.velocity.z = wish.z * speed;
    } else {
      const damp = Math.exp(-mode.friction * dt);
      this.velocity.x *= damp;
      this.velocity.z *= damp;
    }

    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    const max = mode.maxSpeed * sprint;
    if (speed > max) {
      const s = max / speed;
      this.velocity.x *= s;
      this.velocity.z *= s;
    }

    if (mode.canJump) {
      this.verticalVel -= 18 * dt;
      this.position.y += this.verticalVel * dt;
      if (this.position.y <= mode.eyeHeight) {
        this.position.y = mode.eyeHeight;
        this.verticalVel = 0;
        this.onGround = true;
      }
    } else {
      this.position.y = mode.eyeHeight;
      this.verticalVel = 0;
      this.onGround = true;
    }

    const nextX = this.position.x + this.velocity.x * dt;
    const nextZ = this.position.z + this.velocity.z * dt;
    const resolved = this.#resolveCollisions(nextX, nextZ);
    this.position.x = resolved.x;
    this.position.z = resolved.z;

    this.camera.position.copy(this.position);
    const look = new THREE.Vector3(
      this.position.x - Math.sin(this.yaw) * Math.cos(this.pitch),
      this.position.y + Math.sin(this.pitch),
      this.position.z - Math.cos(this.yaw) * Math.cos(this.pitch),
    );
    this.camera.lookAt(look);
  }

  getSpeedKmh() {
    return Math.hypot(this.velocity.x, this.velocity.z) * 3.6;
  }

  applyXrMove(forwardDir, rightDir, ax, ay, dt) {
    const speed = this.mode.maxSpeed;
    const nextX =
      this.position.x +
      forwardDir.x * -ay * speed * dt +
      rightDir.x * ax * speed * dt;
    const nextZ =
      this.position.z +
      forwardDir.z * -ay * speed * dt +
      rightDir.z * ax * speed * dt;
    const resolved = this.#resolveCollisions(nextX, nextZ);
    this.position.x = resolved.x;
    this.position.z = resolved.z;
    this.position.y = this.mode.eyeHeight;
    this.camera.position.copy(this.position);
  }

  dispose() {
    window.removeEventListener("blur", this._onBlur);
    window.removeEventListener("keydown", this._onKeyDown);
    window.removeEventListener("keyup", this._onKeyUp);
    document.removeEventListener("pointerlockchange", this._onPointerLockChange);
    this.domElement.removeEventListener("mousemove", this._onMouseMove);
    this.domElement.removeEventListener("wheel", this._onWheel);
  }
}
