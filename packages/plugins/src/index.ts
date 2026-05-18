export interface PluginAction {
  id: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
}

export interface RuntimePlugin {
  id: string;
  name: string;
  version: string;
  description: string;
  capabilities: string[];
  actions: PluginAction[];
}

export const corePlugins: RuntimePlugin[] = [
  {
    id: "career-engine",
    name: "Career Engine",
    version: "0.1.0",
    description: "Role matching, resume/JD context, interview planning, scorecards, reports.",
    capabilities: ["role_search", "resume_generation", "mock_interview_records", "scorecard_persistence"],
    actions: [
      {
        id: "create_mock_interview",
        description: "Create a staged mock interview with access code and bootstrap plan.",
        inputSchema: { type: "object", required: ["student_id", "selected_role", "resume", "job"] },
        outputSchema: { type: "object", required: ["mock_interview_id", "access_code", "session_link"] },
      },
      {
        id: "validate_access_code",
        description: "Validate a human-entered access code and return a voice bootstrap payload.",
        inputSchema: { type: "object", required: ["mock_interview_id", "access_code"] },
        outputSchema: { type: "object", required: ["voice_session_token", "bootstrap"] },
      },
    ],
  },
  {
    id: "pipecat-runtime",
    name: "Pipecat Runtime",
    version: "0.1.0",
    description: "Realtime frame pipeline, STT/LLM/TTS orchestration, RTVI commands, metrics.",
    capabilities: ["frame_pipeline", "rtvi", "interruption_handling", "multimodal_streaming"],
    actions: [
      {
        id: "start_pipeline_task",
        description: "Start a voice interview pipeline from a signed bootstrap payload.",
        inputSchema: { type: "object", required: ["voice_session_token"] },
        outputSchema: { type: "object", required: ["session_id", "transport"] },
      },
    ],
  },
  {
    id: "workspace-bridge",
    name: "Workspace Bridge",
    version: "0.1.0",
    description: "Frontend coding/case-study collaboration and submission events.",
    capabilities: ["open_workspace", "workspace_submit", "workspace_reconnect"],
    actions: [
      {
        id: "open_workspace",
        description: "Emit a UI command to open a coding/case workspace.",
        inputSchema: { type: "object", required: ["stage_id", "workspace_type"] },
        outputSchema: { type: "object", required: ["command", "payload"] },
      },
    ],
  },
];

export class PluginRegistry {
  private readonly plugins = new Map<string, RuntimePlugin>();

  constructor(seed: RuntimePlugin[] = corePlugins) {
    seed.forEach((plugin) => this.register(plugin));
  }

  register(plugin: RuntimePlugin) {
    this.plugins.set(plugin.id, plugin);
  }

  discover(capability?: string) {
    const all = [...this.plugins.values()];
    return capability ? all.filter((plugin) => plugin.capabilities.includes(capability)) : all;
  }

  actions() {
    return [...this.plugins.values()].flatMap((plugin) =>
      plugin.actions.map((action) => ({
        plugin_id: plugin.id,
        plugin_name: plugin.name,
        ...action,
      })),
    );
  }
}
