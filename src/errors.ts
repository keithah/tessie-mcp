import axios from "axios";

export type McpError = {
  isError: true;
  message: string;
  status?: number;
  retriable?: boolean;
  details?: Record<string, unknown>;
  suggestion?: string;
};

function getSuggestionForStatus(status?: number) {
  if (!status) return "Retry or adjust parameters.";
  switch (status) {
    case 401:
      return "Check the Tessie API token.";
    case 404:
      return "Verify the VIN or resource exists.";
    case 429:
      return "Back off and retry after the server throttle window.";
    default:
      return "Retry or adjust parameters.";
  }
}

export function toMcpError(error: unknown, context: string): McpError {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const safeConfig = {
      url: error.config?.url,
      method: error.config?.method,
    };
    return {
      isError: true,
      status,
      message: error.message || "Request failed",
      retriable: status ? status >= 500 || status === 429 : true,
      suggestion: getSuggestionForStatus(status),
      details: {
        context,
        request: safeConfig,
        statusText: error.response?.statusText,
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
