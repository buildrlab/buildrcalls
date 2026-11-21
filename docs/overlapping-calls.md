# Overlapping call capture: implementation review

## Current status

BuildrCalls still records one call at a time. Its current capture source is the first display and mixed system audio, and it opens links in the user's default browser. Two simultaneous capture streams would therefore record the same display and could mix the calls. The calendar warns when scheduled calls overlap. The output writer now assigns independent files and streams to recording IDs, but this alone does **not** provide isolated audio, video, browser sessions or unattended joining.

## Feasibility work before enabling simultaneous recording

1. Run each supported web session in a separate, explicitly identified process and persistent profile, with an observable state for authentication, joining, host admission and failures. Do not claim a session has joined merely because a URL opened. Never bypass host controls, CAPTCHAs or permission prompts.
2. On macOS 14.2+, investigate a native Core Audio process tap per isolated process, and pair it with a separate window or off-screen video source. Verify actual process boundaries; Chromium may route audio through shared processes. Protect credentials and isolate browser profiles. [Apple process tap sample](https://developer.apple.com/documentation/CoreAudio/capturing-system-audio-with-core-audio-taps).
3. On Windows, investigate WASAPI application loopback per isolated process tree and a corresponding window capture. [Microsoft application loopback sample](https://learn.microsoft.com/en-us/samples/microsoft/windows-classic-samples/applicationloopbackaudio-sample/).
4. Demonstrate two **synthetic** sessions with different simultaneous audio and video, verify that neither output contains the other source, verify unattended startup, end handling and independently playable files, then test the user's actual WebinarJam sessions with permission. Test while the user watches a third source. Capture chat only if a supported method exists; visible chat in video is not a complete transcript.
5. Zoom needs a platform-specific approach. Its [RTMS documentation](https://developers.zoom.us/docs/rtms/meetings/media/) describes access to meeting media, while host/admin controls can require approval. Verify eligibility and access for external hosts before promising support. Google Meet's real-time media preview is discontinued; do not depend on it.
6. Monitor audio samples and media progress as well as process health. A present audio track alone does not prove audio is audible. Handle sleep, disk exhaustion, reconnects, process termination and partial recordings. Enforce resource limits and report per-call status. Verify transcription against each completed recording.

No independent multi-call capture is enabled until the isolation and real-platform tests succeed. The default browser and desktop-wide loopback are not isolation boundaries.
