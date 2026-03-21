import * as vscode from "vscode";
import type { WebviewHostMessage, ZipEditorControllerDeps } from "./zipEditorController";

export type ZipEditorTestOverrides = {
  listTimeoutMs?: number;
  nextOpenDialogPaths?: string[] | null;
  nextWarningChoice?: string | null;
};

export type ZipEditorTestState = {
  zipPath: string;
  html: string;
  sentMessages: unknown[];
  lastBinaryPreviewPath?: string;
};

type ActiveZipEditorTestSession = {
  owner: unknown;
  zipPath: string;
  getHtml: () => string;
  sentMessages: unknown[];
  lastBinaryPreviewPath?: string;
  handleMessage: (msg: WebviewHostMessage) => Promise<void>;
};

const zipEditorTestOverrides: ZipEditorTestOverrides = {};
let activeZipEditorTestSession: ActiveZipEditorTestSession | undefined;

export function setZipEditorTestOverrides(overrides: ZipEditorTestOverrides): void {
  if ("listTimeoutMs" in overrides) {
    if (overrides.listTimeoutMs == null) {
      delete zipEditorTestOverrides.listTimeoutMs;
    } else {
      zipEditorTestOverrides.listTimeoutMs = overrides.listTimeoutMs;
    }
  }

  if ("nextOpenDialogPaths" in overrides) {
    zipEditorTestOverrides.nextOpenDialogPaths = overrides.nextOpenDialogPaths;
  }

  if ("nextWarningChoice" in overrides) {
    zipEditorTestOverrides.nextWarningChoice = overrides.nextWarningChoice;
  }
}

export function getZipEditorTestListTimeoutMs(defaultTimeoutMs: number): number {
  return zipEditorTestOverrides.listTimeoutMs ?? defaultTimeoutMs;
}

export function resetZipEditorTestState(): void {
  delete zipEditorTestOverrides.listTimeoutMs;
  delete zipEditorTestOverrides.nextOpenDialogPaths;
  delete zipEditorTestOverrides.nextWarningChoice;
  activeZipEditorTestSession = undefined;
}

export function clearZipEditorTestMessages(): void {
  if (activeZipEditorTestSession) {
    activeZipEditorTestSession.sentMessages = [];
  }
}

export function getZipEditorTestState(): ZipEditorTestState | undefined {
  if (!activeZipEditorTestSession) {
    return undefined;
  }

  return {
    zipPath: activeZipEditorTestSession.zipPath,
    html: activeZipEditorTestSession.getHtml(),
    sentMessages: [...activeZipEditorTestSession.sentMessages],
    lastBinaryPreviewPath: activeZipEditorTestSession.lastBinaryPreviewPath,
  };
}

export async function dispatchZipEditorTestMessage(msg: WebviewHostMessage): Promise<void> {
  if (!activeZipEditorTestSession) {
    throw new Error("No active compress preview editor session");
  }

  await activeZipEditorTestSession.handleMessage(msg);
}

export function setActiveZipEditorTestSession(session: {
  owner: unknown;
  zipPath: string;
  getHtml: () => string;
  handleMessage: (msg: WebviewHostMessage) => Promise<void>;
}): void {
  activeZipEditorTestSession = {
    owner: session.owner,
    zipPath: session.zipPath,
    getHtml: session.getHtml,
    sentMessages: [],
    lastBinaryPreviewPath: undefined,
    handleMessage: session.handleMessage,
  };
}

export function clearActiveZipEditorTestSession(owner: unknown): void {
  if (activeZipEditorTestSession?.owner === owner) {
    activeZipEditorTestSession = undefined;
  }
}

export function captureZipEditorTestMessage(owner: unknown, message: unknown): void {
  const activeSession = activeZipEditorTestSession;
  if (!activeSession || activeSession.owner !== owner) {
    return;
  }

  activeSession.sentMessages.push(message);
}

export function setZipEditorTestBinaryPreviewPath(owner: unknown, previewPath: string): void {
  const activeSession = activeZipEditorTestSession;
  if (!activeSession || activeSession.owner !== owner) {
    return;
  }

  activeSession.lastBinaryPreviewPath = previewPath;
}

export function createZipEditorOpenDialogHandler(): ZipEditorControllerDeps["showOpenDialog"] {
  return async (options) => {
    if (zipEditorTestOverrides.nextOpenDialogPaths !== undefined) {
      const configuredPaths = zipEditorTestOverrides.nextOpenDialogPaths;
      zipEditorTestOverrides.nextOpenDialogPaths = undefined;
      return configuredPaths?.map((entryPath) => vscode.Uri.file(entryPath));
    }

    return vscode.window.showOpenDialog(options);
  };
}

export function createZipEditorWarningMessageHandler(): ZipEditorControllerDeps["showWarningMessage"] {
  return async (message, ...items) => {
    if (zipEditorTestOverrides.nextWarningChoice !== undefined) {
      const nextChoice = zipEditorTestOverrides.nextWarningChoice;
      zipEditorTestOverrides.nextWarningChoice = undefined;
      return nextChoice ?? undefined;
    }

    return vscode.window.showWarningMessage(message, ...items);
  };
}
