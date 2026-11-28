import {
  CommandType,
  CustomCommandExecutionError,
  ICommandService,
  LocaleType,
  LogLevel,
  Univer,
  UniverInstanceType,
} from "@univerjs/core";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import SheetsEnUS from "@univerjs/preset-sheets-core/locales/en-US";
import SheetsZhCN from "@univerjs/preset-sheets-core/locales/zh-CN";
import { defaultTheme, mergeLocales, type IPreset, type IPresetPlugin } from "@univerjs/presets";
import type {
  IUnitComparisonUniverInstance,
  UnitComparisonUniverFactory,
} from "@univerkit/diff-viewer";

function registerPresets(univer: Univer, presets: readonly IPreset[]): void {
  const pluginsByName = new Map<string, IPresetPlugin>();
  for (const preset of presets) {
    for (const plugin of preset.plugins) {
      const ctor = Array.isArray(plugin) ? plugin[0] : plugin;
      if (pluginsByName.has(ctor.pluginName)) {
        pluginsByName.delete(ctor.pluginName);
      }
      pluginsByName.set(ctor.pluginName, plugin);
    }
  }
  for (const plugin of pluginsByName.values()) {
    if (Array.isArray(plugin)) {
      univer.registerPlugin(plugin[0], plugin[1]);
    } else {
      univer.registerPlugin(plugin);
    }
  }
}

function blockEditingCommands(
  commandService: Pick<ICommandService, "beforeCommandExecuted">,
): void {
  commandService.beforeCommandExecuted((commandInfo, options) => {
    if (
      commandInfo.type === CommandType.MUTATION &&
      options?.fromCollab !== true &&
      options?.onlyLocal !== true
    ) {
      throw new CustomCommandExecutionError("Unit comparison viewer is read-only.");
    }
  });
}

export const createComparisonUniver: UnitComparisonUniverFactory = async (
  options,
): Promise<IUnitComparisonUniverInstance> => {
  if (options.unitType !== UniverInstanceType.UNIVER_SHEET) {
    throw new Error(`This basic example registers Sheet rendering only; got ${options.unitType}`);
  }

  options.container.id ||= `comparison-pane-${Math.random().toString(36).slice(2)}`;
  const localePack = options.locale === LocaleType.ZH_CN ? SheetsZhCN : SheetsEnUS;
  const univer = new Univer({
    locale: options.locale,
    locales: {
      [options.locale]: mergeLocales(localePack),
    },
    theme: defaultTheme,
    darkMode: options.darkMode,
    logLevel: LogLevel.WARN,
  });

  try {
    registerPresets(univer, [
      UniverSheetsCorePreset({
        container: options.container,
        header: false,
        toolbar: false,
        footer: false,
        formulaBar: false,
      }),
    ]);

    blockEditingCommands(univer.__getInjector().get(ICommandService));

    let disposed = false;
    return {
      univer,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        univer.dispose();
      },
    };
  } catch (error) {
    univer.dispose();
    throw error;
  }
};
