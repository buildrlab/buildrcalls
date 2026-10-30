# BuildrCalls

A BuildrLab desktop prototype for planning calls, recording your screen and reviewing conversations with an offline transcript. Built with Electron and [whisper.cpp](https://github.com/ggml-org/whisper.cpp); no transcription account or API key is needed.

**Early prototype:** unattended admission and recording are not guaranteed. A host may need to admit you or approve recording. Test the recording, audio and platform-specific joining flow before depending on it.

## Features

- Month-view calendar with a configurable time zone and remembered scheduling defaults.
- Open a call link five minutes early in your default browser; record the first display and available system audio at the scheduled time.
- Play recordings from the calendar; select transcript timestamps to jump to that point.
- Transcribe recordings locally with whisper.cpp and FFmpeg. The model is downloaded once; subsequent transcription runs offline.
- Save recordings and transcripts into a folder synced by Google Drive for desktop.

## Download the desktop app

Visit [BuildrCalls downloads](https://github.com/buildrlab/buildrcalls/releases/latest) and choose the file for your computer:

- **Mac:** open the `.dmg` for Apple Silicon (M1 or newer) or Intel, then drag BuildrCalls to Applications.
- **Windows:** download the Windows `.zip`, extract it, then open `BuildrCalls.exe` inside the extracted folder. Keep the other files alongside it.

The early builds are unsigned and have no automatic updater. macOS or Windows may warn that the developer cannot be verified. Only install a release you trust from the official BuildrLab repository. Offline transcription requires a one-time setup below; the installer does not include whisper.cpp, FFmpeg or the model.

## Run from source

Install [Node.js 22 LTS](https://nodejs.org/), Git, and Google Drive for desktop if you want Drive sync. Clone this repository, then from its folder:

```sh
git clone https://github.com/buildrlab/buildrcalls.git
cd buildrcalls
npm ci
npm start
```

Leave the app open and the computer awake and unlocked. Grant screen and system audio permissions when prompted. In **Settings**, choose a recording folder. A Drive-synced folder is required for Google Drive storage; Drive for desktop handles uploads, and the app cannot verify sync completion. Previously recorded files remain in their original location.

### macOS: set up offline transcription

Install [Homebrew](https://brew.sh/) if needed, then:

```sh
brew install ffmpeg whisper.cpp
mkdir -p .models
curl -L --fail -o .models/ggml-tiny.en.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin
```

Restart the app. It detects Homebrew's usual Apple Silicon and Intel executable paths. When running from source it also detects the model in the project’s `.models` folder. In the downloaded app, choose your model manually under **Settings → Offline transcription**; the model is in `.models` under the directory where you ran the commands. Choose the other files there too if they are not detected. The tiny English model is a fast starting point; a larger compatible GGML model may improve accuracy at the cost of speed and disk space. In Finder's file picker, press **Command–Shift–G** to enter a path such as `/opt/homebrew/bin/whisper-cli`.

### Windows: set up offline transcription

Install FFmpeg, CMake, and Visual Studio Build Tools with the **Desktop development with C++** workload. Ensure `ffmpeg` and `cmake` are available in a new PowerShell window. The [FFmpeg download page](https://ffmpeg.org/download.html) and [whisper.cpp build guide](https://github.com/ggml-org/whisper.cpp#quick-start) provide current installation options. Then build whisper.cpp and download a model (PowerShell):

```powershell
git clone https://github.com/ggml-org/whisper.cpp.git
cd whisper.cpp
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release
Invoke-WebRequest -Uri https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin -OutFile models/ggml-tiny.en.bin
```

In BuildrCalls **Settings → Offline transcription**, choose `whisper.cpp\build\bin\Release\whisper-cli.exe`, `whisper.cpp\models\ggml-tiny.en.bin`, and `ffmpeg.exe` (find the latter with `Get-Command ffmpeg`). Keep the whisper.cpp build folder and its accompanying DLLs together. Paths may differ with your build configuration.

### Transcribe and review

Open a saved recording from the calendar or library, then select **Transcribe offline**. FFmpeg extracts temporary audio locally; whisper.cpp writes timestamped segments. The temporary audio is removed afterward and a `.transcript.json` file is saved next to the recording, so a Drive-synced folder can sync it too. Select a timestamp to seek in the video. Accuracy and processing time depend on the model, hardware and captured audio. If there is no audible audio, there is nothing useful to transcribe.

## Recording and privacy boundaries

Any HTTPS call or webinar link can be saved using **Other / custom** and a platform name. The app opens the link, but does not automatically navigate an unfamiliar service.

At the scheduled time the prototype attempts to capture the first display and an available system-audio track. A recording can include anything visible on that display, including private notifications and chat. Only visible chat appears in the video; the app does not export the full chat history. A detected audio track does not guarantee audible sound. Use the recording test and listen back. There is no meeting-entry verification, automatic CAPTCHA solving, or bypass for login and waiting-room approval. Only one recording can run at a time. Closed app, sleep, permissions, meeting prompts and platform changes may prevent capture. Secure permission from the organizer and participants as appropriate.

Calendar information, including personal meeting links, remains in the local Electron app data directory. Recordings and transcripts follow the configured folder's sync and sharing settings. Transcription itself does not send audio to an online service.

## Development

Run `npm test` for the local checks. A weekly grouped Dependabot version-update pull request targets `dev`; GitHub may create separate security updates for the default branch. External installations of whisper.cpp, FFmpeg and model files are not managed by Dependabot.

### Overlapping calls

The current capture system records one call at a time. The calendar warns about overlaps; independent simultaneous call capture is under investigation. See [the architecture review](docs/overlapping-calls.md) for the technical plan and current limitations.
