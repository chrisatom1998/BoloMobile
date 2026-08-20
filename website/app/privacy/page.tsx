import type { Metadata } from "next";

import { PolicyPage, PolicySection, policyDocuments, policyMetadata } from "../legal";

export const metadata: Metadata = policyMetadata("privacy");

export default function Privacy() {
  return (
    <PolicyPage page="privacy">
      <p className="policy-note">AI data-use consent notice version {policyDocuments.privacy.aiConsentVersion}. The same policy is available inside the app under Settings → Privacy &amp; data use.</p>

      <PolicySection title="What Bolo is">
        <p>Bolo is a Hindi practice app. Its written lessons and scenes, saved phrases, and progress work without an account and without an internet connection. Connected AI coaching is optional and starts only after you accept the current AI data-use consent notice.</p>
      </PolicySection>

      <PolicySection title="Data stored on your device">
        <p>Saved phrases, daily goal, practice time, challenge status, up to 100 recent typed and transcribed Asha chat messages, your consent record, and a random app identifier are stored locally. They are not encrypted, so do not use Bolo to store sensitive information.</p>
      </PolicySection>

      <PolicySection title="Data processed for AI coaching">
        <p>Fixed lesson and saved-phrase audio is bundled in the app and plays offline without sending text anywhere. After consent, generated Asha speech sends only the selected generated reply text through Bolo’s backend to OpenAI; these voice requests do not include the random app identifier. Typed coaching sends your message, a short recent conversation history, and the random app identifier to Bolo’s backend. Live voice asks the backend for a short-lived OpenAI Realtime credential tied to the random identifier, then exchanges microphone audio and Asha’s spoken response directly with OpenAI over WebRTC. Pronunciation checks also send a temporary recording through Bolo’s backend. OpenAI transcribes audio and generates speech or coaching. Normal connected content is not intentionally added to Bolo’s report database. Bolo does not send contacts, location, photos, advertising identifiers, or background microphone audio.</p>
      </PolicySection>

      <PolicySection title="Reports and retention">
        <p>If you tap Report on a generated reply or pronunciation response, Bolo stores that response, your selected reason, the random app identifier, and the report time so the developer can investigate safety or quality problems. Reports are retained for up to 90 days. OpenAI does not use API data to train models unless the developer opts in and may keep abuse-monitoring logs for up to 30 days unless different data controls apply; the hosting provider may process limited operational logs.</p>
      </PolicySection>

      <PolicySection title="Microphone behavior">
        <p>Starting live voice requests microphone permission and opens a peer media stream with its audio track disabled. Tap the glowing orb to begin each turn, then tap the orb again to send the turn. Microphone transmission is enabled only during that active turn and remains disabled between turns. The stream and its tracks are released when you tap End (the close control), leave the screen, or the app leaves the foreground. Live voice does not create a recording file or capture microphone audio in the background. Pronunciation recording begins only after its record control and stops when you tap Stop, leave the screen, or after 15 seconds; its temporary file is deleted after each request or cleanup. Bolo does not record in the background.</p>
      </PolicySection>

      <PolicySection title="Delete data or withdraw consent">
        <p>Bolo keeps learning preferences, scene mastery, review schedules, reminder settings, saved phrases, and up to 30 days of content-free reliability counts on this device. Those counters never include content or identifiers and are never uploaded. You can withdraw AI consent in Settings. This disables generated AI voice playback and connected coaching; written scenes, bundled lesson audio, saved phrases, review, and recent local chat history remain available offline. Clear chat in Practice with Asha removes only the saved typed and voice chat from this device; it does not delete reports already submitted. You can also use Delete Bolo data to delete reports associated with this installation, clear all local data including diagnostics and chat history, and replace its random identifier. Bolo keeps the current identifier if deletion fails so you can retry. Uninstalling clears local data but does not itself send a report-deletion request, so use Settings before uninstalling if you have submitted reports.</p>
      </PolicySection>

      <PolicySection title="Children">
        <p>Bolo is a general-audience language-learning app and is not directed to children under 13. A parent or guardian who believes a child submitted personal information can use the <a href={policyDocuments.support.href}>Support page</a> to request help or deletion.</p>
      </PolicySection>

      <PolicySection title="Service providers and international processing">
        <p>Connected coaching uses Bolo’s hosted backend and OpenAI. These providers may process content in the United States and other countries, where data-protection rules may differ from those where you live. Their infrastructure handles content under their applicable service terms and safeguards.</p>
      </PolicySection>

      <PolicySection title="Changes to this policy">
        <p>Material changes are published here with a new version and effective date. When a change affects what connected coaching sends, the AI data-use consent notice version is raised as well and the app asks for consent again before using AI features.</p>
      </PolicySection>
    </PolicyPage>
  );
}
