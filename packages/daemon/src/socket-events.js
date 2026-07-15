/**
 * Local copy of the daemon socket event names.
 *
 * Inlined (instead of imported from @flotila-org/shared) so the daemon package
 * is fully self-contained and can be installed directly from GitHub via
 * `npx github:<owner>/<repo>/packages/daemon` with no npm registry dependency.
 *
 * Keep this in sync with packages/shared/src/constants.js → DAEMON_SOCKET_EVENTS.
 */
export const DAEMON_SOCKET_EVENTS = {
  // server -> daemon
  RUN_DISPATCH: 'run.dispatch',
  RUN_CANCEL: 'run.cancel',
  APPROVAL_DECISION: 'approval.decision',
  AGENT_SYNC: 'agent.sync',
  // daemon -> server
  RUN_EVENT: 'run.event',
  RUN_MESSAGE: 'run.message',
  RUN_FINISHED: 'run.finished',
  AGENT_REGISTER: 'agent.register',
  COMPUTER_INFO: 'computer.info',
};
