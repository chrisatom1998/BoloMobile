const scenes = [
  { number: "01", place: "Delhi · 9:10 AM", title: "Order a chai", hindi: "एक चाय, कृपया", note: "Cafés & food", tone: "terracotta" },
  { number: "02", place: "Jaipur · 4:35 PM", title: "Find your way", hindi: "यह कहाँ है?", note: "Getting around", tone: "forest" },
  { number: "03", place: "Mumbai · 6:20 PM", title: "Meet the family", hindi: "आपसे मिलकर खुशी हुई", note: "Social moments", tone: "ochre" },
  { number: "04", place: "Lucknow · 11:45 AM", title: "Shop with ease", hindi: "यह कितने का है?", note: "Everyday errands", tone: "blue" },
];

const features = [
  { mark: "21", title: "Guided scenes", text: "Practice the conversations that actually happen—from chai stops and train stations to work and family visits." },
  { mark: "मि", title: "Meet Mira", text: "Type or speak naturally. Mira can coach in English or Hindi and help you keep the conversation moving." },
  { mark: "↔", title: "Live translation", text: "Speak Hindi and see a clear English translation, designed for quick understanding in the moment." },
  { mark: "◉", title: "Pronunciation checks", text: "Record one focused answer, hear useful feedback, then try again while the phrase is still fresh." },
  { mark: "★", title: "Your phrasebook", text: "Save the lines you want to remember and build a practical collection that stays on your device." },
  { mark: "7", title: "Daily momentum", text: "Set a small practice goal, complete a challenge, and watch your streak grow one real moment at a time." },
];

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Bolo home">
          <img src="/bolo-icon.png" alt="" width="48" height="48" />
          <span className="brand-name">Bolo</span>
          <span className="brand-tagline">Hindi for real moments</span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#scenes">Scenes</a>
          <a href="#mira">Meet Mira</a>
          <a href="#features">Features</a>
          <a className="nav-cta" href="#how-it-works">See how it works <span aria-hidden="true">↗</span></a>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><span />Your Hindi field guide</p>
          <h1>Learn Hindi by <em>living</em> the moment.</h1>
          <p className="hero-lead">Step into real conversations—ordering chai, meeting family, finding your way. Mira listens, translates, and helps you answer with confidence.</p>
          <div className="hero-actions">
            <a className="primary-button" href="#scenes"><span className="button-play" aria-hidden="true">▶</span> Explore the scenes</a>
            <a className="text-link" href="#mira">Meet your coach, Mira</a>
          </div>
          <div className="hero-proof" aria-label="Bolo highlights">
            <div><strong>21</strong><span>Guided real-life scenes</span></div>
            <div><strong>Live</strong><span>Hindi → English translation</span></div>
            <div><strong>0</strong><span>Accounts required</span></div>
          </div>
        </div>

        <div className="hero-visual" aria-label="Bolo voice coaching experience">
          <span className="field-note">Notes from the road · New Delhi</span>
          <span className="hero-sun" aria-hidden="true" />
          <span className="hero-arch" aria-hidden="true" />
          <div className="phone-wrap">
            <img src="/mira-voice.png" alt="Bolo's Mira voice coaching screen with English and Hindi reply controls" />
          </div>
          <div className="round-stamp" aria-hidden="true">Speak<br />with<br />confidence</div>
          <article className="practice-postcard">
            <div className="postcard-top"><span>Scene 01 · At the café</span><b>नमस्ते</b></div>
            <h2>“Ek chai, please.”</h2>
            <p>Mira gives gentle pronunciation feedback while you practice a phrase you’ll actually use.</p>
            <div className="wave" aria-hidden="true"><i /><i /><i /><i /><i /><span>Try saying it</span></div>
          </article>
          <div className="visual-index">
            <h2>Made for the moment</h2>
            <p><span>Voice coaching</span><b>Mira AI</b></p>
            <p><span>Written practice</span><b>Offline</b></p>
            <p><span>Your progress</span><b>Phrases + streaks</b></p>
          </div>
        </div>
      </section>

      <div className="moment-strip" aria-label="Bolo practice topics">
        <span>Order with ease</span><i>ब</i><span>Ask for directions</span><i>ब</i><span>Meet new people</span><i>ब</i><span>Speak with confidence</span>
      </div>

      <section className="scenes section-shell" id="scenes">
        <div className="section-heading">
          <div><p className="eyebrow"><span />Practice in context</p><h2>Real Hindi lives in<br /><em>real situations.</em></h2></div>
          <p>Each guided scene gives you the setting, what you hear, and a natural way to reply—written in Devanagari, transliteration, and English.</p>
        </div>
        <div className="scene-grid">
          {scenes.map((scene) => (
            <article className={`scene-card ${scene.tone}`} key={scene.number}>
              <div className="scene-meta"><span>Scene {scene.number}</span><span>{scene.place}</span></div>
              <div className="scene-glyph" aria-hidden="true">{scene.hindi.charAt(0)}</div>
              <p>{scene.note}</p>
              <h3>{scene.title}</h3>
              <div className="hindi-line"><span>{scene.hindi}</span><b aria-hidden="true">↗</b></div>
            </article>
          ))}
        </div>
        <p className="scene-footnote">Plus 17 more moments across travel, food, work, health, shopping, and everyday life.</p>
      </section>

      <section className="steps" id="how-it-works">
        <div className="section-shell">
          <p className="eyebrow light"><span />A simple rhythm</p>
          <h2>See it. Say it.<br /><em>Make it yours.</em></h2>
          <div className="step-grid">
            <article><span>01</span><h3>Enter the moment</h3><p>Choose a real-life scene and see exactly where the conversation begins.</p></article>
            <article><span>02</span><h3>Choose your reply</h3><p>Read Hindi, transliteration, and meaning—then select the response that feels natural.</p></article>
            <article><span>03</span><h3>Speak it out loud</h3><p>Listen to Mira, practice your pronunciation, or continue with a live voice turn.</p></article>
          </div>
        </div>
      </section>

      <section className="mira section-shell" id="mira">
        <div className="mira-visual">
          <div className="mira-halo halo-one" /><div className="mira-halo halo-two" />
          <img src="/mira-voice.png" alt="Mira's voice practice interface in Bolo" />
          <aside className="mira-note top-note"><span>Live translate</span><strong>नमस्ते → Hello</strong></aside>
          <aside className="mira-note bottom-note"><span>Pronunciation</span><strong>Clear and natural</strong></aside>
        </div>
        <div className="mira-copy">
          <p className="eyebrow"><span />Your conversation coach</p>
          <h2>Meet Mira.<br /><em>She’ll meet you where you are.</em></h2>
          <p>Ask how to say something, practice one phrase, or start a voice turn. Choose English-first coaching or Hindi replies whenever you’re ready for more immersion.</p>
          <ul>
            <li><span>01</span><div><strong>Correct me</strong><p>Focused guidance for the Hindi you want to say.</p></div></li>
            <li><span>02</span><div><strong>Live translate</strong><p>Hindi speech becomes clear English text in the moment.</p></div></li>
            <li><span>03</span><div><strong>English or हिन्दी</strong><p>You control the language Mira uses to reply.</p></div></li>
          </ul>
        </div>
      </section>

      <section className="features section-shell" id="features">
        <div className="section-heading feature-heading">
          <div><p className="eyebrow"><span />Built for steady progress</p><h2>Everything you need.<br /><em>Nothing in the way.</em></h2></div>
          <p>No account. No pressure. Start with the 21 written scenes offline, then choose if and when you want connected AI coaching.</p>
        </div>
        <div className="feature-grid">
          {features.map((feature) => (
            <article key={feature.title}>
              <span className="feature-mark">{feature.mark}</span>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="privacy section-shell">
        <div className="privacy-card">
          <div className="privacy-mark" aria-hidden="true">ब</div>
          <div><p className="eyebrow light"><span />Practice on your terms</p><h2>Offline at the core.<br /><em>AI only when you choose.</em></h2></div>
          <div className="privacy-copy"><p>Bolo’s written scenes, saved phrases, and progress work without an account. Connected coaching begins only after a clear consent step, and you can withdraw consent or delete local data in Settings.</p><a href="https://74e39779183cf78fed.v2.appdeploy.ai/?page=privacy">Read the privacy policy <span aria-hidden="true">↗</span></a></div>
        </div>
      </section>

      <section className="closing">
        <div className="closing-stamp" aria-hidden="true">21<br /><span>real moments</span></div>
        <p className="eyebrow"><span />Your next conversation starts here</p>
        <h2>Go from “I know that word”<br />to <em>“I can say this.”</em></h2>
        <a className="primary-button" href="#scenes"><span className="button-play" aria-hidden="true">▶</span> Find your first scene</a>
        <p className="closing-note">Written practice works offline · Connected coaching is optional</p>
      </section>

      <footer>
        <a className="brand footer-brand" href="#top"><img src="/bolo-icon.png" alt="" width="44" height="44" /><span className="brand-name">Bolo</span></a>
        <p>Hindi for real moments.</p>
        <div><a href="https://74e39779183cf78fed.v2.appdeploy.ai/?page=privacy">Privacy</a><a href="https://74e39779183cf78fed.v2.appdeploy.ai/?page=terms">Terms</a><a href="https://74e39779183cf78fed.v2.appdeploy.ai/?page=support">Support</a></div>
      </footer>
    </main>
  );
}
