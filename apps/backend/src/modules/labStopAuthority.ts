/** Shared by the stop transaction and an independent, autocommit heartbeat.
 * Never retain the shared advisory lock inside the long product transaction.
 * https://www.postgresql.org/docs/18/functions-admin.html#FUNCTIONS-ADVISORY-LOCKS
 */
export const labStopAuthorityKeySQL = "hashtextextended('talent_signal.lab_stop:' || $1::text, 0)";
