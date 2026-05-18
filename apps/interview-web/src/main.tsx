import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import Editor from "@monaco-editor/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot,
  CheckCircle2,
  Code2,
  Cpu,
  Headphones,
  Lock,
  Mic,
  MicOff,
  PlugZap,
  Radio,
  RefreshCw,
  Shield,
  Sparkles,
  Timer,
  Volume2,
  Zap,
} from "lucide-react";
import { PipecatClient, type BotOutputData, type TranscriptData, type UICommandData } from "@pipecat-ai/client-js";
import { WebSocketTransport } from "@pipecat-ai/websocket-transport";
import "./styles.css";

type TranscriptSpeaker = "candidate" | "interviewer" | "system";

type TranscriptMessage = {
  speaker: TranscriptSpeaker;
  text: string;
  stage_id?: string;
};

type StageProgress = {
  current_stage_id: string;
  current_stage_title: string;
  stage_sequence: number;
  total_stages: number;
  remaining_seconds: number;
};

type WorkspacePayload = {
  stage_id: string;
  workspace_type: "coding" | "case_study" | "system_design";
  title: string;
  instructions?: string;
  starter_code?: string;
  code?: string;
  answer_markdown?: string;
  timer_seconds: number;
};

type VoiceSession = {
  voice_session_token: string;
  voice_session_id: string;
  transport: { join_url: string };
};

type TranscriptRestoreSegment = {
  speaker: TranscriptSpeaker;
  text: string;
  stage_id?: string;
};

type UICommandPayload = Partial<StageProgress & WorkspacePayload> & {
  speaker?: TranscriptSpeaker;
  text?: string;
  segments?: TranscriptRestoreSegment[];
  overall_score?: number;
  summary?: string;
};

const voiceBaseUrl = import.meta.env.VITE_VOICE_AGENT_URL ?? "http://localhost:8020";

const stages = [
  "Resume Deep Dive",
  "Role Competency",
  "Applied Workspace",
  "Behavioral Closing",
];

function mockInterviewIdFromPath() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  return parts[1] ?? "mock_iv_demo";
}

function WaveformCanvas({ level, botSpeaking }: { level: number; botSpeaking: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const phaseRef = useRef(0);

  useEffect(() => {
    let frame = 0;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const draw = () => {
      const ratio = window.devicePixelRatio || 1;
      const width = canvas.clientWidth * ratio;
      const height = canvas.clientHeight * ratio;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      phaseRef.current += botSpeaking ? 0.08 : 0.045;
      context.clearRect(0, 0, width, height);
      context.lineWidth = 3 * ratio;
      context.lineCap = "round";

      const amplitude = Math.max(0.08, level) * height * (botSpeaking ? 0.38 : 0.28);
      const center = height / 2;

      ["rgba(88,101,242,0.95)", "rgba(186,188,217,0.45)", "rgba(87,242,135,0.38)"].forEach((stroke, layer) => {
        context.beginPath();
        context.strokeStyle = stroke;
        for (let x = 0; x <= width; x += 6 * ratio) {
          const y =
            center +
            Math.sin(x / (42 * ratio) + phaseRef.current + layer * 0.8) *
              amplitude *
              (1 - layer * 0.22);
          if (x === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.stroke();
      });

      frame = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(frame);
  }, [botSpeaking, level]);

  return <canvas className="waveform-canvas" ref={canvasRef} aria-label="Realtime audio waveform" />;
}

function App() {
  const mockInterviewId = useMemo(mockInterviewIdFromPath, []);
  const [accessCode, setAccessCode] = useState("");
  const [session, setSession] = useState<VoiceSession | null>(null);
  const [status, setStatus] = useState("Awaiting access code");
  const [isLive, setIsLive] = useState(false);
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [isBotSpeaking, setIsBotSpeaking] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [messages, setMessages] = useState<TranscriptMessage[]>([
    { speaker: "system", text: "Access code required. Once validated, the realtime Pipecat room will open with voice, transcript, workspace, and reconnect recovery." },
  ]);
  const [stageProgress, setStageProgress] = useState<StageProgress | null>(null);
  const [workspace, setWorkspace] = useState<WorkspacePayload | null>(null);
  const [workspaceText, setWorkspaceText] = useState("");
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const clientRef = useRef<PipecatClient | null>(null);

  async function validateCode() {
    setStatus("Validating secure access...");
    const response = await fetch(`${voiceBaseUrl}/v1/sessions/validate-access-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mock_interview_id: mockInterviewId,
        access_code: accessCode,
        client: {
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          browser: navigator.userAgent,
          audio_supported: Boolean(navigator.mediaDevices?.getUserMedia),
          workspace_supported: true,
        },
      }),
    });

    if (!response.ok) {
      setStatus("Access failed. Check Career Engine, Voice Agent, Redis, and the access code.");
      return;
    }

    const payload = await response.json() as { data: VoiceSession };
    setSession(payload.data);
    setStatus("Access granted. Start the realtime interview.");
  }

  function handleUICommand(data: UICommandData) {
    const command = data.command;
    const payload = data.payload as UICommandPayload;
    if (command === "stage_progress") setStageProgress(payload as StageProgress);
    if (command === "transcript_update" && payload.speaker && payload.text) {
      setMessages((current) => [...current, { speaker: payload.speaker!, text: payload.text!, stage_id: payload.stage_id }]);
    }
    if (command === "transcript_restore") {
      const restored = (payload.segments ?? []).map((segment) => ({
        speaker: segment.speaker,
        text: segment.text,
        stage_id: segment.stage_id,
      }));
      if (restored.length) setMessages(restored);
    }
    if (command === "open_workspace" || command === "workspace_state_sync") {
      if (payload?.stage_id) {
        setWorkspace(payload as WorkspacePayload);
        setWorkspaceText(payload.starter_code ?? payload.code ?? payload.answer_markdown ?? "");
      }
    }
    if (command === "close_workspace") setWorkspace(null);
    if (command === "scoring_complete" || command === "interview_completed") setReport(payload);
    if (command === "interview_started") setStatus("Interview runtime started");
  }

  async function connectRealtime() {
    if (!session) return;
    setStatus("Requesting microphone and connecting RTVI...");
    const client = new PipecatClient({
      transport: new WebSocketTransport(),
      enableMic: true,
      enableCam: false,
      callbacks: {
        onConnected: () => {
          setIsLive(true);
          setStatus("Live Pipecat interview connected");
        },
        onDisconnected: () => {
          setIsLive(false);
          setStatus("Realtime connection closed");
        },
        onTransportStateChanged: (state) => setStatus(`Transport ${state}`),
        onBotReady: () => setStatus("AI interviewer ready. Speak naturally."),
        onBotStartedSpeaking: () => setIsBotSpeaking(true),
        onBotStoppedSpeaking: () => setIsBotSpeaking(false),
        onLocalAudioLevel: (level) => setAudioLevel(level),
        onUserTranscript: (data: TranscriptData) => {
          if (data.final && data.text.trim()) {
            setMessages((current) => [...current, { speaker: "candidate", text: data.text }]);
          }
        },
        onBotOutput: (data: BotOutputData) => {
          if (data.text?.trim()) {
            setMessages((current) => [...current, { speaker: "interviewer", text: data.text }]);
          }
        },
        onUICommand: handleUICommand,
        onError: (message) => setMessages((current) => [...current, { speaker: "system", text: JSON.stringify(message) }]),
      },
    });

    clientRef.current = client;
    await client.initDevices();
    await client.connect({ wsUrl: session.transport.join_url });
  }

  async function reconnectRealtime() {
    if (!session) return;
    setIsReconnecting(true);
    setStatus("Rejoining interview session...");
    const response = await fetch(`${voiceBaseUrl}/v1/sessions/${session.voice_session_id}/reconnect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voice_session_token: session.voice_session_token }),
    });

    if (response.ok) {
      const payload = await response.json() as {
        data: {
          transcript?: TranscriptRestoreSegment[];
          workspace?: WorkspacePayload;
          state?: { progress?: StageProgress };
        };
      };
      if (payload.data.transcript?.length) setMessages(payload.data.transcript);
      if (payload.data.workspace?.stage_id) {
        setWorkspace(payload.data.workspace);
        setWorkspaceText(payload.data.workspace.starter_code ?? payload.data.workspace.code ?? payload.data.workspace.answer_markdown ?? "");
      }
      if (payload.data.state?.progress) setStageProgress(payload.data.state.progress);
    }

    setTimeout(() => setIsReconnecting(false), 900);
    await connectRealtime();
  }

  function toggleMic() {
    const next = !isMicEnabled;
    clientRef.current?.enableMic(next);
    setIsMicEnabled(next);
  }

  async function disconnect() {
    await clientRef.current?.disconnect();
    clientRef.current = null;
  }

  function submitWorkspace() {
    if (!workspace) return;
    clientRef.current?.sendUIEvent("workspace_submitted", {
      stage_id: workspace.stage_id,
      workspace_type: workspace.workspace_type,
      code: workspace.workspace_type === "coding" ? workspaceText : undefined,
      answer_markdown: workspace.workspace_type !== "coding" ? workspaceText : undefined,
      language: "typescript",
      elapsed_seconds: 420,
      run_results: { passed: 0, failed: 0, logs: ["Submitted through RTVI UI event"] },
    });
  }

  const activeStage = stageProgress?.stage_sequence ?? 0;

  return (
    <main className="cosmic-shell">
      <div className="stars" />
      <div className="aurora aurora-one" />
      <div className="aurora aurora-two" />
      <motion.nav className="nav-bar" initial={{ y: -24, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
        <div className="brand-mark"><Sparkles size={18} /> Lumina Interview Arena</div>
        <div className="nav-links">
          <span>RTVI</span>
          <span>Voice</span>
          <span>Workspace</span>
          <span>Scorecard</span>
        </div>
        <button className="login-pill"><Shield size={16} /> Secure Session</button>
      </motion.nav>

      <section className="hero">
        <motion.div className="hero-copy" initial={{ x: -40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 80 }}>
          <p className="eyebrow">Pipecat Runtime + RTVI + Voice Workspace</p>
          <h1>ENTER THE AI INTERVIEW UNIVERSE</h1>
          <p>
            A cinematic realtime arena for voice interviews, live captions, staged reasoning,
            collaborative coding, transcript recovery, and AI scorecards.
          </p>
          <div className="access-dock">
            <Lock size={18} />
            <input value={accessCode} onChange={(event) => setAccessCode(event.target.value)} placeholder="Enter access code, e.g. LUMA-4829" />
            <button className="primary-cta" onClick={validateCode}>Start Interview</button>
          </div>
          <div className="cta-row">
            <button className="secondary-cta" disabled={!session || isLive} onClick={connectRealtime}><Mic size={17} /> Connect Mic</button>
            <button className="ghost-cta" disabled={!session} onClick={reconnectRealtime}><RefreshCw size={17} /> Reconnect</button>
          </div>
        </motion.div>

        <motion.div className="hologram-stage" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.15 }}>
          <div className="floating-prop prop-one">◆</div>
          <div className="floating-prop prop-two">✦</div>
          <div className="scene-mascot mascot-left">
            <span className="mascot-eye" />
            <span className="mascot-eye" />
            <strong>AI</strong>
          </div>
          <div className="scene-mascot mascot-right">
            <span className="mascot-eye" />
            <span className="mascot-eye" />
            <strong>GO</strong>
          </div>
          <div className="device-mockup desktop-frame">
            <div className="mock-sidebar">
              <span />
              <span />
              <span />
              <span />
            </div>
            <div className="mock-content">
              <div className="mock-bar" />
              <div className="mock-line wide-line" />
              <div className="mock-line" />
              <div className="mock-transcript">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
          <div className="phone-mockup">
            <span />
            <strong>{activeStage || 1}/4</strong>
            <em>stage sync</em>
          </div>
          <div className={`interviewer-orb ${isBotSpeaking ? "speaking" : ""}`}>
            <div className="orb-ring ring-one" />
            <div className="orb-ring ring-two" />
            <Bot size={74} />
          </div>
          <WaveformCanvas level={audioLevel} botSpeaking={isBotSpeaking} />
          <div className="holo-status">
            <StatusTile icon={<Radio />} label="RTVI" value={isLive ? "streaming" : "ready"} />
            <StatusTile icon={<Cpu />} label="Providers" value="Whisper / Mistral / Kokoro" />
            <StatusTile icon={<Zap />} label="Interruption" value={isBotSpeaking ? "listening for barge-in" : "armed"} />
          </div>
        </motion.div>
      </section>

      <section className="arena-grid">
        <aside className="stage-rail cinematic-card">
          <div className="section-label">Interview Stages</div>
          {stages.map((stage, index) => (
            <motion.div
              className={`stage-node ${activeStage === index + 1 ? "active" : activeStage > index + 1 ? "complete" : ""}`}
              key={stage}
              initial={{ x: -16, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: index * 0.08 }}
            >
              <CheckCircle2 size={17} />
              <span>{stage}</span>
            </motion.div>
          ))}
          <div className="timer-card">
            <Timer size={18} />
            <span>{stageProgress ? `${stageProgress.remaining_seconds}s remaining` : "Timer sync pending"}</span>
          </div>
        </aside>

        <section className="voice-room cinematic-card">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Live Session</p>
              <h2>{stageProgress?.current_stage_title ?? mockInterviewId}</h2>
            </div>
            <div className={`live-pill ${isLive ? "online" : ""}`}><PlugZap size={16} /> {status}</div>
          </div>

          <div className="voice-console">
            <button className="primary-cta compact" disabled={!isLive} onClick={toggleMic}>
              {isMicEnabled ? <Mic size={16} /> : <MicOff size={16} />} {isMicEnabled ? "Mute" : "Unmute"}
            </button>
            <button className="secondary-cta compact" disabled={!isLive} onClick={disconnect}>Disconnect</button>
            <div className="energy-bars">
              {Array.from({ length: 22 }).map((_, index) => (
                <span key={index} style={{ height: `${12 + Math.max(0.04, audioLevel) * 74 * ((index % 7) + 1) / 7}px` }} />
              ))}
            </div>
            <div className="speaker-pill"><Volume2 size={16} /> {isBotSpeaking ? "AI speaking" : "AI listening"}</div>
          </div>

          {stageProgress && (
            <motion.div className="progress-card" layout>
              <span>{stageProgress.current_stage_title}</span>
              <strong>{stageProgress.stage_sequence}/{stageProgress.total_stages}</strong>
              <em>{stageProgress.remaining_seconds}s</em>
            </motion.div>
          )}

          <div className="transcript">
            <AnimatePresence initial={false}>
              {messages.map((message, index) => (
                <motion.div
                  className={`bubble ${message.speaker}`}
                  key={`${message.speaker}-${index}-${message.text.slice(0, 8)}`}
                  initial={{ y: 18, opacity: 0, filter: "blur(10px)" }}
                  animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
                  exit={{ opacity: 0 }}
                >
                  <span>{message.speaker}</span>
                  <p>{message.text}</p>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </section>

        <aside className="workspace-panel cinematic-card">
          <div className="panel-header small">
            <Code2 size={19} />
            <h2>{workspace?.title ?? "Workspace Locked"}</h2>
          </div>
          <p>{workspace?.instructions ?? "Stage 3 will unlock a coding, system design, or case workspace. Reconnect hydration restores this panel automatically."}</p>
          <div className={`editor-frame ${workspace ? "unlocked" : "locked"}`}>
            <Editor
              height="360px"
              defaultLanguage={workspace?.workspace_type === "coding" ? "typescript" : "markdown"}
              language={workspace?.workspace_type === "coding" ? "typescript" : "markdown"}
              theme="vs-dark"
              value={workspaceText}
              onChange={(value) => setWorkspaceText(value ?? "")}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                fontFamily: "Cascadia Code, JetBrains Mono, monospace",
                wordWrap: "on",
                padding: { top: 18 },
                readOnly: !workspace,
              }}
            />
          </div>
          <button className="primary-cta wide" disabled={!workspace || !isLive} onClick={submitWorkspace}>Submit Workspace</button>
          {report && (
            <motion.div className="report-card" initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
              <Headphones size={18} />
              <strong>Final score: {String(report.overall_score ?? "pending")}</strong>
              <p>{String(report.summary ?? "")}</p>
            </motion.div>
          )}
        </aside>
      </section>

      <AnimatePresence>
        {isReconnecting && (
          <motion.div className="reconnect-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="reconnect-card" initial={{ scale: 0.88, y: 20 }} animate={{ scale: 1, y: 0 }}>
              <RefreshCw className="spin" size={38} />
              <h2>REJOINING INTERVIEW SESSION...</h2>
              <p>Restoring transcript, current stage, workspace state, and realtime transport.</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

function StatusTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="status-tile">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
