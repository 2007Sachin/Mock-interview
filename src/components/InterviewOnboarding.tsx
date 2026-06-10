import { useEffect, useRef } from 'react';
import { useDeviceReadiness } from '@/hooks/useDeviceReadiness';
import { env } from '@/lib/env';
import { INTERVIEWER_NAME } from '@/lib/interviewer';

type StepStatus = 'pending' | 'pass' | 'fail' | 'skipped';

function StepIcon({ status }: { status: StepStatus }) {
  if (status === 'pass') {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-400/20 text-emerald-300">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M2 7l3.5 3.5L12 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }

  if (status === 'fail') {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-400/20 text-rose-300">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </span>
    );
  }

  if (status === 'skipped') {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-400/20 text-amber-300 text-xs font-bold">
        ~
      </span>
    );
  }

  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/20 text-slate-400 text-xs">
      •
    </span>
  );
}

function MicLevelMeter({ level }: { level: number }) {
  const bars = 12;
  return (
    <div className="flex items-end gap-0.5 h-8">
      {Array.from({ length: bars }, (_, i) => {
        const threshold = ((i + 1) / bars) * 100;
        const active = level >= threshold;
        return (
          <div
            key={i}
            className={`w-2 rounded-sm transition-all duration-75 ${active ? 'bg-emerald-400' : 'bg-white/10'}`}
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
  const speakerStatus: StepStatus = device.speakerTestPassed
    ? 'pass'
    : 'pending';

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
    <div className="mx-auto max-w-xl space-y-8 px-4 py-10">
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
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
          <div className="flex items-center gap-3">
            <StepIcon status={micStatus} />
            <div className="flex-1">
              <p className="font-medium text-white text-sm">Microphone</p>
              {device.micAllowed && (
                <p className="text-xs text-emerald-300 mt-0.5">Granted — speak to test your mic level</p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <StepIcon status={cameraStatus} />
              <p className="text-sm text-slate-300">Camera</p>
            </div>
          </div>

          {device.micAllowed && (
            <div className="space-y-2">
              <p className="text-xs text-slate-400 uppercase tracking-wider">Mic level</p>
              <MicLevelMeter level={device.micLevel} />
            </div>
          )}

          {device.cameraStream && (
            <div className="space-y-2">
              <p className="text-xs text-slate-400 uppercase tracking-wider">Camera preview</p>
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="w-full rounded-xl aspect-video bg-black object-cover border border-white/10"
              />
            </div>
          )}

          {device.errors.mic && (
            <div className="rounded-xl border border-rose-300/30 bg-rose-300/10 px-4 py-3 text-sm text-rose-100 space-y-1">
              <p className="font-semibold">Microphone access denied</p>
              <p>{device.errors.mic}</p>
              <p className="text-xs text-rose-200 mt-1">
                In Chrome: click the lock icon in the address bar → Site settings → Microphone → Allow.
                <br />
                In Firefox: click the camera/mic icon in the address bar → Allow.
                <br />
                In Safari: Safari menu → Settings for This Website → Microphone → Allow.
              </p>
            </div>
          )}

          {device.errors.camera && !device.errors.mic && (
            <div className="rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
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
              className="w-full rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950 disabled:opacity-60"
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
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3">
            <div className="flex items-center gap-3">
              <StepIcon status={speakerStatus} />
              <div className="flex-1">
                <p className="font-medium text-white text-sm">Speaker / Headphones</p>
                {device.speakerTestPassed && (
                  <p className="text-xs text-emerald-300 mt-0.5">Test passed</p>
                )}
              </div>
            </div>

            {showSpeakerStep && !device.speakerTestPassed && (
              <button
                type="button"
                onClick={() => {
                  void device.runSpeakerTest();
                }}
                className="w-full rounded-2xl border border-white/20 px-4 py-3 text-sm font-medium text-white hover:bg-white/10"
              >
                Play speaker test tone
              </button>
            )}
          </div>
        )}

        {/* Step 3 — Service readiness */}
        {(device.speakerTestPassed || device.state === 'ready') && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-2">
            <div className="flex items-center gap-3">
              <StepIcon status={serviceStatus} />
              <div>
                <p className="font-medium text-white text-sm">Voice service</p>
                <p className="text-xs text-slate-400 mt-0.5">
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
          className="w-full rounded-[2rem] bg-accent px-6 py-4 text-base font-semibold text-accent-contrast transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
        >
          Continue — meet your interviewer
        </button>

        {!device.micAllowed && device.state !== 'idle' && device.state !== 'requesting_permissions' && (
          <p className="text-center text-xs text-slate-400">
            Microphone access is required to start the interview.
          </p>
        )}

        {device.micAllowed && !device.speakerTestPassed && (
          <p className="text-center text-xs text-slate-400">
            Please complete the speaker test above to continue.
          </p>
        )}
      </div>

      {/* Debug / fallback note for development */}
      {env.voiceAgentProvider === 'browser' && (
        <p className="text-center text-xs text-slate-500">
          Running in browser fallback mode. Production uses Pipecat + Groq + Kokoro.
        </p>
      )}
    </div>
  );
}
