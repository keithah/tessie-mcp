import axios from "axios";

export type McpError = {
  isError: true;
  message: string;
  status?: number;
  retriable?: boolean;
  details?: Record<string, unknown>;
  suggestion?: string;
};

export function toMcpError(error: unknown, context: string): McpError {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    return {
      isError: true,
      status,
      message: error.message || "Request failed",
      retriable: status ? status >= 500 || status === 429 : true,
      suggestion: status === 401
        ? "Check the Tessie API token."
        : status === 404
          ? "Verify the VIN or resource exists."
          : status === 429
            ? "Back off and retry after the server throttle window."
            : "Retry or adjust parameters.",
      details: {
        context,
        url: error.config?.url,
        method: error.config?.method,
        data: error.response?.data,
      },
    };
  }

  if (error instanceof Error) {
    return {
      isError: true,
      message: error.message,
      retriable: false,
      suggestion: "Retry the action or check inputs.",
      details: { context },
    };
  }

  return {
    isError: true,
    message: "Unknown error",
    retriable: false,
    details: { context },
  };
}
