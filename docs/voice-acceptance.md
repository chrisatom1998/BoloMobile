# Required physical iPhone voice acceptance

Run these checks on the exact installed iPhone build before recording release signoff. Keep existing user data; do not erase the app, clear its keychain, or reset the profile for this check.

Maestro [does not support physical iOS devices](https://docs.maestro.dev/platform-support/ios-uikit). Flow 06 only proves that iOS Simulator explains its unsupported microphone session and leaves controls disconnected. Static flow validation, simulator checks, service probes and browser evidence do not pass this gate.

1. **First full-duplex turn:** Open Asha, choose **Hindi with English help**, tap **Start Conversation**, and speak a distinctive phrase after Asha's greeting. Verify the visible learner transcript preserves the spoken wording, Asha answers its meaning in Hindi, and the complete answer is audible on the iPhone. While Asha is speaking, tap **Interrupt**, speak a new request, and verify playback stops immediately and Asha follows the newest request.
2. **Second turn and stale-work check:** Without ending the chat, ask a lesson or vocabulary question that starts backend loading, then change the request while that work is still running. Verify the stale result is not spoken or applied, the newest transcript remains visible, and Asha continues naturally. Exercise **Speak Slower**, **Explain**, **Hear Again**, and one explicitly confirmed **Save Phrase**. Verify only one phrase is saved and the recap reports only backend-confirmed progress.
3. **Modes, routes, and cleanup:** Repeat a short turn in Hindi immersion and lesson mode. Check Mute/Unmute, wired or Bluetooth audio routing when available, an incoming-call/audio interruption, lost-network recovery, backgrounding, and foreground return. Tap **End Chat** and confirm the microphone indicator turns off, playback stops, Start Conversation returns, and another session can start without duplicate transcript rows or saves.
4. **Record evidence:** Save the exact source commit/build ID, TestFlight version/build, iPhone model, iOS version, each spoken utterance and recognized transcript, a brief description of each audible reply, completed-playback and next-turn observations, and microphone cleanup results. Unperformed or unavailable checks remain **unverified**.
5. **Record signoff only after passing:** Use **Record iOS physical signoff**, enter the exact installed build, confirm both checklist boxes, and enter the voice evidence plus device/iOS notes. A false checkbox or empty evidence must fail. This is a human attestation tied to a build, not an automated claim about microphone or speaker quality.

For the separate simulator limitation check only:

```sh
maestro --device SIMULATOR_ID test .maestro/flows/06-simulator-voice-unsupported.yaml
```
