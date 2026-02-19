/** Response from GET /health */
export type HealthResponse = {
  status: 'ok' | 'degraded';
  uptime: number;
  database: string;
  indexerLastPoll: string;
  indexerLagSeconds: number;
  fundCount: number;
  apiKeyCount: number;
};

/** Generic API error response */
export type ApiError = {
  error: string;
};
