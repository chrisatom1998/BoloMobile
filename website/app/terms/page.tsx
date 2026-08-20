import type { Metadata } from "next";

import { PolicyPage, PolicySection, policyDocuments, policyMetadata } from "../legal";

export const metadata: Metadata = policyMetadata("terms");

export default function Terms() {
  return (
    <PolicyPage page="terms">
      <PolicySection title="Accepting these terms">
        <p>By installing or using Bolo you agree to these terms. If you do not agree, do not use the app. These terms cover the Bolo mobile app, this website, and the optional connected coaching features described in the <a href={policyDocuments.privacy.href}>privacy policy</a>.</p>
      </PolicySection>

      <PolicySection title="Your licence to use Bolo">
        <p>Bolo grants you a personal, non-exclusive, non-transferable licence to use the app for language practice on devices you control. The lessons, scenes, audio, artwork, and app code remain the property of their owners. Do not resell the app, redistribute its lesson content as your own, or attempt to extract its bundled audio for other products.</p>
      </PolicySection>

      <PolicySection title="Accounts and your device">
        <p>Bolo does not require an account. Your saved phrases, progress, and recent chat history are stored on your device and are not synced or backed up by Bolo. Losing, resetting, or uninstalling the device or app removes that local data, and Bolo cannot restore it.</p>
      </PolicySection>

      <PolicySection title="Optional AI coaching">
        <p>Generated Asha speech, typed coaching, live voice turns, and pronunciation checks run only after you accept the AI data-use consent notice, and they need an internet connection. You can withdraw consent in Settings at any time, which disables those features and leaves written practice working offline. Connected features may be rate limited, changed, or interrupted, and generated responses may be delayed or unavailable.</p>
      </PolicySection>

      <PolicySection title="Acceptable use">
        <p>Use Bolo for your own language practice. Do not submit content that is unlawful, abusive, or that contains another person’s private information; do not attempt to make the AI produce harmful or illegal content; do not probe, overload, or reverse engineer the backend or its rate limits; and do not use Bolo to build a competing dataset or model. You are responsible for the content you type or speak into the app. You can report a generated reply from inside the conversation, and requests that abuse the service may be blocked.</p>
      </PolicySection>

      <PolicySection title="Bolo is a practice tool, not professional advice">
        <p>Bolo is a language-practice tool. AI responses may be inaccurate or unnatural. Do not rely on Bolo for professional translation, legal, financial, or medical advice, or for emergency help. Health scenes are language exercises and do not provide medical advice.</p>
      </PolicySection>

      <PolicySection title="Warranty and liability">
        <p>Bolo is provided “as is” and “as available”, without warranties of any kind to the extent permitted by law, including any implied warranty of merchantability, fitness for a particular purpose, accuracy, or uninterrupted availability. To the extent permitted by law, the developer is not liable for indirect, incidental, or consequential damages, or for lost data arising from your use of the app. Nothing in these terms limits rights you have under mandatory consumer law where you live.</p>
      </PolicySection>

      <PolicySection title="App store terms">
        <p>Bolo is distributed through the Apple App Store and Google Play. Their terms also apply to your download and any purchase, and each store — not the store operator — handles refunds under its own policy. Apple and Google are not responsible for Bolo or for support of the app.</p>
      </PolicySection>

      <PolicySection title="Changes and ending use">
        <p>Features may change as the app is updated, and material changes to these terms are published here with a new version and effective date. Continuing to use Bolo after a change means you accept the updated terms. You can end this agreement at any time by deleting your local data in Settings and uninstalling the app.</p>
      </PolicySection>

      <PolicySection title="Questions">
        <p>Questions about these terms, or about how Bolo handles data, go through the <a href={policyDocuments.support.href}>Support page</a>.</p>
      </PolicySection>
    </PolicyPage>
  );
}
