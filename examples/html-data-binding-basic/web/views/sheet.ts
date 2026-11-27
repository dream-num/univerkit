import { collaborationConfig } from "../config.js";
import { LocaleType, LogLevel } from "@univerjs/core";
import { UniverCollaborationPlugin } from "@univerjs-pro/collaboration";
import {
  CollaborationStatus,
  UniverCollaborationClientPlugin,
} from "@univerjs-pro/collaboration-client";
import CollaborationEnUS from "@univerjs-pro/collaboration-client/locale/en-US";
import { UniverCollaborationClientUIPlugin } from "@univerjs-pro/collaboration-client-ui";
import CollaborationUIEnUS from "@univerjs-pro/collaboration-client-ui/locale/en-US";
import { UniverLicensePlugin } from "@univerjs-pro/license";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import SheetsEnUS from "@univerjs/preset-sheets-core/locales/en-US";
import { createUniver, defaultTheme, mergeLocales } from "@univerjs/presets";
import "@univerjs-pro/collaboration-client/facade";
import "@univerjs/preset-sheets-core/lib/index.css";
import "@univerjs-pro/collaboration-client-ui/lib/index.css";

export async function openSheet(
  container: HTMLElement,
  unitId: string,
  onStatus: (states: CollaborationStatus[]) => void,
) {
  const { univer, univerAPI } = createUniver({
    locale: LocaleType.EN_US,
    locales: {
      [LocaleType.EN_US]: mergeLocales(SheetsEnUS, CollaborationEnUS, CollaborationUIEnUS),
    },
    theme: defaultTheme,
    logLevel: LogLevel.WARN,
    collaboration: true,
    presets: [UniverSheetsCorePreset({ container })],
    plugins: [
      [UniverLicensePlugin, { license: import.meta.env.UNIVER_LICENSE || undefined }],
      UniverCollaborationPlugin,
      [UniverCollaborationClientPlugin, collaborationConfig()],
      UniverCollaborationClientUIPlugin,
    ],
  });
  try {
    const subscription = univerAPI.addEvent(univerAPI.Event.CollaborationStatusChanged, (event) => {
      if (event.unitId === unitId) onStatus([event.status]);
    });
    await univerAPI.getCollaboration().loadSheetAsync(unitId);
    onStatus([univerAPI.getCollaboration().getCollaborationStatus(unitId)]);
    return {
      api: univerAPI,
      flush: () => univerAPI.getCollaboration().flush(unitId),
      hasPendingChanges: () =>
        univerAPI.getCollaboration().getCollaborationStatus(unitId) !== CollaborationStatus.SYNCED,
      dispose() {
        subscription.dispose();
        univer.dispose();
      },
    };
  } catch (error) {
    univer.dispose();
    throw error;
  }
}
