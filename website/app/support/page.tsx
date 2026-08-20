import type { Metadata } from "next";

import { PolicyPage, PolicySection, policyDocuments, policyMetadata } from "../legal";

export const metadata: Metadata = policyMetadata("support");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

/**
 * The publisher's monitored support address is supplied at build time through
 * BOLO_SUPPORT_EMAIL, the same variable the release scripts require, so no
 * address is invented or checked in here. Without it the page still explains
 * every self-service route and points at the store listing's support contact.
 */
function supportEmail() {
  const configured = typeof process === "undefined" ? undefined : process.env.BOLO_SUPPORT_EMAIL?.trim();
  return configured && EMAIL_PATTERN.test(configured) ? configured : null;
}

export default function Support() {
  const email = supportEmail();
  return (
    <PolicyPage page="support">
      <PolicySection title="Reach a person">
        {email
          ? <p>Email <a href={`mailto:${email}`}>{email}</a> for help, privacy requests, or anything about a generated reply. Requests are answered from a monitored address, usually within a few business days.</p>
          : <p>The monitored support address for this release is published with the app’s App Store and Google Play listings, under Support or Developer contact. Requests sent there cover help, privacy requests, and anything about a generated reply.</p>}
        <p>A support request only contains what you choose to send. Include a name and an email address if you want a reply; you do not need to include either to ask a question, and Bolo never asks for your saved phrases, chat history, or device contents.</p>
      </PolicySection>

      <PolicySection title="Before you write: things you can do in the app">
        <ul>
          <li><strong>Withdraw AI consent.</strong> Settings → AI data use. Written scenes, bundled lesson audio, saved phrases, and review keep working offline.</li>
          <li><strong>Clear chat.</strong> Practice with Asha → Clear chat removes the saved typed and voice chat from this device.</li>
          <li><strong>Delete your data.</strong> Settings → Delete Bolo data removes local data and diagnostics, requests deletion of reports submitted from this installation, and replaces its random identifier.</li>
          <li><strong>Report a reply.</strong> Tap Report on a generated reply or pronunciation response so the developer can investigate it.</li>
        </ul>
      </PolicySection>

      <PolicySection title="Common problems">
        <ul>
          <li><strong>Asha will not speak.</strong> Generated voice needs AI consent and an internet connection. Check Settings → AI data use, then your connection. Bundled lesson audio still plays offline.</li>
          <li><strong>The microphone is not picking anything up.</strong> Live voice and pronunciation checks need microphone permission from the system settings for Bolo. Live voice transmits only between the orb tap that starts a turn and the tap that sends it.</li>
          <li><strong>Practice progress disappeared.</strong> Progress is stored only on the device. Reinstalling the app, resetting the device, or using Delete Bolo data clears it, and it cannot be restored.</li>
          <li><strong>A reply looked wrong.</strong> Bolo is a language-practice tool and AI responses can be inaccurate. Report the reply, and do not rely on Bolo for professional translation, medical advice, or emergency help.</li>
        </ul>
      </PolicySection>

      <PolicySection title="Privacy and data requests">
        <p>Deletion, access, and other data requests are handled through the same support address. Most of what Bolo holds never leaves the device, so the fastest route is Settings → Delete Bolo data; write in if you need confirmation, if the in-app deletion fails, or if a parent or guardian needs help with a child’s information. The <a href={policyDocuments.privacy.href}>privacy policy</a> lists exactly what is stored, what connected coaching sends, and how long reports are kept.</p>
      </PolicySection>

      <PolicySection title="Emergencies">
        <p>Bolo is not an emergency service and requests are not monitored around the clock. If someone is in danger, contact local emergency services.</p>
      </PolicySection>
    </PolicyPage>
  );
}
