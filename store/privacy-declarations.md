# Store privacy declarations

Audited against the shipping client contract on October 3, 2026. AI data-use consent notice version: 9. These declarations cover consent-gated AI speech for selected lesson and reply text, optional typed coaching, Asha GPT-Live voice with Responses delegation and permission-scoped native tools, pronunciation checks, automated text safety classification, a random installation identifier, optional AI-reply reports, and user-initiated report deletion. The production GPT-Live and Responses backend contract was verified on October 3, 2026; these declarations still do not assume unverified contractual service-provider status.

## Apple App Privacy

Select **Yes, data is collected**. Use the following conservative declarations for data sent off device by the app or its partners.

| Apple data type | What Bolo sends | Purpose | Linked to the user | Used for tracking |
| --- | --- | --- | --- | --- |
| User Content → Other User Content | Typed messages; up to eight recent Asha messages; current lesson ID/title/objective and active-lesson vocabulary; selected learner level/mode; live transcripts; learner-requested meaning, feedback and recap text; minimal save/progress tool results; a reported AI reply; and the selected report reason | App Functionality | Yes — connected payloads use a persistent random installation identifier or its safety partition | No |
| User Content → Audio Data | Voice turns and pronunciation recordings submitted after consent | App Functionality | Yes — the connected audio paths use the installation identifier | No |
| Identifiers → Device ID | A random identifier generated for this app installation | App Functionality | Yes | No |
| Usage Data → Product Interaction | An optional report action and its server-side report time | App Functionality | Yes — the report includes the installation identifier | No |
| Contact Info → Name | A name entered voluntarily on the public support form | Developer Communications → Customer Support | Yes — it is submitted with the support request | No |
| Contact Info → Email Address | An email entered voluntarily on the public support form | Developer Communications → Customer Support | Yes — it is submitted with the support request | No |

Do not declare phone number, physical address, precise or coarse location, contacts, photos, browsing history, purchases, financial information, health records, advertising data, crash data, or performance data based on this client. The linked support form does collect the optional name and email address declared above. Saved-phrase lists/counts, review schedules, daily practice totals, full scene history, goals, consent, and streak data are not Apple “collected” data while they remain only on the device. The bounded fields and minimal live-tool results listed above are collected when the learner opts into connected coaching.

The privacy-policy URL is required in App Store Connect. A user-privacy-choices URL is optional. Reconcile the table with the production backend and every third-party processor before publishing the answers.

## Google Play Data safety

Answer **Yes** to “Does your app collect or share any of the required user data types?” Use the entries below. “Shared” is set to **Yes** conservatively because the data is transferred to hosted and AI providers; change it to **No** only after confirming every transfer meets Google Play's service-provider exception.

| Google Play data type | Collected | Shared | Ephemeral processing | Required or optional | Purpose |
| --- | --- | --- | --- | --- | --- |
| Messages → Other in-app messages | Yes | Yes | No | Optional | App functionality |
| Audio files → Voice or sound recordings | Yes | Yes | No | Optional | App functionality |
| Device or other IDs | Yes | Yes | No | Optional | App functionality |
| App activity → App interactions | Yes, for an optional report action | Yes | No | Optional | App functionality |
| Personal info → Name | Yes, through the public support form | Yes | No | Optional | Developer communications |
| Personal info → Email address | Yes, through the public support form | Yes | No | Optional | Developer communications |

Security-practice answers supported by the client:

- AI-voice text, typed coaching, pronunciation recordings, reports, deletion requests, and live-session requests are sent to the Bolo backend over HTTPS. On iOS, Start Conversation requests microphone permission and opens a full-duplex WebRTC media stream for GPT-Live. Before connection, the app sends the selected mode, current lesson ID/title/objective, selected learner level, active-lesson vocabulary, and up to eight recent Asha messages; it excludes saved-phrase lists/counts, review schedules, daily totals, and full scene history. Permission-scoped tool results expose only the requested lesson/vocabulary or the minimum current-request result, while saves and progress mutations stay local. The microphone track stays enabled during the active chat so the learner can interrupt naturally; Mute disables it until unmuted. Its audio travels directly between the app and OpenAI after trusted-server negotiation, and the permanent API key never enters the app. Other supported platforms retain Bolo's existing turn-based live-voice connection. Every stream and its tracks are released at End Chat, when the learner leaves the screen, or when the app backgrounds. Live voice does not create a recording file or capture microphone audio in the background. Select “encrypted in transit” only after confirming every production leg.
- Users can withdraw connected-coaching consent. Clear chat removes only saved typed and voice chat from the device and does not delete submitted reports. Settings also deletes off-device reports associated with the current random installation identifier before clearing local data, including chat history, and rotating that identifier. Uninstalling alone removes only local data.
- Scheduled cleanup keeps report records no longer than 90 days and support requests no longer than 180 days unless an active legal or safety matter requires longer retention. The dedicated Asha service stores only HMAC-derived rate-limit bucket keys, counts, and fixed-window timestamps; its default window is 60 seconds. It prunes buckets older than 24 hours at startup and hourly while running. If the service is stopped, startup cleanup resumes before it accepts requests.
- Do not claim an independent security review.
- The app contains no advertising SDK, analytics SDK, sale of user data, or cross-app tracking in the audited source.

## Other Play Console declarations

- **Ads:** No.
- **App access:** All functionality is available without credentials; connected coaching has a consent step, not a login gate.
- **Target audience:** Recommend ages 13–15, 16–17, and 18+; do not designate the app as primarily directed to children.
- **AI-generated content:** Yes. Bolo has in-app Report actions on generated chat replies and pronunciation feedback with unsafe/inappropriate and incorrect/misleading reasons.
- **Account deletion:** Not applicable because users cannot create an account.

## Category and age recommendations

- Apple primary category: **Education**; secondary category: **Travel**.
- Apple Made for Kids: **No**.
- Apple updated age questionnaire: declare **Infrequent Medical or Treatment Information** because two language scenes cover pharmacy and doctor conversations; all other mature-content descriptors are absent in the authored scenes. The expected current-system result is **13+**, subject to App Store Connect's generated rating.
- Google Play category: **Education**.
- Google Play target audience: **13 and older**. This avoids presenting the open-ended AI coach as a child-directed feature and matches the medical-language content.

## Evidence reviewed

- `src/services/bolo-api.ts`: outbound payloads, HTTPS endpoint, random installation identifier, and report payload.
- `src/components/ai-consent-gate.tsx`: separate consent before connected processing.
- `src/lib/speech.ts` and `src/lib/ai-voice-player.ts`: bounded AI-speech requests, caching, cancellation, playback, and temporary-file cleanup.
- `src/components/realtime-voice-button.tsx`, `src/hooks/use-asha-live-conversation.ts`, and `src/lib/asha-native-tools.ts`: consent-gated GPT-Live controls, trusted-server session creation, minimized native-tool results, and streaming lifecycle.
- `src/components/voice-turn-button.tsx`: explicit, time-limited pronunciation recording behavior.
- `src/app/live.tsx`: English-default AI conversation and in-app report control.
- `src/app/privacy.tsx`: user-facing data-use explanation.
- `src/state/app-state.tsx` and `src/lib/storage.ts`: on-device progress and consent storage.

Official references:

- Apple App Privacy: https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy
- Apple age ratings: https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions
- Google Play Data safety: https://support.google.com/googleplay/android-developer/answer/10787469?hl=en
- Google Play AI-generated content policy: https://support.google.com/googleplay/android-developer/answer/14094294?hl=en-EN
