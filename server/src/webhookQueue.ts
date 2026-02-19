import { WEBHOOK_RETRY_INTERVAL_MS } from "./config.js";
import { getPendingDeliveries, updateDeliveryStatus } from "./db.js";
import { logger } from "./logger.js";

// Retry delays in milliseconds
const RETRY_DELAYS = [60_000, 300_000, 900_000, 3_600_000];

/**
 * Calculate next retry timestamp based on number of attempts
 * Returns null if max retries exceeded (5+)
 */
function getNextRetryAt(attempts: number): number | null {
  if (attempts >= 5) return null; // dead
  const delay = RETRY_DELAYS[attempts - 1] ?? RETRY_DELAYS[RETRY_DELAYS.length - 1]!;
  return Date.now() + delay;
}

/**
 * Process pending webhook deliveries
 * Attempts to deliver each pending webhook via HTTP POST
 */
export async function processQueue(): Promise<void> {
  const now = Date.now();
  const deliveries = getPendingDeliveries(now);

  if (deliveries.length === 0) {
    return;
  }

  logger.info({ event: "webhook_queue_processing", count: deliveries.length });

  for (const delivery of deliveries) {
    try {
      // Parse payload
      const payload = JSON.parse(delivery.payload);

      // POST to callback URL with 5-second timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch(delivery.callback_url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          // Success: mark as delivered (no retry needed)
          updateDeliveryStatus(delivery.id, "delivered", null, 0);
          logger.info({ event: "webhook_delivered", deliveryId: delivery.id, url: delivery.callback_url });
        } else {
          // HTTP error: retry
          const errorMsg = `HTTP ${response.status} ${response.statusText}`;
          const nextRetry = getNextRetryAt(delivery.attempts + 1);

          if (nextRetry === null) {
            // Max retries exceeded
            updateDeliveryStatus(delivery.id, "dead", errorMsg, 0);
            logger.error({ event: "webhook_dead", deliveryId: delivery.id, attempts: delivery.attempts + 1, error: errorMsg });
          } else {
            // Schedule retry
            updateDeliveryStatus(delivery.id, "pending", errorMsg, nextRetry);
            logger.warn({ event: "webhook_retry", deliveryId: delivery.id, attempt: delivery.attempts + 1, error: errorMsg, nextRetry: new Date(nextRetry).toISOString() });
          }
        }
      } catch (fetchError) {
        clearTimeout(timeoutId);

        // Network or timeout error: retry
        const errorMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
        const nextRetry = getNextRetryAt(delivery.attempts + 1);

        if (nextRetry === null) {
          // Max retries exceeded
          updateDeliveryStatus(delivery.id, "dead", errorMsg, 0);
          logger.error({ event: "webhook_dead", deliveryId: delivery.id, attempts: delivery.attempts + 1, error: errorMsg });
        } else {
          // Schedule retry
          updateDeliveryStatus(delivery.id, "pending", errorMsg, nextRetry);
          logger.warn({ event: "webhook_retry", deliveryId: delivery.id, attempt: delivery.attempts + 1, error: errorMsg, nextRetry: new Date(nextRetry).toISOString() });
        }
      }
    } catch (error) {
      // Error parsing payload or other unexpected error
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error({ event: "webhook_processing_error", deliveryId: delivery.id, error: errorMsg });

      // Mark as dead (cannot recover from payload parse errors)
      updateDeliveryStatus(delivery.id, "dead", errorMsg, 0);
    }
  }
}

/**
 * Start the webhook queue processor
 * Processes pending deliveries on an interval
 */
export function startWebhookQueue(): void {
  logger.info({ event: "webhook_queue_started" });

  // Process immediately, then on interval
  processQueue().catch((err) => {
    logger.error({ event: "webhook_queue_error", error: err instanceof Error ? err.message : String(err) });
  });

  setInterval(() => {
    processQueue().catch((err) => {
      logger.error({ event: "webhook_queue_error", error: err instanceof Error ? err.message : String(err) });
    });
  }, WEBHOOK_RETRY_INTERVAL_MS);
}
