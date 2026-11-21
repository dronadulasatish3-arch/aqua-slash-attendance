// =======================================================
// AQUA SLASH — Face AI engine (face-api.js via CDN)
// Detection + 68-landmarks + 128-d descriptors + live liveness
// =======================================================

import { Employee } from "./backend";

const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/";

const fapi = () => (window as any).faceapi;

export async function waitForFaceApi(timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  while (!fapi()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Face AI library failed to load. Check your internet connection and retry.");
    }
    await new Promise((r) => setTimeout(r, 120));
  }
}

let modelsReady = false;

export async function loadModels(): Promise<void> {
  if (modelsReady) return;
  await waitForFaceApi();
  const faceapi = fapi();
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ]);
  modelsReady = true;
}

export function modelsLoaded(): boolean {
  return modelsReady;
}

export interface FaceDetection {
  descriptor: Float32Array;
  ear: number;
  noseRatioX: number; // nose tip position within face box (0..1)
  boxWidth: number;
}

function toDetection(det: any): FaceDetection {
  const leftEye = det.landmarks.getLeftEye();
  const rightEye = det.landmarks.getRightEye();
  const nose = det.landmarks.getNose();
  const box = det.detection.box;
  return {
    descriptor: det.descriptor,
    ear: (eyeAspectRatio(leftEye) + eyeAspectRatio(rightEye)) / 2,
    noseRatioX: (nose[3].x - box.x) / Math.max(1, box.width),
    boxWidth: box.width,
  };
}

export async function detectFromVideo(video: HTMLVideoElement): Promise<FaceDetection | null> {
  const faceapi = fapi();
  if (!faceapi || video.readyState < 2) return null;
  try {
    const det = await faceapi
      .detectSingleFace(
        video,
        new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.45 })
      )
      .withFaceLandmarks()
      .withFaceDescriptor();
    return det ? toDetection(det) : null;
  } catch {
    return null;
  }
}

export async function detectFromCanvas(canvas: HTMLCanvasElement): Promise<FaceDetection | null> {
  const faceapi = fapi();
  if (!faceapi) return null;
  try {
    const det = await faceapi
      .detectSingleFace(
        canvas,
        new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.45 })
      )
      .withFaceLandmarks()
      .withFaceDescriptor();
    return det ? toDetection(det) : null;
  } catch {
    return null;
  }
}

// Eye Aspect Ratio — measures eye openness across frames.
export function eyeAspectRatio(eye: { x: number; y: number }[]): number {
  const dist = (p1: { x: { valueOf(): number } & number; y: number }, p2: { x: number; y: number }) =>
    Math.hypot(p1.x - p2.x, p1.y - p2.y);
  const v1 = dist(eye[1], eye[5]);
  const v2 = dist(eye[2], eye[4]);
  const h = dist(eye[0], eye[3]);
  return (v1 + v2) / (2.0 * h);
}

/** L2 Euclidean distance between two 128-d face descriptors (checks live frame variance). */
export function descriptorDelta(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/** Capture a clean JPEG snapshot from the live <video> element for the circular portrait. */
export function captureVideoSnapshot(video: HTMLVideoElement): string | undefined {
  try {
    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;
    const scale = Math.min(1, 520 / Math.max(vw, vh));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(vw * scale);
    canvas.height = Math.round(vh * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.86);
  } catch {
    return undefined;
  }
}

export function buildLabeledMatcher(
  items: { label: string; descriptor: number[] }[],
  threshold = 0.52
): any | null {
  const faceapi = fapi();
  if (!faceapi || items.length === 0) return null;
  const labeled = items
    .filter((e) => e.descriptor && e.descriptor.length === 128)
    .map((e) => new faceapi.LabeledFaceDescriptors(e.label, [new Float32Array(e.descriptor)]));
  if (labeled.length === 0) return null;
  return new faceapi.FaceMatcher(labeled, threshold);
}

export function buildMatcher(employees: Employee[]): any | null {
  return buildLabeledMatcher(
    employees.map((e) => ({ label: e.phone, descriptor: e.descriptor }))
  );
}

export function confidenceFromDistance(distance: number): number {
  // In 128-d FaceNet space, 0.0–0.20 is ~99%, 0.35 is ~92%, 0.50 threshold is ~82%
  const conf = 100 - Math.max(0, distance - 0.12) * 45;
  return Math.max(75, Math.min(99, Math.round(conf)));
}
