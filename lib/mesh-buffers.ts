import * as THREE from "three";

function decodeBase64(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export function decodeFloat32(b64: string): Float32Array {
  return new Float32Array(decodeBase64(b64));
}

export function decodeUint32(b64: string): Uint32Array {
  return new Uint32Array(decodeBase64(b64));
}

export type StreamedMeshBuffers = {
  verticesB64?: string | null;
  normalsB64?: string | null;
  facesB64?: string | null;
};

export function geometryFromMesh(mesh: StreamedMeshBuffers): THREE.BufferGeometry | null {
  if (!mesh.verticesB64 || !mesh.facesB64) return null;

  try {
    const positions = decodeFloat32(mesh.verticesB64);
    const indices = decodeUint32(mesh.facesB64);
    if (positions.length < 3 || indices.length < 3) return null;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));

    if (mesh.normalsB64) {
      const normals = decodeFloat32(mesh.normalsB64);
      if (normals.length === positions.length) {
        geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
      } else {
        geometry.computeVertexNormals();
      }
    } else {
      geometry.computeVertexNormals();
    }

    geometry.computeBoundingSphere();
    return geometry;
  } catch {
    return null;
  }
}

/** Near-black Rhino colors disappear under studio lighting; lift them so the mass still reads. */
export function readableMeshColor(hex?: string | null): string {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return "#9ca3af";
  const value = parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  if (r + g + b < 48) return "#6b7280";
  return hex;
}
