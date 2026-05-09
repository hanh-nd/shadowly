import { Hono } from "hono";
import { cors } from "hono/cors";
import type { ContentfulStatusCode } from "hono/utils/http-status";

type Env = {
  GROQ_API_KEY: string;
  MODAL_URL: string;
  INFERENCE_KEY: string;
  INFERENCE_SECRET: string;
};

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors());

app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

interface GroqWord {
  word: string;
  start: number;
  end: number;
}

interface GroqResponse {
  text: string;
  words?: GroqWord[];
}

app.post("/transcribe", async (c) => {
  const formData = await c.req.formData();
  const audioFile = formData.get("audio_file");

  if (!audioFile || typeof audioFile === "string") {
    return c.json({ error: "audio_file is required" }, 400);
  }

  const groqFormData = new FormData();
  groqFormData.append("file", audioFile);
  groqFormData.append("model", "whisper-large-v3-turbo");
  groqFormData.append("response_format", "verbose_json");
  groqFormData.append("timestamp_granularities[]", "word");

  try {
    const response = await fetch(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${c.env.GROQ_API_KEY}`,
        },
        body: groqFormData,
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      return c.json(
        { error: `Groq API error: ${errorText}` },
        response.status as ContentfulStatusCode,
      );
    }

    const data = (await response.json()) as GroqResponse;

    const wordTimestamps = (data.words || []).map((w) => ({
      word: w.word,
      start: w.start,
      end: w.end,
    }));

    return c.json({
      text: data.text,
      wordTimestamps,
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Internal Server Error";
    return c.json({ error: errorMessage }, 500);
  }
});

app.post("/score", async (c) => {
  const formData = await c.req.formData();
  const audioFile = formData.get("audio_file");

  if (!audioFile || typeof audioFile === "string") {
    return c.json({ error: "audio_file is required" }, 400);
  }

  const modalFormData = new FormData();
  modalFormData.append("audio_file", audioFile);

  try {
    const response = await fetch(`${c.env.MODAL_URL}/score`, {
      method: "POST",
      headers: {
        "X-Shadowly-Key": c.env.INFERENCE_KEY,
        "X-Shadowly-Secret": c.env.INFERENCE_SECRET,
      },
      body: modalFormData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return c.json(
        { error: `Modal API error: ${errorText}` },
        response.status as ContentfulStatusCode,
      );
    }

    const data = await response.json();
    return c.json(data);
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Internal Server Error";
    return c.json({ error: errorMessage }, 500);
  }
});

export default app;
