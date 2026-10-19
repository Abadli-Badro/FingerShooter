import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import type { Landmark } from './gestures';

const WASM_PATH = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

/**
 * Owns the webcam + MediaPipe HandLandmarker. Call `poll()` once per frame;
 * returns the first hand's landmarks in raw image space, or null.
 */
export class HandTracker {
  private landmarker: HandLandmarker | null = null;
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement;
  private lastVideoTime = -1;
  private lastLandmarks: Landmark[] | null = null;

  constructor() {
    this.video = document.getElementById('cam') as HTMLVideoElement;
  }

  /** Request camera + load model. Throws on failure (caller offers mouse mode). */
  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 960 },
        height: { ideal: 540 },
        facingMode: 'user',
      },
      audio: false,
    });
    this.video.srcObject = this.stream;
    await this.video.play();
    await this.loadLandmarker('GPU');
  }

  private async loadLandmarker(delegate: 'GPU' | 'CPU'): Promise<void> {
    const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
    try {
      this.landmarker = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: 'VIDEO',
        numHands: 1,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    } catch {
      if (delegate === 'GPU') return this.loadLandmarker('CPU');
      throw new Error('Could not initialise hand tracking.');
    }
  }

  /** Runs detection when a new camera frame is available; cached otherwise. */
  poll(): Landmark[] | null {
    if (!this.landmarker || this.video.readyState < 2) return this.lastLandmarks;
    if (this.video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = this.video.currentTime;
      const result = this.landmarker.detectForVideo(this.video, performance.now());
      const hand = result.landmarks?.[0];
      this.lastLandmarks = hand ? (hand as unknown as Landmark[]) : null;
    }
    return this.lastLandmarks;
  }

  getStream(): MediaStream | null {
    return this.stream;
  }

  stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.landmarker?.close();
    this.landmarker = null;
    this.lastVideoTime = -1;
    this.lastLandmarks = null;
  }
}
