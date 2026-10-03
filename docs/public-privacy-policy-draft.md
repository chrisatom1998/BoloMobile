# Public privacy policy update draft — review before publishing

This is a local legal-copy draft for the existing public privacy page. It is not deployed. Replace the stale Mira/Realtime/turn-based/Live Translate section with the following text only after the owner approves the representation and the AppDeploy GPT-Live production route is verified.

## Optional AI coaching and Asha GPT-Live

Bolo's written lessons, bundled lesson audio, saved phrases, and on-device progress work without connected AI coaching. Connected coaching is optional and starts only after you accept AI data-use consent notice version 9.

For typed coaching, Bolo sends your submitted message, a short recent conversation history, and a random app-installation identifier to Bolo's trusted backend and OpenAI. For generated speech and pronunciation feedback, Bolo sends the selected text or a temporary pronunciation recording. Do not include sensitive personal information.

On iOS, Start Conversation opens Asha GPT-Live using a full-duplex WebRTC media stream and a separate Responses delegation. Before connection, Bolo sends the selected mode, current lesson ID, title and objective, selected learner level, active-lesson vocabulary, and up to eight recent Asha chat messages to Bolo's trusted backend and OpenAI. Bolo does not send your saved-phrase list or counts, review schedule, daily practice totals, or full scene history.

During the live conversation, OpenAI processes microphone audio and transcripts. When Asha requests a permission-scoped Bolo tool, OpenAI may also process the word or phrase and context you asked about, requested grammar feedback, and recap content. Bolo returns minimal tool results, such as whether a confirmed phrase save or completed progress update succeeded. Saved phrases and progress changes are written only to Bolo's local on-device stores; Bolo does not create a new server-side learner profile or migrate those local records.

Bolo's trusted backend creates the GPT-Live session and keeps the permanent OpenAI API key off the device. After negotiation, microphone audio and Asha's spoken response travel directly between the app and OpenAI. The random app identifier or a derived safety partition is used for rate limiting, safety, report deletion, and abuse prevention.

## Microphone and live-session lifecycle

Start Conversation requests microphone permission. The microphone track stays enabled during an active live chat so you can speak naturally or interrupt Asha; Mute disables it until you unmute. Interrupt stops local playback and makes the newest request authoritative. Bolo releases the media stream, microphone and playback tracks, data channel, and network session when you tap End Chat, leave the screen, or the app leaves the foreground.

Live voice does not create a recording file or capture microphone audio in the background. A separate pronunciation recording begins only after you use its recording control, stops when you stop it, leave the screen, or reach its time limit, and deletes its temporary file after the request or cleanup.

## Local storage, reports, and deletion

Saved phrases, learning progress, preferences, reminder settings, consent, and up to 100 recent typed and transcribed Asha chat messages remain in unencrypted storage on this device. Content-free reliability counters contain no messages, transcripts, audio, phrases, identifiers, or error text and are not uploaded.

Normal connected coaching content is not intentionally added to Bolo's report database. If you choose Report, Bolo stores the reported generated response, your selected reason, the random app identifier, and report time for up to 90 days. Clear chat removes saved typed and voice chat from this device; it does not delete reports already submitted. Delete Bolo data first requests deletion of reports associated with the current installation, then clears local data and replaces the random identifier after the server confirms deletion.

OpenAI does not use API data to train models unless the developer opts in and may retain abuse-monitoring logs for up to 30 days unless different data controls apply. Hosting providers may process limited operational logs. Support requests contain the name, email address, message, and submission time supplied through the support form.
