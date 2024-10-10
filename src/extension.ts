import * as vscode from "vscode";
import * as path from "path";
import player from "play-sound";

const debugMode = true;

let audio: any;
let holdTimeout: NodeJS.Timeout | undefined;
let isPlaying = false;
let lastUndoTime = 0;
let debounceTimer: NodeJS.Timeout | undefined;
let volume = 0.38;
let assistanceDelay = 0.8;
let bufferTime = 0;

// Create an output channel for logging
let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
  // Initialize the output channel
  outputChannel = vscode.window.createOutputChannel("BetterUndo");
  outputChannel.show();

  log("BetterUndo extension activated", true);

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
        placeHolder: "0.8 is recommended / default",
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
    vscode.workspace.onDidChangeTextDocument(
      debounce((event: vscode.TextDocumentChangeEvent) => {
        if (isUndoEvent(event)) {
          log("Undo command detected");
          // vscode.window.showInformationMessage("Undo command detected!");

          if (!holdTimeout) {
            holdTimeout = setTimeout(() => {
              log(
                "Hold threshold reached, attempting to play sound"
              );
              if (!isPlaying) {
                playSound(soundFilePath);
                isPlaying = true;
              }
            }, assistanceDelay * 1000);
          }
          bufferTime = 3;
        }
        // if not an undo event
        else {
          log("Not Undo : isPlaying" + isPlaying);         

          // account for race condition
          if (bufferTime > 0 && isPlaying) {
            bufferTime--;
            return;
          }
          if (bufferTime <= 0) {
            stopPlaying();
          }
          // log("Change. Stop sound!");
          if (holdTimeout) {
            clearTimeout(holdTimeout);
            holdTimeout = undefined;
            log("Hold timeout cleared");
          }
          if (isPlaying) {
            stopPlaying();
            log("Sound stopped");
          }
        }
      }, 70)
    )
  );
}

function stopPlaying() {
  stopSound();
  isPlaying = false;
}

function updateSettings() {
  const config = vscode.workspace.getConfiguration("betterundo");
  volume = config.get("volume", 0.35);
  assistanceDelay = config.get("assistanceDelay", 0.26);
  log(`Volume updated to: ${volume}`);
  log(
    `Assistance delay updated to: ${assistanceDelay} seconds`
  );
}

function isUndoEvent(event: vscode.TextDocumentChangeEvent): boolean {
  const now = Date.now();
  if (now - lastUndoTime < 300) {
    return true;
  }

  if (event.contentChanges.length === 1) {
    const change = event.contentChanges[0];
    if (change.rangeLength > 0 && change.text === "") {
      lastUndoTime = now;
      return true;
    }
  }

  // Additional check: If the buffer is empty but undo command was triggered
  if (event.document.version === 1 && event.contentChanges.length === 0) {
    log("Undo reached the start of the document.");
    return false;
  }

  return false;
}

function debounce(func: Function, delay: number) {
  return (...args: any[]) => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => func(...args), delay);
  };
}

function playSound(filePath: string) {
  log(`Attempting to play sound: ${filePath}`);
  const soundPlayer = player();

  // Use mpg123 with volume control
  const volumePercent = volume * 2.5;
  log(
    `about to play with: Math.round(${volume} * 10) volume: ${volumePercent}`
  );
  const playerOptions = ["-v", volumePercent.toString()];
  // afplay: ['-v', 0.5]

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
  if (!debugMode && !force) return;
  outputChannel.appendLine(msg);
}