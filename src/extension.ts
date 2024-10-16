import * as vscode from "vscode";
import * as path from "path";
import player from "play-sound";

const debugMode = false;

let audio: any;
let isPlaying = false;
let volume = 0.5;
let assistanceDelay = 0.8;

let threshold = 0;
let last = 0;
let endSongTimeout: NodeJS.Timeout | undefined;

// Create an output channel for logging
let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
  // Initialize the output channel
  if (debugMode) {
    outputChannel = vscode.window.createOutputChannel("BetterUndo");
    outputChannel.show();
  }

  log("BetterUndo extension activated");

  const soundFilePath = path.join(
    context.extensionPath,
    "dist",
    "yakety-sax.mp3"
  );
  log(`Sound file path: ${soundFilePath}`);

  // Read initial volume setting
  updateSettings();

  // Listen for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration("betterundo.volume") ||
        event.affectsConfiguration("betterundo.assistanceDelay")
      ) {
        updateSettings();
      }
    })
  );

  // volume command
  context.subscriptions.push(
    vscode.commands.registerCommand("betterundo.setVolume", async () => {
      const result = await vscode.window.showInputBox({
        prompt: "Enter volume (0-1)",
        placeHolder: "e.g., 0.5",
      });
      if (result !== undefined) {
        const newVolume = parseFloat(result);
        if (!isNaN(newVolume)) {
          let newVol = Math.max(0, Math.min(1, newVolume));
          await vscode.workspace
            .getConfiguration()
            .update(
              "betterundo.volume",
              newVol,
              vscode.ConfigurationTarget.Global
            );
          vscode.window.showInformationMessage(
            `BetterUndo volume set to ${newVol}`
          );
        } else {
          vscode.window.showErrorMessage(
            "Invalid volume. Please enter a number between 0 and 1."
          );
        }
      }
    })
  );

  // assistance delay command
  context.subscriptions.push(
    vscode.commands.registerCommand("betterundo.setDelay", async () => {
      const result = await vscode.window.showInputBox({
        prompt: "Enter assistance delay (in seconds) - max 5 - ",
        placeHolder: "0.3 is recommended / default",
      });
      if (result !== undefined) {
        const newDelay = parseFloat(result);
        if (!isNaN(newDelay)) {
          let delay = Math.max(0, Math.min(5, newDelay));
          await vscode.workspace
            .getConfiguration()
            .update(
              "betterundo.assistanceDelay",
              delay,
              vscode.ConfigurationTarget.Global
            );
          vscode.window.showInformationMessage(
            `BetterUndo assistance delay set to ${delay} seconds`
          );
        } else {
          vscode.window.showErrorMessage(
            "Invalid delay. Please enter a non-negative number."
          );
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("betterundo.undoPressed", async (event: vscode.TextDocumentChangeEvent) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return; // No active editor
      }

      const document = editor.document;
      const initialVersion = document.version;

      await vscode.commands.executeCommand("undo");

      // Check if the document actually changed
      const documentChanged = document.version !== initialVersion;

      if (documentChanged) {
        if (threshold < 0) {
          threshold = 0;
        }
        if (last === 0) {
          last = Date.now();
        }
        const timeDiff = Date.now() - last;
        threshold += timeDiff;
       
        log((threshold) + ' >= ' + (assistanceDelay * 1000) + ' : ' + (threshold >= assistanceDelay * 1000));

        if (threshold >= assistanceDelay * 1000) {
          if (!isPlaying) {
            isPlaying = true;
            playSound(soundFilePath);
          }
        }

        if (endSongTimeout) {
          clearTimeout(endSongTimeout);
        }
        endSongTimeout = setTimeout(()=> {
          stopPlaying();
        }, 200);
      }
      // doccument not changed
      else {
        if (isPlaying) {
          stopPlaying();
        }
        threshold = 0;
        last = 0;
      }

    })
  );
}

function stopPlaying() {
  stopSound();
  isPlaying = false;
  threshold = 0;
  last = 0;
  log("~~~~~~~~~~~~~~~~~~~~~ STOP SONG ~~~~~~~~~~~~~~~~~~~~~");
}

function updateSettings() {
  const config = vscode.workspace.getConfiguration("betterundo");
  volume = config.get("volume", 0.5);
  assistanceDelay = config.get("assistanceDelay", 0.8);
  log(`Volume updated to: ${volume}`);
  log(
    `Assistance delay updated to: ${assistanceDelay} seconds`
  );
}

function playSound(filePath: string) {
  log("~~~~~~~~~~~~~~~~~~~~~ START SONG ~~~~~~~~~~~~~~~~~~~~~");

  log(`Attempting to play sound: ${filePath}`);
  const soundPlayer = player();

  const volumePercent = volume * 0.25;
  log(
    `about to play with: Math.round(${volume} * 10) volume: ${volumePercent}`
  );
  const playerOptions = ["-v", volumePercent.toString()];

  audio = soundPlayer.play(filePath, { afplay: playerOptions }, (err) => {
    if (err) {
      log(`Error playing sound: ${err}`);
      vscode.window.showErrorMessage(`Failed to play sound: ${err}`);
    } else {
      log("Sound played successfully");
    }
  });
}

function stopSound() {
  log("Stopping sound");
  if (audio && typeof audio.kill === "function") {
    audio.kill();
    audio = null;
    log("Sound stopped");
  }
}

export function deactivate() {
  log("BetterUndo extension deactivated");
  if (isPlaying) {
    stopSound();
  }
}

function log(msg: string, force: boolean = false) {
  if (!debugMode && !force) {
    return undefined;
  };
  if (debugMode || force) {
    outputChannel.appendLine(msg);
  }
  return undefined;
}
