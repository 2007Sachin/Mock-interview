/** Thin wrapper over MediaRecorder: start() asks for the mic, stop() resolves with the clip. */
export class Recorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];

  async start(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';
    this.chunks = [];
    this.mediaRecorder = new MediaRecorder(stream, { mimeType });
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.mediaRecorder.start();
  }

  stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const recorder = this.mediaRecorder;
      if (!recorder) {
        reject(new Error('Recorder was not started'));
        return;
      }
      recorder.onstop = () => {
        recorder.stream.getTracks().forEach((track) => track.stop());
        this.mediaRecorder = null;
        resolve(new Blob(this.chunks, { type: recorder.mimeType || 'audio/webm' }));
      };
      recorder.stop();
    });
  }

  cancel(): void {
    if (!this.mediaRecorder) return;
    this.mediaRecorder.stream.getTracks().forEach((track) => track.stop());
    this.mediaRecorder = null;
    this.chunks = [];
  }
}
