import {
  CollaborationStatus,
  type IUniverCollaborationClientConfig,
} from "@univerjs-pro/collaboration-client";
import { BrowserCollaborationSocketService } from "@univerjs-pro/collaboration-client-ui";

export function collaborationConfig(): IUniverCollaborationClientConfig {
  const base = `${location.origin}/universer-api`;
  return {
    socketService: BrowserCollaborationSocketService,
    sendChangesetTimeout: 200,
    enableSingleActiveInstanceLock: false,
    enableAuthServer: false,
    snapshotServerUrl: `${base}/snapshot`,
    collabSubmitChangesetUrl: `${base}/comb`,
    collabWebSocketUrl: `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/universer-api/comb/connect`,
    wsSessionTicketUrl: `${base}/user/session-ticket`,
    authzUrl: `${base}/authz`,
  };
}

export function statusText(states: CollaborationStatus[]) {
  if (states.every((state) => state === CollaborationStatus.SYNCED)) return "All changes saved";
  if (states.includes(CollaborationStatus.OFFLINE)) return "Offline · changes pending";
  if (states.includes(CollaborationStatus.CONFLICT)) return "Sync conflict";
  return "Saving…";
}
