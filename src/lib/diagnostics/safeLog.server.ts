import "server-only";

type DiagnosticKind = "postgrest" | "auth" | "network" | "unknown";

interface SafeDiagnostic {
  operation: string;
  kind: DiagnosticKind;
  code: string | null;
  status: number | null;
  name: string | null;
  message: string | null;
}

function getNetworkMessage(error: Error): string | null {
  const text = `${error.name} ${error.message}`.toLowerCase();

  if (error.name === "AbortError" || text.includes("aborterror")) {
    return "aborted";
  }
  if (text.includes("timed out") || text.includes("timeout")) {
    return "timeout";
  }
  if (text.includes("failed to fetch") || text.includes("fetch failed")) {
    return "failed_to_fetch";
  }
  if (text.includes("network request failed")) {
    return "network_request_failed";
  }
  return null;
}

function classifyError(error: unknown): { kind: DiagnosticKind; networkMessage: string | null } {
  if (error && typeof error === "object" && "status" in error && "name" in error) {
    const name = (error as { name?: unknown }).name;
    if (typeof name === "string" && name.toLowerCase().includes("auth")) {
      return { kind: "auth", networkMessage: null };
    }
  }

  if (error instanceof Error) {
    const networkMessage = getNetworkMessage(error);
    if (networkMessage) {
      return { kind: "network", networkMessage };
    }
  }

  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  ) {
    return { kind: "postgrest", networkMessage: null };
  }

  return { kind: "unknown", networkMessage: null };
}

export function logSafeDiagnostic(operation: string, error: unknown): void {
  const { kind, networkMessage } = classifyError(error);

  const code =
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code
      : null;

  const status =
    error &&
    typeof error === "object" &&
    "status" in error &&
    typeof (error as { status?: unknown }).status === "number"
      ? (error as { status: number }).status
      : null;

  const name = error instanceof Error ? error.name : null;

  const diagnostic: SafeDiagnostic = {
    operation,
    kind,
    code,
    status,
    name,
    message: kind === "network" ? networkMessage : null,
  };
  console.error(`[diagnostics] ${operation} failed`, diagnostic);
}