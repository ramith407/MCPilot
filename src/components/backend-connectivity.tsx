"use client";

import { useState } from "react";

type CheckState = "idle" | "loading" | "success" | "error";

interface HealthResponse {
  status: string;
}

interface TestResponse {
  message: string;
  response: string;
}

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_MCPILOT_API_URL ?? "http://127.0.0.1:8000"
).replace(/\/+$/, "");

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}.`);
  }
  return response.json() as Promise<T>;
}

export function BackendConnectivity() {
  const [message, setMessage] = useState("Hello from MCPilot");
  const [state, setState] = useState<CheckState>("idle");
  const [result, setResult] = useState("");

  const checkBackend = async () => {
    setState("loading");
    setResult("");

    try {
      const healthResponse = await fetch(`${API_BASE_URL}/api/health`, {
        cache: "no-store",
      });
      const health = await readJson<HealthResponse>(healthResponse);
      if (health.status !== "ok") {
        throw new Error("Backend health check returned an unexpected status.");
      }

      const testResponse = await fetch(`${API_BASE_URL}/api/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
        cache: "no-store",
      });
      const testResult = await readJson<TestResponse>(testResponse);
      setResult(testResult.response);
      setState("success");
    } catch (error) {
      setResult(
        error instanceof TypeError
          ? `Could not reach the local backend at ${API_BASE_URL}. Start it using the development setup guide.`
          : error instanceof Error
            ? error.message
            : "The backend connectivity check failed.",
      );
      setState("error");
    }
  };

  return (
    <section
      className="mx-auto my-2 flex w-full max-w-[1260px] flex-col gap-3 rounded-lg border border-[#e6e9ef] bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
      aria-labelledby="backend-check-heading"
    >
      <div className="min-w-0 flex-1">
        <h2 id="backend-check-heading" className="text-sm font-semibold text-[#182230]">
          Local backend connection
        </h2>
        <p className="mt-1 text-xs text-[#697586]">
          Calls the FastAPI health and message endpoints.
        </p>
        <label className="sr-only" htmlFor="backend-check-message">
          Message to send to the backend
        </label>
        <input
          id="backend-check-message"
          className="mt-3 w-full max-w-md rounded-md border border-[#e6e9ef] px-3 py-2 text-sm text-[#182230] outline-none focus:border-[#315cff]"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={500}
          placeholder="Message to send"
        />
      </div>
      <div className="flex flex-col items-start gap-2 sm:items-end">
        <button
          type="button"
          className="inline-flex min-h-10 items-center justify-center rounded-md bg-[#315cff] px-4 text-sm font-semibold text-white transition hover:bg-[#244be0] disabled:cursor-not-allowed disabled:opacity-60"
          onClick={checkBackend}
          disabled={state === "loading" || !message.trim()}
        >
          {state === "loading" ? "Checking…" : "Check backend"}
        </button>
        <p
          className={`min-h-4 text-xs ${state === "error" ? "text-[#d94848]" : state === "success" ? "text-[#15966b]" : "text-[#697586]"}`}
          role={state === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          {state === "idle" && "Backend status has not been checked."}
          {state === "loading" && "Contacting the local backend…"}
          {state === "success" && result}
          {state === "error" && result}
        </p>
      </div>
    </section>
  );
}
