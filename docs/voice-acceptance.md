# Required physical iPhone voice acceptance

Run these checks on the exact installed iPhone build before recording release signoff. Keep existing user data; do not erase the app, clear its keychain, or reset the profile for this check.

Maestro [does not support physical iOS devices](https://docs.maestro.dev/platform-support/ios-uikit). Flow 06 only proves that iOS Simulator explains its unsupported microphone session and leaves controls disconnected. Static flow validation, simulator checks, service probes and browser evidence do not pass this gate.

1. **English reply mode:** Open Asha, choose English replies, and tap the orb to start a live session. The microphone stays on. Speak a distinctive phrase and verify the displayed learner transcript matches the spoken words, Asha gives a relevant reply, and the complete reply is audible on the iPhone.
2. **Continuous session, mute and Hindi reply mode:** Without reconnecting, speak again (including once while Asha is still speaking) and confirm the new utterance is accepted and answered. Tap the orb to mute, speak, and confirm nothing is transcribed; tap again to unmute and confirm speech is heard again. End the session, select Hindi replies, start again, and repeat with a different utterance. Verify the recognized words, Hindi reply, and audible playback. Silence, missing transcripts, error messages, unexpected disconnects, or needing to reconnect between utterances are failures.
3. **Cleanup:** End explicitly and confirm the microphone indicator releases and the start control returns. Repeat while navigating away, putting the app in the background and locking the phone. Return to the app and confirm it is disconnected and another session can start. Check interruption and Bluetooth routing before release signoff.
4. **Record evidence:** Save the exact source commit/build ID, TestFlight version/build, iPhone model, iOS version, each spoken utterance and recognized transcript, a brief description of each audible reply, continuous-session, overlapping-speech and mute/unmute observations, and microphone cleanup results. Unperformed or unavailable checks remain **unverified**.
5. **Record signoff only after passing:** Use **Record iOS physical signoff**, enter the exact installed build, confirm both checklist boxes, and enter the voice evidence plus device/iOS notes. A false checkbox or empty evidence must fail. This is a human attestation tied to a build, not an automated claim about microphone or speaker quality.

For the separate simulator limitation check only:

```sh
maestro --device SIMULATOR_ID test .maestro/flows/06-simulator-voice-unsupported.yaml
```
