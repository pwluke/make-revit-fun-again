import * as THREE from "three";

/** Written every frame by Player. Nearby voxel colliders read this instead
 *  of the camera — the eye is lifted above the capsule, so using the camera
 *  as the origin starved the floor and stairs of the collider budget. */
export const playerOrigin = new THREE.Vector3();
