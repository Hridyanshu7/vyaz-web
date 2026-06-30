import os
from line.llm_agent import LlmAgent, LlmConfig, knowledge_base, http_server_tool

mark_section_complete = http_server_tool(
    name="mark_section_complete",
    description="Call this silently after finishing narrating each section. Required: session_id (string) and section_number (integer).",
    url="https://tvoxkhqwbhbomskthjeq.supabase.co/functions/v1/cartesia-tool",
    method="POST",
    request_body_schema={
        "type": "object",
        "required": ["session_id", "section_number"],
        "properties": {
            "session_id": {
                "type": "string",
                "description": "The session ID provided in your instructions."
            },
            "section_number": {
                "type": "integer",
                "description": "The number of the section you just finished narrating."
            },
        },
    },
    timeout=10.0,
)

agent = LlmAgent(
    model="anthropic/claude-haiku-4-5-20251001",
    api_key=os.getenv("ANTHROPIC_API_KEY"),
    tools=[
        knowledge_base(),
        mark_section_complete,
    ],
    config=LlmConfig(
        system_prompt="You are a helpful narrator. Your full instructions will be provided at the start of each session.",
    ),
)
