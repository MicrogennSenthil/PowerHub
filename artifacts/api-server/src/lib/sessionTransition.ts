/**
 * A real process event replaces an open session only when its configured
 * process identity differs. Commands without process context (for example a
 * manual dashboard ON) must not erase a guest's current Checkin/Visiting
 * session.
 */
export function shouldReplaceOpenSession(
  existingProcessTypeId: number | null,
  incomingProcessTypeId: number | null,
  hasIncomingProcess: boolean,
): boolean {
  return (
    hasIncomingProcess &&
    existingProcessTypeId !== incomingProcessTypeId
  );
}