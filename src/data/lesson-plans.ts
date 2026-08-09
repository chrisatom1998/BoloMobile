import type { BeatMode, Choice, Scene, SceneCategory } from './scenes';
import { buildLessonFeedback } from './lesson-feedback';
import { trimTerminalPunctuation } from '../lib/text';

type LessonSeed = {
  title: string;
  /** A short, vivid second-person setup that puts the learner in the moment this phrase is for. */
  cue: string;
  /** Asha speaks the cue aloud in Hindi; `cue` doubles as its English translation. */
  cueHi: string;
  hi: string;
  latin: string;
  en: string;
};

type LessonPlanSeed = {
  id: string;
  category: SceneCategory;
  title: string;
  subtitle: string;
  level: string;
  emoji: string;
  color: string;
  place: string;
  words: [string, string, string];
  lessons: LessonSeed[];
};

export type LessonPlan = Omit<LessonPlanSeed, 'lessons'> & {
  order: number;
  lessonIds: string[];
};

type GuidedPracticeContext = {
  plan: LessonPlanSeed;
  target: LessonSeed;
};

type GuidedPracticeTurn = {
  prompt: string;
  tip: string;
};

type GuidedPracticeBeat = GuidedPracticeTurn & {
  target: LessonSeed;
  distractors: readonly [LessonSeed, LessonSeed];
  mode: BeatMode;
};

/**
 * Ten distinct learning actions. Asha speaks the target's situational cue aloud in the beat's npc
 * line, so each prompt is purely the practice instruction for that moment.
 *
 * Two activities have a different interaction in the runtime. Keeping their mode beside their
 * copy makes the instruction and the control the learner receives stay in sync.
 */
type PracticeActivity = {
  mode: BeatMode;
  build: (context: GuidedPracticeContext) => GuidedPracticeTurn;
};

const practiceActivities: readonly PracticeActivity[] = [
  { mode: 'choice', build: ({ target }) => ({
    prompt: `Listen first, then pick the Hindi for “${trimTerminalPunctuation(target.en)}”.`,
    tip: `Let the shape of “${target.latin}” guide you—you are matching a sound here, not a spelling.`,
  }) },
  { mode: 'recallReveal', build: ({ target }) => ({
    prompt: `Before revealing, recall the Hindi for “${trimTerminalPunctuation(target.en)}”.`,
    tip: `If it will not come, start with the first word of “${target.latin}” and let the rest follow.`,
  }) },
  { mode: 'choice', build: ({ target, plan }) => ({
    prompt: `Match the meaning: which line means “${trimTerminalPunctuation(target.en)}”?`,
    tip: `The other two are real ${plan.category.toLowerCase()} phrases for different moments—compare the Hindi lines before you choose.`,
  }) },
  { mode: 'choice', build: ({ target }) => ({
    prompt: `Set the tone: say the Hindi for “${trimTerminalPunctuation(target.en)}” out loud.`,
    tip: `Say “${target.latin}” evenly and without rushing; courtesy in Hindi comes through in your delivery as much as in your words.`,
  }) },
  { mode: 'wordOrder', build: ({ target }) => ({
    prompt: `Piece it together: build the Hindi for “${trimTerminalPunctuation(target.en)}”.`,
    tip: `Track “${target.latin}” from front to back; Hindi usually saves its verb for the very end.`,
  }) },
  { mode: 'choice', build: ({ target }) => ({
    prompt: `Whisper it: “${trimTerminalPunctuation(target.latin)}”, then match the script.`,
    tip: `Hearing yourself say it first makes the right script jump out instead of needing to be decoded.`,
  }) },
  { mode: 'choice', build: ({ target }) => ({
    prompt: `Picture yourself there, then say “${trimTerminalPunctuation(target.en)}” in Hindi.`,
    tip: `Pin “${target.latin}” to this exact scene; a phrase with a moment attached is much harder to lose.`,
  }) },
  { mode: 'choice', build: ({ target }) => ({
    prompt: `Say the whole thought—the full line for “${trimTerminalPunctuation(target.en)}”.`,
    tip: `A single keyword only points at the idea; “${target.latin}” delivers all of it.`,
  }) },
  { mode: 'choice', build: ({ target }) => ({
    prompt: `Rule out the other two, then keep “${trimTerminalPunctuation(target.en)}”.`,
    tip: `Both wrong answers are useful phrases from this plan—they are simply answering a different question.`,
  }) },
  { mode: 'choice', build: ({ target }) => ({
    prompt: `Lock it in: tap the Hindi for “${trimTerminalPunctuation(target.en)}”.`,
    tip: `Aim for “${target.latin}” to arrive on its own next time, before you have to reach for it.`,
  }) },
];

/**
 * Every lesson keeps its titled phrase as the anchor: learners meet it first and last, and use it
 * for both alternate practice modes. The remaining choice turns rotate through the plan so the
 * lesson still introduces a broad supporting vocabulary. Activities advance one step per turn;
 * the four-step lesson offset varies where each lesson enters that shared sequence.
 */
function guidedPracticeTurns(plan: LessonPlanSeed, lessonIndex: number): GuidedPracticeBeat[] {
  const phraseCount = plan.lessons.length;
  return plan.lessons.map((_, turnIndex) => {
    const activity = practiceActivities[(4 * lessonIndex + turnIndex) % practiceActivities.length]!;
    const targetsTitledPhrase = turnIndex === 0
      || turnIndex === phraseCount - 1
      || activity.mode === 'recallReveal'
      || activity.mode === 'wordOrder';
    const targetIndex = targetsTitledPhrase ? lessonIndex : (lessonIndex + turnIndex) % phraseCount;
    const target = plan.lessons[targetIndex]!;
    return {
      target,
      distractors: [
        plan.lessons[(targetIndex + 3) % phraseCount]!,
        plan.lessons[(targetIndex + 7) % phraseCount]!,
      ] as const,
      mode: activity.mode,
      ...activity.build({ plan, target }),
    };
  });
}

function phraseOf({ hi, latin, en }: LessonSeed): Pick<Choice, 'hi' | 'latin' | 'en'> {
  return { hi, latin, en };
}

const planSeeds: LessonPlanSeed[] = [
  {
    id: 'essentials', category: 'Social', title: 'Start speaking', subtitle: 'Ten first phrases for a warm, confident opening', level: 'Starter', emoji: '👋', color: '#a85a43', place: 'Everywhere · first week', words: ['नमस्ते', 'कृपया', 'धन्यवाद'],
    lessons: [
      { title: 'A warm hello', cue: 'A neighbor catches your eye in the stairwell and pauses.', cueHi: 'सीढ़ियों पर पड़ोसी की नज़र आप पर पड़ती है और वे एक पल के लिए ठहर जाते हैं।', hi: 'नमस्ते।', latin: 'Namaste.', en: 'Hello.' },
      { title: 'Say your name', cue: 'Someone extends a hand and waits for you to fill the silence.', cueHi: 'कोई आपकी तरफ़ हाथ बढ़ाता है और चुपचाप इंतज़ार करता है कि आप कुछ कहें।', hi: 'मेरा नाम ... है।', latin: 'Mera naam ... hai.', en: 'My name is ...' },
      { title: 'Ask how someone is', cue: 'You run into a colleague you have not seen since last week.', cueHi: 'अचानक आपको ऑफ़िस के वो साथी मिल जाते हैं जिनसे पिछले हफ़्ते से मुलाक़ात नहीं हुई।', hi: 'आप कैसे हैं?', latin: 'Aap kaise hain?', en: 'How are you?' },
      { title: 'Say you are well', cue: 'Your host asks after you while pouring the tea.', cueHi: 'आपके मेज़बान चाय डालते-डालते आपका हाल पूछते हैं।', hi: 'मैं ठीक हूँ।', latin: 'Main theek hoon.', en: 'I am well.' },
      { title: 'Slow it down', cue: 'The words are flying past you three at a time.', cueHi: 'शब्द तीन-तीन करके आपके सिर के ऊपर से निकलते जा रहे हैं।', hi: 'कृपया धीरे बोलिए।', latin: 'Kripya dheere boliye.', en: 'Please speak slowly.' },
      { title: 'Ask to repeat', cue: 'A passing bus drowned out the last thing she said.', cueHi: 'गुज़रती हुई बस के शोर में उनकी आख़िरी बात दब गई।', hi: 'कृपया दोहराइए।', latin: 'Kripya dohraiye.', en: 'Please repeat that.' },
      { title: 'Name your goal', cue: 'Someone asks why you keep carrying that little phrasebook.', cueHi: 'कोई पूछता है कि आप यह छोटी-सी फ़्रेज़बुक हर वक़्त साथ क्यों रखते हैं।', hi: 'मुझे हिंदी सीखनी है।', latin: 'Mujhe Hindi seekhni hai.', en: 'I want to learn Hindi.' },
      { title: 'Say you missed it', cue: 'You nodded along for a full minute and caught none of it.', cueHi: 'आप पूरे एक मिनट तक सिर हिलाते रहे और असल में कुछ भी पल्ले नहीं पड़ा।', hi: 'मुझे समझ नहीं आया।', latin: 'Mujhe samajh nahin aaya.', en: 'I did not understand.' },
      { title: 'Offer thanks', cue: 'A stranger just walked two blocks out of their way for you.', cueHi: 'एक अजनबी अभी-अभी आपके लिए अपने रास्ते से हटकर दो गली दूर तक साथ चला आया।', hi: 'बहुत धन्यवाद।', latin: 'Bahut dhanyavaad.', en: 'Thank you very much.' },
      { title: 'Say goodbye', cue: 'The evening is winding down and you are reaching for your bag.', cueHi: 'शाम ढल रही है और आप अपना बैग उठाने के लिए हाथ बढ़ा रहे हैं।', hi: 'फिर मिलेंगे।', latin: 'Phir milenge.', en: 'See you again.' },
    ],
  },
  {
    id: 'connection', category: 'Social', title: 'Make a connection', subtitle: 'Keep a kind conversation moving naturally', level: 'Starter', emoji: '💬', color: '#7b5fa7', place: 'A neighborhood hello', words: ['यहाँ', 'मदद', 'बात'],
    lessons: [
      { title: 'Ask where someone lives', cue: 'You are chatting on the stoop and wondering if you are neighbors.', cueHi: 'आप घर के बाहर सीढ़ियों पर बैठे गपशप कर रहे हैं और मन में सवाल है कि कहीं आप दोनों पड़ोसी तो नहीं।', hi: 'आप कहाँ रहते हैं?', latin: 'Aap kahaan rahte hain?', en: 'Where do you live?' },
      { title: 'Say you are new', cue: 'The shopkeeper studies you, certain he has never seen your face.', cueHi: 'दुकानदार आपको ग़ौर से देखते हैं, उन्हें पक्का यक़ीन है कि यह चेहरा उन्होंने पहले कभी नहीं देखा।', hi: 'मैं यहाँ नया हूँ।', latin: 'Main yahaan naya hoon.', en: 'I am new here.' },
      { title: 'Ask for help', cue: 'Your suitcase wheel has jammed and the stairs go up three flights.', cueHi: 'आपके सूटकेस का पहिया जाम हो गया है और ऊपर तीन मंज़िल तक सीढ़ियाँ चढ़नी हैं।', hi: 'मुझे मदद चाहिए।', latin: 'Mujhe madad chahiye.', en: 'I need help.' },
      { title: 'Ask about English', cue: 'You have hit the edge of your vocabulary and need a bridge.', cueHi: 'आपके शब्द यहीं ख़त्म हो गए हैं और आगे बात बढ़ाने के लिए कोई सहारा चाहिए।', hi: 'क्या आप अंग्रेज़ी बोलते हैं?', latin: 'Kya aap angrezi bolte hain?', en: 'Do you speak English?' },
      { title: 'Share your level', cue: 'Someone launches into rapid Hindi, assuming you will keep up.', cueHi: 'कोई यह मानकर फ़र्राटेदार हिंदी बोलने लगता है कि आप समझ ही लेंगे।', hi: 'मुझे थोड़ा हिंदी आता है।', latin: 'Mujhe thoda Hindi aata hai.', en: 'I know a little Hindi.' },
      { title: 'Say you like it', cue: 'A neighbor holds up a hand-painted cup for your opinion.', cueHi: 'पड़ोसी हाथ से पेंट किया हुआ कप उठाकर दिखाते हैं और आपकी राय पूछते हैं।', hi: 'मुझे यह पसंद है।', latin: 'Mujhe yah pasand hai.', en: 'I like this.' },
      { title: 'Say no politely', cue: 'A vendor keeps pressing a second scarf into your hands.', cueHi: 'दुकानवाला दूसरा स्कार्फ़ बार-बार आपके हाथ में थमाता जा रहा है।', hi: 'मुझे यह नहीं चाहिए।', latin: 'Mujhe yah nahin chahiye.', en: 'I do not want this.' },
      { title: 'Keep it easy', cue: 'Someone apologizes for bumping your shoulder in the crowd.', cueHi: 'भीड़ में किसी का कंधा आपसे टकरा जाता है और वे तुरंत माफ़ी माँगने लगते हैं।', hi: 'कोई बात नहीं।', latin: 'Koi baat nahin.', en: 'No problem.' },
      { title: 'Say yes warmly', cue: 'A neighbor invites you along for an evening walk.', cueHi: 'पड़ोसी आपको शाम की सैर पर साथ चलने के लिए बुलाते हैं।', hi: 'ज़रूर, क्यों नहीं।', latin: 'Zaroor, kyon nahin.', en: 'Sure, why not.' },
      { title: 'Take a moment', cue: 'You are asked to decide on the spot, and you would rather not rush.', cueHi: 'आपसे वहीं का वहीं फ़ैसला माँगा जा रहा है, पर आप जल्दबाज़ी नहीं करना चाहते।', hi: 'मुझे सोचने दीजिए।', latin: 'Mujhe sochne dijiye.', en: 'Let me think.' },
    ],
  },
  {
    id: 'food', category: 'Food', title: 'Eat with ease', subtitle: 'Order, customize, and pay at cafés and restaurants', level: 'Beginner', emoji: '🍽️', color: '#c86d32', place: 'A local café', words: ['मेन्यू', 'पानी', 'बिल'],
    lessons: [
      { title: 'Ask for a menu', cue: 'The waiter stops at your table, ready to take your order.', cueHi: 'वेटर आपकी मेज़ के पास आकर खड़ा हो जाता है और ऑर्डर लेने के लिए तैयार है।', hi: 'मुझे एक मेन्यू दीजिए।', latin: 'Mujhe ek menu dijiye.', en: 'Please give me a menu.' },
      { title: 'Ask for a recommendation', cue: 'Everything on the board looks good and you cannot choose.', cueHi: 'बोर्ड पर सब कुछ अच्छा लग रहा है और आपसे कुछ चुना ही नहीं जा रहा।', hi: 'आज क्या अच्छा है?', latin: 'Aaj kya achchha hai?', en: 'What is good today?' },
      { title: 'Say vegetarian', cue: 'The server launches into a description of the mutton special.', cueHi: 'वेटर आपको मटन स्पेशल के बारे में बताने लग जाता है।', hi: 'मैं शाकाहारी हूँ।', latin: 'Main shaakahari hoon.', en: 'I am vegetarian.' },
      { title: 'Skip onions', cue: 'You spot raw onion piled high on the dish at the next table.', cueHi: 'बगल वाली मेज़ की प्लेट में आपको कच्चे प्याज़ का ढेर लगा दिखता है।', hi: 'मुझे बिना प्याज़ चाहिए।', latin: 'Mujhe bina pyaaz chahiye.', en: 'I need it without onions.' },
      { title: 'Reduce spice', cue: 'You love the flavor, but the curry last night ran far too hot.', cueHi: 'स्वाद तो आपको बहुत पसंद है, पर कल रात वाली करी हद से ज़्यादा तीखी निकली थी।', hi: 'मुझे कम मसाला चाहिए।', latin: 'Mujhe kam masaala chahiye.', en: 'I need less spice.' },
      { title: 'Order water', cue: 'Your glass has been empty since the starters arrived.', cueHi: 'जब से स्टार्टर आए हैं, आपका गिलास खाली ही पड़ा है।', hi: 'पानी दीजिए, कृपया।', latin: 'Paani dijiye, kripya.', en: 'Water, please.' },
      { title: 'Give a compliment', cue: 'The cook glances over as you take your first bite.', cueHi: 'आप पहला निवाला लेते हैं और रसोइया आपकी तरफ़ नज़र डालता है।', hi: 'यह बहुत स्वादिष्ट है।', latin: 'Yah bahut swaadisht hai.', en: 'This is very delicious.' },
      { title: 'Pack it up', cue: 'Half the thali is left and you are already full.', cueHi: 'आधी थाली अभी बची है और आपका पेट पहले ही भर चुका है।', hi: 'मुझे पैक कर दीजिए।', latin: 'Mujhe pack kar dijiye.', en: 'Please pack this for me.' },
      { title: 'Pay by card', cue: 'You reach for your wallet and find no cash in it.', cueHi: 'आप पर्स निकालते हैं और उसमें कैश है ही नहीं।', hi: 'क्या मैं कार्ड से भुगतान कर सकता हूँ?', latin: 'Kya main card se bhugtaan kar sakta hoon?', en: 'Can I pay by card?' },
      { title: 'Split the bill', cue: 'Three of you ate together and the bill lands in the middle.', cueHi: 'आप तीनों ने साथ खाना खाया और बिल मेज़ के ठीक बीचोंबीच आ जाता है।', hi: 'बिल बाँट दीजिए।', latin: 'Bill baant dijiye.', en: 'Please split the bill.' },
    ],
  },
  {
    id: 'getting-around', category: 'Travel', title: 'Get around town', subtitle: 'Use buses, trains, and taxis with confidence', level: 'Beginner', emoji: '🚌', color: '#287d78', place: 'City transit', words: ['बस', 'किराया', 'स्टॉप'],
    lessons: [
      { title: 'Find the bus', cue: 'You are on a corner with no bus stop sign anywhere in sight.', cueHi: 'आप सड़क के कोने पर खड़े हैं और आसपास कहीं बस स्टॉप का बोर्ड नहीं दिख रहा।', hi: 'बस कहाँ से मिलेगी?', latin: 'Bus kahaan se milegi?', en: 'Where can I get the bus?' },
      { title: 'Name your destination', cue: 'The driver looks back at you, waiting to hear where to.', cueHi: 'ड्राइवर पीछे मुड़कर आपकी तरफ़ देखता है और इंतज़ार करता है कि आप बताएँ कहाँ जाना है।', hi: 'मुझे पुराना शहर जाना है।', latin: 'Mujhe puraana shahar jaana hai.', en: 'I need to go to the old city.' },
      { title: 'Ask the distance', cue: 'The map on your phone has stopped loading entirely.', cueHi: 'आपके फ़ोन पर नक्शा लोड होना ही बंद हो गया है।', hi: 'यहाँ से कितना दूर है?', latin: 'Yahaan se kitna door hai?', en: 'How far is it from here?' },
      { title: 'Ask to walk', cue: 'The fare sounds steep for what looks like a short hop.', cueHi: 'रास्ता तो ज़रा-सा लगता है, पर किराया कुछ ज़्यादा ही बताया जा रहा है।', hi: 'क्या मैं पैदल जा सकता हूँ?', latin: 'Kya main paidal ja sakta hoon?', en: 'Can I walk there?' },
      { title: 'Ask the fare', cue: 'You are holding a fistful of notes and no idea what to hand over.', cueHi: 'आपके हाथ में नोटों की मुट्ठी है और समझ नहीं आ रहा कि कितने पकड़ाने हैं।', hi: 'किराया कितना है?', latin: 'Kiraaya kitna hai?', en: 'How much is the fare?' },
      { title: 'Find your stop', cue: 'The bus slows down and nobody announces where you are.', cueHi: 'बस धीमी हो रही है और कोई बता ही नहीं रहा कि कौन-सी जगह आ गई है।', hi: 'अगला स्टॉप कौन-सा है?', latin: 'Agla stop kaun-sa hai?', en: 'Which is the next stop?' },
      { title: 'Get off here', cue: 'You spot your building through the window, earlier than planned.', cueHi: 'खिड़की से आपको अपनी बिल्डिंग दिख जाती है, उम्मीद से पहले ही।', hi: 'मुझे यहीं उतरना है।', latin: 'Mujhe yaheen utarna hai.', en: 'I need to get off here.' },
      { title: 'Check a delay', cue: 'The platform clock passed departure time ten minutes ago.', cueHi: 'प्लेटफ़ॉर्म की घड़ी में ट्रेन के छूटने का समय दस मिनट पहले निकल चुका है।', hi: 'ट्रेन देर से है क्या?', latin: 'Train der se hai kya?', en: 'Is the train delayed?' },
      { title: 'Ask for a seat', cue: 'There is one empty seat, and a bag is sitting on it.', cueHi: 'एक ही सीट खाली दिख रही है और उस पर किसी का बैग रखा है।', hi: 'यह सीट खाली है क्या?', latin: 'Yah seat khaali hai kya?', en: 'Is this seat free?' },
      { title: 'Ask for a map', cue: 'The route diagram on the wall has faded to nothing.', cueHi: 'दीवार पर लगा रूट का नक्शा इतना धुँधला पड़ चुका है कि कुछ पढ़ा ही नहीं जाता।', hi: 'मुझे एक नक्शा चाहिए।', latin: 'Mujhe ek naksha chahiye.', en: 'I need a map.' },
    ],
  },
  {
    id: 'directions', category: 'Travel', title: 'Find your way', subtitle: 'Follow and ask for simple directions', level: 'Beginner', emoji: '🧭', color: '#4e7792', place: 'A busy crossing', words: ['सीधा', 'बाएँ', 'रास्ता'],
    lessons: [
      { title: 'Go straight', cue: 'A stranger asks you the way, and for once the answer is simple.', cueHi: 'कोई अजनबी आपसे रास्ता पूछ रहा है, और इस बार जवाब बिलकुल आसान है।', hi: 'सीधा जाइए।', latin: 'Seedha jaiye.', en: 'Go straight.' },
      { title: 'Turn left', cue: 'You are guiding a driver who is waiting for the next instruction.', cueHi: 'आप ड्राइवर को रास्ता बता रहे हैं और वो इंतज़ार में है कि अब किधर मुड़ना है।', hi: 'बाएँ मुड़िए।', latin: 'Baen muriye.', en: 'Turn left.' },
      { title: 'Turn right', cue: 'The turn is coming up fast and the driver needs to hear it now.', cueHi: 'मोड़ एकदम पास आ गया है और ड्राइवर को अभी के अभी बताना है।', hi: 'दाएँ मुड़िए।', latin: 'Daen muriye.', en: 'Turn right.' },
      { title: 'Stop at the corner', cue: 'Your building sits just past the crossing, so this is close enough.', cueHi: 'आपकी बिल्डिंग चौराहे से बस थोड़ा आगे है, तो यहीं रुक जाना काफ़ी है।', hi: 'कोने पर रुकिए।', latin: 'Kone par rukiye.', en: 'Stop at the corner.' },
      { title: 'Find the metro', cue: 'You can hear trains somewhere below but see no entrance.', cueHi: 'नीचे कहीं ट्रेनों की आवाज़ आ रही है, पर अंदर जाने का रास्ता दिख ही नहीं रहा।', hi: 'मेट्रो स्टेशन पास है क्या?', latin: 'Metro station paas hai kya?', en: 'Is the metro station nearby?' },
      { title: 'Find a hospital', cue: 'A friend needs care and you do not know which way to walk.', cueHi: 'आपके दोस्त को इलाज चाहिए और आपको पता ही नहीं कि किस तरफ़ जाना है।', hi: 'मुझे अस्पताल ढूँढना है।', latin: 'Mujhe aspataal dhoondhna hai.', en: 'I need to find a hospital.' },
      { title: 'Check the route', cue: 'You have walked ten minutes and nothing looks familiar yet.', cueHi: 'आपको चलते-चलते दस मिनट हो गए, पर अब तक कुछ भी जाना-पहचाना नहीं दिखा।', hi: 'क्या यह सही रास्ता है?', latin: 'Kya yah sahi raasta hai?', en: 'Is this the right way?' },
      { title: 'Ask to be shown', cue: 'Pointing and gesturing has failed; you need it laid out for you.', cueHi: 'इशारों से बात नहीं बनी, अब कोई खुद दिखा दे तभी समझ आएगा।', hi: 'कृपया मुझे दिखाइए।', latin: 'Kripya mujhe dikhaiye.', en: 'Please show me.' },
      { title: 'Say you are lost', cue: 'Every lane here looks the same and your map is no help.', cueHi: 'यहाँ हर गली एक जैसी लगती है और नक्शा भी कोई काम नहीं आ रहा।', hi: 'मैं रास्ता भूल गया हूँ।', latin: 'Main raasta bhool gaya hoon.', en: 'I am lost.' },
      { title: 'Find a taxi', cue: 'It is starting to rain and walking is no longer an option.', cueHi: 'बारिश शुरू हो गई है और अब पैदल चलना मुमकिन नहीं।', hi: 'यहाँ टैक्सी मिलती है क्या?', latin: 'Yahaan taxi milti hai kya?', en: 'Can I get a taxi here?' },
    ],
  },
  {
    id: 'shopping', category: 'Everyday', title: 'Shop and pay', subtitle: 'Compare, choose, and check out politely', level: 'Beginner', emoji: '🛍️', color: '#b27931', place: 'A neighborhood shop', words: ['दाम', 'साइज़', 'रसीद'],
    lessons: [
      { title: 'Ask the price', cue: 'You are turning a brass bowl over in your hands, hunting for a price tag.', cueHi: 'आप पीतल का कटोरा हाथ में घुमाते हुए उस पर कीमत का लेबल ढूँढ रहे हैं।', hi: 'यह कितने का है?', latin: 'Yah kitne ka hai?', en: 'How much is this?' },
      { title: 'Ask for less', cue: 'The first number the seller says is clearly a starting number.', cueHi: 'दुकानदार ने जो पहला दाम बताया है, वो तो सिर्फ़ शुरुआत है।', hi: 'थोड़ा कम कीजिए।', latin: 'Thoda kam kijiye.', en: 'Please lower it a little.' },
      { title: 'Say you have no cash', cue: 'The shopkeeper nods toward a hand-lettered cash-only sign.', cueHi: 'दुकानदार हाथ से लिखे बोर्ड की तरफ़ इशारा करता है, जिस पर लिखा है कि सिर्फ़ नकद चलेगा।', hi: 'मेरे पास नकद नहीं है।', latin: 'Mere paas nakad nahin hai.', en: 'I do not have cash.' },
      { title: 'Find a smaller size', cue: 'The shirt hangs off your shoulders in the mirror.', cueHi: 'शीशे में दिख रहा है कि कमीज़ आपके कंधों से लटक रही है।', hi: 'क्या आपके पास छोटा साइज़ है?', latin: 'Kya aapke paas chhota size hai?', en: 'Do you have a smaller size?' },
      { title: 'Try it on', cue: 'You like the kurta but cannot tell how it will actually sit.', cueHi: 'कुर्ता आपको पसंद तो है, पर पहने बिना पता ही नहीं चल रहा कि यह आप पर कैसा बैठेगा।', hi: 'मैं इसे पहनकर देख सकता हूँ?', latin: 'Main ise pehenkar dekh sakta hoon?', en: 'Can I try this on?' },
      { title: 'Choose another color', cue: 'The fit is perfect; the mustard yellow is not.', cueHi: 'फिटिंग तो एकदम सही है, बस ये सरसों जैसा पीला रंग जँच नहीं रहा।', hi: 'मुझे दूसरा रंग चाहिए।', latin: 'Mujhe doosra rang chahiye.', en: 'I need another color.' },
      { title: 'Ask for a receipt', cue: 'The cashier hands back your change and nothing else.', cueHi: 'कैशियर आपके हाथ में बाकी पैसे थमा देता है, और कुछ नहीं देता।', hi: 'रसीद दीजिए, कृपया।', latin: 'Raseed dijiye, kripya.', en: 'A receipt, please.' },
      { title: 'Just browsing', cue: 'A helpful assistant has followed you down two aisles now.', cueHi: 'दुकान का सेल्समैन मदद के चक्कर में दो गलियारों तक आपके पीछे-पीछे चला आ रहा है।', hi: 'मैं बस देख रहा हूँ।', latin: 'Main bas dekh raha hoon.', en: 'I am just looking.' },
      { title: 'Ask about returns', cue: 'It is a gift, and you are not sure it will fit.', cueHi: 'यह तोहफ़े के लिए है, और आपको पक्का नहीं पता कि साइज़ सही बैठेगा या नहीं।', hi: 'क्या यह वापस हो सकता है?', latin: 'Kya yah vaapas ho sakta hai?', en: 'Can this be returned?' },
      { title: 'Ask for a bag', cue: 'Your arms are full and you still have to walk home.', cueHi: 'आपके दोनों हाथ सामान से भरे हैं और घर तक पैदल भी जाना है।', hi: 'मुझे एक बैग चाहिए।', latin: 'Mujhe ek bag chahiye.', en: 'I need a bag.' },
    ],
  },
  {
    id: 'daily-life', category: 'Everyday', title: 'Daily life', subtitle: 'Describe routines, weather, and plans at home', level: 'Beginner', emoji: '🏠', color: '#63754c', place: 'Home · every day', words: ['सुबह', 'घर', 'कल'],
    lessons: [
      { title: 'Start the morning', cue: 'A new friend asks what your days actually look like.', cueHi: 'एक नया दोस्त पूछता है कि आपका पूरा दिन आख़िर बीतता कैसे है।', hi: 'मैं सुबह जल्दी उठता हूँ।', latin: 'Main subah jaldi uthta hoon.', en: 'I wake up early in the morning.' },
      { title: 'Make tea', cue: 'The kettle is empty and guests are already on their way over.', cueHi: 'केतली बिल्कुल ख़ाली पड़ी है और मेहमान रास्ते में हैं।', hi: 'मुझे चाय बनानी है।', latin: 'Mujhe chai banaani hai.', en: 'I need to make tea.' },
      { title: 'Talk about heat', cue: 'The fan is on high and it is barely helping.', cueHi: 'पंखा पूरी स्पीड पर चल रहा है, फिर भी ज़रा भी राहत नहीं मिल रही।', hi: 'आज बहुत गर्मी है।', latin: 'Aaj bahut garmi hai.', en: 'It is very hot today.' },
      { title: 'Talk about rain', cue: 'Someone at the door asks whether they need an umbrella.', cueHi: 'दरवाज़े पर कोई पूछ रहा है कि छाता साथ ले जाना पड़ेगा क्या।', hi: 'बाहर बारिश हो रही है।', latin: 'Baahar baarish ho rahi hai.', en: 'It is raining outside.' },
      { title: 'Work from home', cue: 'A neighbor wonders why you never leave in the morning.', cueHi: 'पड़ोसी हैरान हैं कि आप सुबह कभी घर से निकलते ही नहीं।', hi: 'मैं घर पर काम करता हूँ।', latin: 'Main ghar par kaam karta hoon.', en: 'I work from home.' },
      { title: 'Close the window', cue: 'Dust is blowing in and papers are lifting off the table.', cueHi: 'धूल अंदर आ रही है और मेज़ पर रखे काग़ज़ उड़ने लगे हैं।', hi: 'कृपया खिड़की बंद कर दीजिए।', latin: 'Kripya khidki band kar dijiye.', en: 'Please close the window.' },
      { title: 'Ask for a rest', cue: 'You have been on your feet since breakfast.', cueHi: 'नाश्ते के बाद से आप एक पल के लिए भी नहीं बैठे हैं।', hi: 'मुझे थोड़ा आराम चाहिए।', latin: 'Mujhe thoda aaraam chahiye.', en: 'I need a little rest.' },
      { title: 'Talk later', cue: 'The call has to end but the conversation is not finished.', cueHi: 'फ़ोन अब रखना ही पड़ेगा, पर बात अभी अधूरी है।', hi: 'हम बाद में बात करेंगे।', latin: 'Hum baad mein baat karenge.', en: 'We will talk later.' },
      { title: 'Say you are busy', cue: 'Someone knocks while you are in the middle of a deadline.', cueHi: 'डेडलाइन सिर पर है और ठीक उसी वक़्त कोई दरवाज़ा खटखटा देता है।', hi: 'मैं अभी व्यस्त हूँ।', latin: 'Main abhi vyast hoon.', en: 'I am busy right now.' },
      { title: 'Make tomorrow plans', cue: 'You are parting at the gate with plans already half made.', cueHi: 'गेट पर विदा लेते-लेते कल का प्लान आधा बन चुका है।', hi: 'कल मिलते हैं।', latin: 'Kal milte hain.', en: 'See you tomorrow.' },
    ],
  },
  {
    id: 'health', category: 'Health', title: 'Health and help', subtitle: 'Explain a simple need and get support', level: 'Beginner', emoji: '🩺', color: '#a04c55', place: 'Clinic · pharmacy', words: ['दर्द', 'डॉक्टर', 'दवा'],
    lessons: [
      { title: 'Describe a headache', cue: 'You have been squinting at screens all day and it has caught up with you.', cueHi: 'दिन भर स्क्रीन पर आँखें गड़ाए रहने का असर अब आप पर दिखने लगा है।', hi: 'मुझे सिरदर्द है।', latin: 'Mujhe sirdard hai.', en: 'I have a headache.' },
      { title: 'Ask for a doctor', cue: 'The pharmacist listens and says this is beyond what she can hand over.', cueHi: 'केमिस्ट आपकी बात ध्यान से सुनती हैं, फिर कहती हैं कि इसकी दवा वे ऐसे नहीं दे सकतीं।', hi: 'मुझे डॉक्टर से मिलना है।', latin: 'Mujhe doctor se milna hai.', en: 'I need to see a doctor.' },
      { title: 'Ask about medicine', cue: 'You are holding a strip of tablets with instructions you cannot read.', cueHi: 'हाथ में गोलियों का पत्ता है, पर उस पर जो लिखा है वह आपसे पढ़ा ही नहीं जा रहा।', hi: 'दवा कब लेनी है?', latin: 'Davaa kab leni hai?', en: 'When should I take the medicine?' },
      { title: 'Name an allergy', cue: 'The nurse is filling in your form and looks up expectantly.', cueHi: 'नर्स आपका फ़ॉर्म भरते-भरते रुककर सवालिया नज़र से आपकी तरफ़ देखती हैं।', hi: 'मुझे एलर्जी है।', latin: 'Mujhe allergy hai.', en: 'I have an allergy.' },
      { title: 'Ask for water', cue: 'Your throat is dry and there is a cooler across the waiting room.', cueHi: 'गला सूख रहा है और वेटिंग रूम के उस पार पानी का कूलर रखा है।', hi: 'मुझे पानी चाहिए।', latin: 'Mujhe paani chahiye.', en: 'I need water.' },
      { title: 'Describe dizziness', cue: 'You stood up too quickly and the room tilted.', cueHi: 'आप झट से खड़े हुए और पूरा कमरा घूमता-सा लगने लगा।', hi: 'मुझे चक्कर आ रहा है।', latin: 'Mujhe chakkar aa raha hai.', en: 'I feel dizzy.' },
      { title: 'Ask about urgency', cue: 'The doctor has gone quiet while reading your report.', cueHi: 'डॉक्टर आपकी रिपोर्ट पढ़ते-पढ़ते एकदम चुप हो गए हैं।', hi: 'क्या यह गंभीर है?', latin: 'Kya yah gambhir hai?', en: 'Is this serious?' },
      { title: 'Find a pharmacy', cue: 'You have a prescription in hand and nowhere obvious to fill it.', cueHi: 'हाथ में डॉक्टर की पर्ची है, पर दवा कहाँ से लें, कुछ समझ नहीं आ रहा।', hi: 'मुझे फार्मेसी चाहिए।', latin: 'Mujhe pharmacy chahiye.', en: 'I need a pharmacy.' },
      { title: 'Book an appointment', cue: 'The clinic desk asks when you would like to come in.', cueHi: 'क्लीनिक के काउंटर पर आपसे पूछा जा रहा है कि आप कब आना चाहेंगे।', hi: 'मुझे अपॉइंटमेंट लेना है।', latin: 'Mujhe appointment lena hai.', en: 'I need to make an appointment.' },
      { title: 'Feel better', cue: 'Two days on, you want to reassure the person who worried.', cueHi: 'दो दिन बाद आप उस इंसान को तसल्ली देना चाहते हैं जो आपको लेकर परेशान था।', hi: 'मुझे बेहतर महसूस हो रहा है।', latin: 'Mujhe behtar mehsoos ho raha hai.', en: 'I am feeling better.' },
    ],
  },
  {
    id: 'social-life', category: 'Social', title: 'Spend time together', subtitle: 'Make plans and build friendly conversations', level: 'Beginner', emoji: '🌿', color: '#6d5ca3', place: 'Friends · neighbors', words: ['मिलकर', 'साथ', 'परिवार'],
    lessons: [
      { title: 'Meet someone', cue: 'A friend introduces you to their cousin at the door.', cueHi: 'दरवाज़े पर आपका दोस्त आपको अपने कज़िन से मिलवा रहा है।', hi: 'आपसे मिलकर खुशी हुई।', latin: 'Aapse milkar khushi hui.', en: 'Nice to meet you.' },
      { title: 'Ask about a day', cue: 'Your roommate drops onto the sofa looking completely wrung out.', cueHi: 'आपका रूममेट थका-हारा आता है और सीधे सोफ़े पर गिर पड़ता है।', hi: 'आपका दिन कैसा रहा?', latin: 'Aapka din kaisa raha?', en: 'How was your day?' },
      { title: 'Sit together', cue: 'There is space on the bench and you would rather not eat alone.', cueHi: 'बेंच पर जगह खाली है और आपका अकेले खाने का मन नहीं है।', hi: 'क्या हम साथ बैठ सकते हैं?', latin: 'Kya hum saath baith sakte hain?', en: 'Can we sit together?' },
      { title: 'Invite someone along', cue: 'You are heading to the market and would enjoy the company.', cueHi: 'आप बाज़ार जा रहे हैं और किसी का साथ मिल जाए तो अच्छा रहेगा।', hi: 'क्या आप मेरे साथ चलेंगे?', latin: 'Kya aap mere saath chalenge?', en: 'Will you come with me?' },
      { title: 'Share an interest', cue: 'The conversation turns to how everyone spends their weekends.', cueHi: 'बात चलते-चलते इस पर आ जाती है कि लोग अपना वीकेंड कैसे बिताते हैं।', hi: 'मुझे संगीत पसंद है।', latin: 'Mujhe sangeet pasand hai.', en: 'I like music.' },
      { title: 'Say it is your first time', cue: 'Everyone else at the table seems to know this place well.', cueHi: 'लगता है टेबल पर बैठे बाकी सब लोग इस जगह को अच्छे से जानते हैं।', hi: 'मैं पहली बार यहाँ आया हूँ।', latin: 'Main pehli baar yahaan aaya hoon.', en: 'This is my first time here.' },
      { title: 'Ask about work', cue: 'You have covered the weather and want to go a layer deeper.', cueHi: 'मौसम की बात तो हो चुकी, अब आप थोड़ा और गहराई में जाना चाहते हैं।', hi: 'आप क्या करते हैं?', latin: 'Aap kya karte hain?', en: 'What do you do?' },
      { title: 'Talk about family', cue: 'Someone waves at you and mouths: who is on the phone?', cueHi: 'कोई आपकी तरफ़ हाथ हिलाकर इशारे से पूछता है कि फ़ोन पर कौन है।', hi: 'मैं अपने परिवार से बात कर रहा हूँ।', latin: 'Main apne parivaar se baat kar raha hoon.', en: 'I am talking with my family.' },
      { title: 'Make a later plan', cue: 'The group is scattering but nobody wants the evening to end.', cueHi: 'सब लोग निकलने लगे हैं, पर किसी का मन नहीं है कि शाम यहीं ख़त्म हो।', hi: 'चलो, बाद में मिलते हैं।', latin: 'Chalo, baad mein milte hain.', en: 'Let us meet later.' },
      { title: 'Offer kindness', cue: 'A neighbor has quietly done you a favor for the third time.', cueHi: 'आपके पड़ोसी ने चुपचाप तीसरी बार आपकी मदद कर दी है।', hi: 'आप बहुत दयालु हैं।', latin: 'Aap bahut dayaalu hain.', en: 'You are very kind.' },
    ],
  },
  {
    id: 'work', category: 'Work', title: 'Work with clarity', subtitle: 'Coordinate, ask questions, and make commitments', level: 'Intermediate', emoji: '💼', color: '#586b91', place: 'Workday · collaboration', words: ['बैठक', 'काम', 'कल'],
    lessons: [
      { title: 'Flag a delay', cue: 'Traffic is crawling and your meeting starts in ten minutes.', cueHi: 'ट्रैफ़िक रेंग रहा है और आपकी मीटिंग दस मिनट में शुरू होने वाली है।', hi: 'मैं थोड़ी देर से आऊँगा।', latin: 'Main thodi der se aaoonga.', en: 'I will arrive a little late.' },
      { title: 'Start a meeting', cue: 'Everyone is seated and glancing at you to begin.', cueHi: 'सब लोग बैठ चुके हैं और शुरू करने के लिए आपकी तरफ़ देख रहे हैं।', hi: 'क्या हम बैठक शुरू करें?', latin: 'Kya hum baithak shuru karen?', en: 'Shall we start the meeting?' },
      { title: 'Send it later', cue: 'A colleague asks for the file while you are away from your desk.', cueHi: 'आप अपनी डेस्क से दूर हैं और तभी एक साथी आपसे वह फ़ाइल माँग लेता है।', hi: 'मैं आपको बाद में भेज दूँगा।', latin: 'Main aapko baad mein bhej doonga.', en: 'I will send it to you later.' },
      { title: 'Own a task', cue: 'A task is going around the table and nobody has claimed it.', cueHi: 'एक काम सबके सामने पड़ा है और अभी तक किसी ने उसे नहीं उठाया।', hi: 'मुझे इस पर काम करना है।', latin: 'Mujhe is par kaam karna hai.', en: 'I need to work on this.' },
      { title: 'Ask for an explanation', cue: 'The slide moved on before you had followed the point.', cueHi: 'इससे पहले कि आप बात समझ पाते, स्लाइड आगे बढ़ गई।', hi: 'क्या आप मुझे समझा सकते हैं?', latin: 'Kya aap mujhe samjha sakte hain?', en: 'Can you explain it to me?' },
      { title: 'Agree', cue: 'A proposal lands and it is exactly what you would have suggested.', cueHi: 'सामने जो सुझाव आया है, वही तो आप भी कहने वाले थे।', hi: 'मैं सहमत हूँ।', latin: 'Main sahamat hoon.', en: 'I agree.' },
      { title: 'Ask a question', cue: 'There is a gap in the plan and you are the one who spotted it.', cueHi: 'प्लान में एक कमी रह गई है और वह सिर्फ़ आपको नज़र आई है।', hi: 'मुझे एक सवाल है।', latin: 'Mujhe ek sawaal hai.', en: 'I have a question.' },
      { title: 'Check the deadline', cue: 'You have been handed work with no date attached to it.', cueHi: 'आपको काम तो मिल गया है, पर तारीख़ किसी ने बताई ही नहीं।', hi: 'समय-सीमा क्या है?', latin: 'Samay-seema kya hai?', en: 'What is the deadline?' },
      { title: 'Commit to tomorrow', cue: 'The team is weighing what can realistically be finished by tomorrow.', cueHi: 'टीम सोच रही है कि कल तक सच में कितना काम पूरा हो पाएगा।', hi: 'हम इसे कल पूरा करेंगे।', latin: 'Hum ise kal poora karenge.', en: 'We will finish it tomorrow.' },
      { title: 'Praise good work', cue: 'A teammate presents something they clearly stayed late to finish.', cueHi: 'एक साथी वह काम दिखा रहा है जिसे पूरा करने के लिए वह देर रात तक रुका रहा।', hi: 'बहुत अच्छा काम।', latin: 'Bahut achchha kaam.', en: 'Very good work.' },
    ],
  },
];

function lessonId(planId: string, lessonIndex: number) {
  return `plan-${planId}-${String(lessonIndex + 1).padStart(2, '0')}`;
}

export const lessonPlans: LessonPlan[] = planSeeds.map((plan, planIndex) => ({
  ...plan,
  order: planIndex + 1,
  lessonIds: plan.lessons.map((_, lessonIndex) => lessonId(plan.id, lessonIndex)),
}));

export const plannedLessons: Scene[] = planSeeds.flatMap((plan) => plan.lessons.map((lesson, lessonIndex) => ({
  id: lessonId(plan.id, lessonIndex),
  category: plan.category,
  words: plan.words,
  place: `${plan.place} · Lesson ${lessonIndex + 1} of 10`,
  title: lesson.title,
  subtitle: lesson.en,
  level: plan.level,
  emoji: plan.emoji,
  color: plan.color,
  beats: guidedPracticeTurns(plan, lessonIndex).map((practice) => ({
    // Asha sets the scene aloud in Hindi; the English cue doubles as the translation.
    npc: practice.target.cueHi,
    translation: practice.target.cue,
    prompt: practice.prompt,
    tip: practice.tip,
    mode: practice.mode,
    // Replies stay literal `reply:` property assignments so generate-offline-hindi-audio.mjs can find them.
    choices: [
      { ...phraseOf(practice.target), correct: true, reply: 'बहुत अच्छा।' },
      { ...phraseOf(practice.distractors[0]), correct: false, reply: 'करीब है—फिर से कोशिश कीजिए।', feedback: buildLessonFeedback(practice.target, practice.distractors[0]) },
      { ...phraseOf(practice.distractors[1]), correct: false, reply: 'अर्थ फिर से पढ़िए, फिर कोशिश कीजिए।', feedback: buildLessonFeedback(practice.target, practice.distractors[1]) },
    ],
  })),
})));
