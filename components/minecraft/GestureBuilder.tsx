import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useGestureStore } from "../gesture/store";
import { useCubeStore } from "./Cube";

// Blocks can only be placed within reach, like holding a block in front of
// you. The lower bound skips the axe model that floats ~1m from the camera.
const MIN_REACH = 1.6;
const MAX_REACH = 9;

const raycaster = new THREE.Raycaster();
const screenCenter = new THREE.Vector2(0, 0);
const worldPos = new THREE.Vector3();
const instanceMatrix = new THREE.Matrix4();

/**
 * Centre of the block that was hit. Instanced meshes (the house) carry the
 * per-cube transform in the instance matrix — the object's own world
 * position is the batch origin, not the cube.
 */
export function hitBlockCenter(hit: THREE.Intersection, out: THREE.Vector3) {
  const mesh = hit.object as THREE.InstancedMesh;
  if (mesh.isInstancedMesh && hit.instanceId != null) {
    mesh.getMatrixAt(hit.instanceId, instanceMatrix);
    out.setFromMatrixPosition(instanceMatrix).applyMatrix4(mesh.matrixWorld);
  } else {
    mesh.getWorldPosition(out);
  }
  return out;
}

/**
 * Consumes queued "build" gestures: raycasts from the crosshair and places a
 * cube on whatever face it hits — mirroring the mouse-click placement in
 * Cube.tsx, plus ground placement snapped to the block grid.
 */
export function GestureBuilder() {
  const addCube = useCubeStore((state) => state.addCube);
  const { camera, scene } = useThree();
  useFrame(() => {
    if (!useGestureStore.getState().consumeBuild()) return;
    raycaster.setFromCamera(screenCenter, camera);
    const hit = raycaster
      .intersectObjects(scene.children, true)
      .find(
        (h) =>
          h.distance > MIN_REACH &&
          h.distance < MAX_REACH &&
          (h.object as THREE.Mesh).isMesh,
      );
    if (!hit || !hit.face) return;
    const mesh = hit.object as THREE.Mesh;
    if (mesh.geometry.type === "PlaneGeometry") {
      // Ground: snap to the integer grid the cubes live on.
      addCube(Math.round(hit.point.x), 0.5, Math.round(hit.point.z));
    } else if (mesh.geometry.type === "BoxGeometry") {
      // Cube or house block: place against the hit face, same as the
      // mouse-click path in Cube.tsx.
      hitBlockCenter(hit, worldPos);
      const n = hit.face.normal.clone().transformDirection(mesh.matrixWorld);
      addCube(
        worldPos.x + Math.round(n.x),
        worldPos.y + Math.round(n.y),
        worldPos.z + Math.round(n.z),
      );
    }
  });
  return null;
}
