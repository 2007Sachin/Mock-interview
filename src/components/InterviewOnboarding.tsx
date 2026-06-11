import { useEffect, useRef } from 'react';
import { buttonStyles } from '@/components/VoiceCallUI';
import { useDeviceReadiness } from '@/hooks/useDeviceReadiness';
import { env } from '@/lib/env';
import { INTERVIEWER_NAME } from '@/lib/interviewer';

type StepStatus = 'pending' | 'pass' | 'fail' | 'skipped';

function StepIcon({ status }: { status: StepStatus }) {
  if (status === 'pass') {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/20 text-accent-strong">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M2 7l3.5 3.5L12 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }

  if (status === 'fail') {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-danger/20 text-danger">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </span>
    );
  }

  if (status === 'skipped') {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-warning/20 text-xs font-bold text-warning">
        ~
      </span>
    );
  }

  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-edge/40 text-xs text-ink-secondary">
      •
    </span>
  );
}

function MicLevelMeter({ level }: { level: number }) {
  const bars = 12;
  return (
    <div className="flex h-8 items-end gap-0.5">
      {Array.from({ length: bars }, (_, i) => {
        const threshold = ((i + 1) / bars) * 100;
        const active = level >= threshold;
        return (
          <div
            key={i}
            className={`w-2 rounded-sm transition-colors duration-75 ${active ? 'bg-accent' : 'bg-surface-raised'}`}
            style={{ height: `${30 + i * 3}%` }}
          />
        );
      })}
    </div>
  );
}

export function InterviewOnboarding({ onComplete }: { onComplete: () => void }) {
  const device = useDeviceReadiness();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Attach camera stream to video element when available
  useEffect(() => {
    if (videoRef.current && device.cameraStream) {
      videoRef.current.srcObject = device.cameraStream;
    }
  }, [device.cameraStream]);

  const micStatus: StepStatus = device.micAllowed ? 'pass' : device.errors.mic ? 'fail' : 'pending';
  const cameraStatus: StepStatus = device.cameraAllowed
    ? 'pass'
    : device.errors.camera
      ? 'skipped'
      : 'pending';
  const speakerStatus: StepStatus = device.speakerTestPassed ? 'pass' : 'pending';

  const isServiceStep =
    device.state === 'speaker_test_passed' ||
    device.state === 'voice_service_checking' ||
    device.state === 'ready';

  const serviceStatus: StepStatus = device.state === 'ready' ? 'pass' : isServiceStep ? 'pass' : 'pending';

  const canStart =
    device.micAllowed &&
    device.speakerTestPassed &&
    (device.state === 'speaker_test_passed' || device.state === 'ready');

  const showPermissionStep =
    device.state === 'idle' ||
    device.state === 'requesting_permissions' ||
    device.state === 'failed';

  const showSpeakerStep =
    device.state === 'speaker_test_pending' ||
    device.state === 'speaker_test_passed' ||
    device.state === 'ready';

  return (
    <div className="stagger-children mx-auto max-w-xl space-y-8 px-4 py-10">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.4em] text-accent">Joining your interview</p>
        <h2 className="text-2xl font-bold text-ink">Let's get your mic and speakers ready</h2>
        <p className="text-sm text-ink-secondary">
          You're moments away from meeting {INTERVIEWER_NAME}. We need microphone access so
          {' '}{INTERVIEWER_NAME} can hear your answers — this stays local, and nothing is recorded
          without your knowledge.
        </p>
      </div>

      <div className="space-y-3">
        {/* Step 1 — Microphone + Camera */}
        <div className="space-y-4 rounded-2xl border border-edge/30 bg-surface p-5">
          <div className="flex items-center gap-3">
            <StepIcon status={micStatus} />
            <div className="flex-1">
              <p className="text-sm font-medium text-ink">Microphone</p>
              {device.micAllowed && (
                <p className="mt-0.5 text-xs text-accent-strong">Granted — speak to test your mic level</p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <StepIcon status={cameraStatus} />
              <p className="text-sm text-ink-secondary">Camera</p>
            </div>
          </div>

          {device.micAllowed && (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wider text-ink-secondary">Mic level</p>
              <MicLevelMeter level={device.micLevel} />
            </div>
          )}

          {device.cameraStream && (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wider text-ink-secondary">Camera preview</p>
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="aspect-video w-full rounded-xl border border-edge/30 bg-black object-cover"
              />
            </div>
          )}

          {device.errors.mic && (
            <div className="space-y-1 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
              <p className="font-semibold">Microphone access denied</p>
              <p>{device.errors.mic}</p>
              <p className="mt-1 text-xs text-danger/80">
                In Chrome: click the lock icon in the address bar → Site settings → Microphone → Allow.
                <br />
                In Firefox: click the camera/mic icon in the address bar → Allow.
                <br />
                In Safari: Safari menu → Settings for This Website → Microphone → Allow.
              </p>
            </div>
          )}

          {device.errors.camera && !device.errors.mic && (
            <div className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
              <p className="font-semibold">Camera access denied</p>
              <p>{device.errors.camera}</p>
            </div>
          )}

          {showPermissionStep && (
            <button
              type="button"
              onClick={() => {
                void device.requestPermissions();
              }}
              disabled={device.state === 'requesting_permissions'}
              className={`w-full py-3 ${buttonStyles.primary}`}
            >
              {device.state === 'requesting_permissions'
                ? 'Requesting access…'
                : device.state === 'failed'
                  ? 'Retry permissions'
                  : 'Allow microphone and camera'}
            </button>
          )}
        </div>

        {/* Step 2 — Speaker test */}
        {(device.state !== 'idle' &&
          device.state !== 'requesting_permissions' &&
          !device.errors.mic) && (
          <div className="space-y-3 rounded-2xl border border-edge/30 bg-surface p-5">
            <div className="flex items-center gap-3">
              <StepIcon status={speakerStatus} />
              <div className="flex-1">
                <p className="text-sm font-medium text-ink">Speaker / Headphones</p>
                {device.speakerTestPassed && (
                  <p className="mt-0.5 text-xs text-accent-strong">Test passed</p>
                )}
              </div>
            </div>

            {showSpeakerStep && !device.speakerTestPassed && (
              <button
                type="button"
                onClick={() => {
                  void device.runSpeakerTest();
                }}
                className={`w-full justify-center py-3 ${buttonStyles.secondary}`}
              >
                Play speaker test tone
              </button>
            )}
          </div>
        )}

        {/* Step 3 — Service readiness */}
        {(device.speakerTestPassed || device.state === 'ready') && (
          <div className="space-y-2 rounded-2xl border border-edge/30 bg-surface p-5">
            <div className="flex items-center gap-3">
              <StepIcon status={serviceStatus} />
              <div>
                <p className="text-sm font-medium text-ink">Voice service</p>
                <p className="mt-0.5 text-xs text-ink-secondary">
                  {env.voiceAgentProvider === 'pipecat'
                    ? 'Pipecat mode — connection will be established when you start'
                    : 'Browser fallback mode ready'}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Start Interview */}
      <div className="space-y-3">
        <button
          type="button"
          disabled={!canStart}
          onClick={() => {
            device.markReady();
            onComplete();
          }}
          className="btn-press w-full rounded-[2rem] bg-accent px-6 py-4 text-base font-semibold text-accent-contrast hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
        >
          Continue — meet your interviewer
        </button>

        {!device.micAllowed && device.state !== 'idle' && device.state !== 'requesting_permissions' && (
          <p className="text-center text-xs text-ink-secondary">
            Microphone access is required to start the interview.
          </p>
        )}

        {device.micAllowed && !device.speakerTestPassed && (
          <p className="text-center text-xs text-ink-secondary">
            Please complete the speaker test above to continue.
          </p>
        )}
      </div>

      {/* Fallback note for development */}
      {env.voiceAgentProvider === 'browser' && (
        <p className="text-center text-xs text-ink-muted">
          Running in browser fallback mode. Production uses Pipecat + Groq + Kokoro.
        </p>
      )}
    </div>
  );
}
