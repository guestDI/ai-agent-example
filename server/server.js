import Fastify from "fastify";
import cors from "@fastify/cors";
import fetch from "node-fetch";
import fastifyEnv from "@fastify/env";

const fastify = Fastify({ logger: true });

const schema = {
  type: 'object',
  required: ['OPENAI_API_KEY'],
  properties: {
    OPENAI_API_KEY: {
      type: 'string'
    },
  }
}

const options = {
  confKey: 'config',
  schema,
  dotenv: true,
  data: process.env
}

await fastify.register(cors, { origin: true });
await fastify.register(fastifyEnv, options)

const openAPIKey = encodeURIComponent(fastify.config.OPENAI_API_KEY)
if (!openAPIKey) {
  throw new Error("Missing OPENAI_API_KEY env var");
}

// --- Dictionary with coordinates ---
const CITY_COORDS = {
  wroclaw: { lat: 51.1079, lon: 17.0385 },
  warsaw: { lat: 52.2297, lon: 21.0122 },
  krakow: { lat: 50.0647, lon: 19.9450 },
  gdansk: { lat: 54.3520, lon: 18.6466 },
  berlin: { lat: 52.5200, lon: 13.4050 },
  paris: { lat: 48.8566, lon: 2.3522 },
  rome: { lat: 41.9028, lon: 12.4964 },
  london: { lat: 51.5074, lon: -0.1278 },
};

// Helper
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// --- Local "tool": call Open-Meteo ---
async function getWeather({ city }) {
  const key = (city || "").trim().toLowerCase();
  const coords = CITY_COORDS[key];
  if (!coords) {
    return `I don't know coordinates for "${city}". Try: Wroclaw, Warsaw, Krakow, Gdansk, Berlin, Paris, Rome, London.`;
  }

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&daily=temperature_2m_min,temperature_2m_max,weathercode&timezone=auto&forecast_days=7`;

  const res = await fetch(url);
  if (!res.ok) {
    return `Failed to fetch weather for ${cap(city)} (HTTP ${res.status}).`;
  }
  const data = await res.json();

  // Get arrays with dates and temperatures
  const time = data?.daily?.time || [];
  const tmin = data?.daily?.temperature_2m_min || [];
  const tmax = data?.daily?.temperature_2m_max || [];

  if (!time.length) {
    return `No forecast data available for ${cap(city)}.`;
  }

  const lines = time.map((date, i) => {
    const lo = tmin[i];
    const hi = tmax[i];
    return `${date}: min ${lo}°C, max ${hi}°C`;
  });

  return `7-day forecast for ${cap(city)}:\n` + lines.join("\n");
}

// --- Main endpoint ---
fastify.post("/agent", async (req, reply) => {
  try {
    const { message } = req.body || {};
    if (!message) {
      return reply.code(400).send({ error: "message is required" });
    }

    // 1) First call: model decides, if "tool" is needed
    const first = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAPIKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a helpful assistant. If the user asks about the weather in a city, call the getWeather function.",
          },
          { role: "user", content: message },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "getWeather",
              description: "Get a 7-day daily forecast for a city (°C).",
              parameters: {
                type: "object",
                properties: {
                  city: {
                    type: "string",
                    description:
                      "City name in English or common transliteration (e.g., Wroclaw, Warsaw, Berlin).",
                  },
                },
                required: ["city"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: "auto",
      }),
    }).then((r) => r.json());

    const firstMsg = first?.choices?.[0]?.message;

    // Check if model decided to call a "tool"
    const toolCalls = firstMsg?.tool_calls || [];
    if (toolCalls.length > 0) {
      const toolMessages = [];

      // Execute all called functions
      for (const call of toolCalls) {
        if (call?.function?.name === "getWeather") {
          let args = {};
          try {
            args = JSON.parse(call.function.arguments || "{}");
          } catch {}
          const result = await getWeather(args);

          // Add answer from a "tool" to a list of messages
          toolMessages.push({
            role: "tool",
            tool_call_id: call.id,
            content: result,
          });
        }
      }

      // 2) Second call: give a result from "tool" to a model, to create final result
      const second = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openAPIKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "You are a helpful assistant. When tools are used, compose a concise final answer for the user.",
            },
            { role: "user", content: message },
            firstMsg, // message from model with a tool
            ...toolMessages, // results of getWeather
          ],
        }),
      }).then((r) => r.json());

      const answer = second?.choices?.[0]?.message?.content || "";
      return reply.send({ answer });
    }

    // General response
    const fallback = firstMsg?.content || "";
    return reply.send({ answer: fallback });
  } catch (err) {
    req.log.error(err);
    return reply.code(500).send({ error: "internal_error" });
  }
});

fastify.listen({ port: 3001, host: "0.0.0.0" }, () => {
  fastify.log.info("Server running on http://localhost:3001");
});
