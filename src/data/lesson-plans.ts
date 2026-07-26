import type { Choice, Scene, SceneCategory } from './scenes';

type LessonSeed = {
  title: string;
  /** A short, vivid second-person setup that puts the learner in the moment this phrase is for. */
  cue: string;
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
};

/** Ten distinct learning actions; each weaves the target's situational cue into its own kind of practice. */
const practiceActivities: readonly ((context: GuidedPracticeContext) => GuidedPracticeTurn)[] = [
  ({ target }) => ({
    prompt: `${target.cue} Listen first: replay Asha, then pick the Hindi for “${target.en}” without reading ahead.`,
    tip: `Let the shape of “${target.latin}” guide you—you are matching a sound here, not a spelling.`,
  }),
  ({ target }) => ({
    prompt: `${target.cue} Before peeking at the options, rebuild the Hindi for “${target.en}” from memory.`,
    tip: `If it will not come, start with the first word of “${target.latin}” and let the rest follow.`,
  }),
  ({ target, plan }) => ({
    prompt: `Match the meaning here. ${target.cue} Which of the three lines truly carries “${target.en}” in this moment?`,
    tip: `The other two are real ${plan.category.toLowerCase()} phrases—read each gloss to the end before you commit.`,
  }),
  ({ target }) => ({
    prompt: `${target.cue} Set the tone: of the three lines, choose the one meaning “${target.en}” that you could say out loud right now.`,
    tip: `Say “${target.latin}” evenly and unhurried; courtesy in Hindi carries in the delivery as much as the words.`,
  }),
  ({ target }) => ({
    prompt: `${target.cue} Piece it together—put the words in the order Hindi wants, then select the line for “${target.en}” below.`,
    tip: `Track “${target.latin}” from front to back; Hindi usually saves its verb for the very end.`,
  }),
  ({ target }) => ({
    prompt: `${target.cue} Whisper it: sound out “${target.latin}” under your breath, then pick the matching Devanagari.`,
    tip: `Hearing yourself say it first makes the right script jump out instead of needing to be decoded.`,
  }),
  ({ target }) => ({
    prompt: `Picture yourself in it. ${target.cue} Now give the Hindi for “${target.en}” as you would in the moment.`,
    tip: `Pin “${target.latin}” to this exact scene; a phrase with a moment attached is much harder to lose.`,
  }),
  ({ target }) => ({
    prompt: `${target.cue} Say the whole thought, not half of it—choose the complete sentence for “${target.en}” rather than a fragment of it.`,
    tip: `A single keyword only points at the idea; “${target.latin}” delivers all of it.`,
  }),
  ({ target }) => ({
    prompt: `${target.cue} Rule out the two lines that belong to some other moment, then keep the one that means “${target.en}” right here.`,
    tip: `Both wrong answers are useful phrases from this plan—they are simply answering a different question.`,
  }),
  ({ target }) => ({
    prompt: `${target.cue} Lock it in: one confident tap on the Hindi for “${target.en}”, no second-guessing.`,
    tip: `Aim for “${target.latin}” to arrive on its own next time, before you have to reach for it.`,
  }),
];

/**
 * Each lesson cycles through all ten of its plan's phrases, starting with its own. The activity
 * index steps by three per lesson, and three is coprime with ten, so every (phrase, activity)
 * pairing happens exactly once per plan—no two prompts in the catalog come out the same.
 */
function guidedPracticeTurns(plan: LessonPlanSeed, lessonIndex: number): GuidedPracticeBeat[] {
  const phraseCount = plan.lessons.length;
  return plan.lessons.map((_, turnIndex) => {
    const targetIndex = (lessonIndex + turnIndex) % phraseCount;
    const target = plan.lessons[targetIndex]!;
    const activity = practiceActivities[(3 * lessonIndex + targetIndex) % practiceActivities.length]!;
    return {
      target,
      distractors: [
        plan.lessons[(targetIndex + 3) % phraseCount]!,
        plan.lessons[(targetIndex + 7) % phraseCount]!,
      ] as const,
      ...activity({ plan, target }),
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
      { title: 'A warm hello', cue: 'A neighbor catches your eye in the stairwell and pauses.', hi: 'नमस्ते।', latin: 'Namaste.', en: 'Hello.' },
      { title: 'Say your name', cue: 'Someone extends a hand and waits for you to fill the silence.', hi: 'मेरा नाम ... है।', latin: 'Mera naam ... hai.', en: 'My name is ...' },
      { title: 'Ask how someone is', cue: 'You run into a colleague you have not seen since last week.', hi: 'आप कैसे हैं?', latin: 'Aap kaise hain?', en: 'How are you?' },
      { title: 'Say you are well', cue: 'Your host asks after you while pouring the tea.', hi: 'मैं ठीक हूँ।', latin: 'Main theek hoon.', en: 'I am well.' },
      { title: 'Slow it down', cue: 'The words are flying past you three at a time.', hi: 'कृपया धीरे बोलिए।', latin: 'Kripya dheere boliye.', en: 'Please speak slowly.' },
      { title: 'Ask to repeat', cue: 'A passing bus drowned out the last thing she said.', hi: 'कृपया दोहराइए।', latin: 'Kripya dohraiye.', en: 'Please repeat that.' },
      { title: 'Name your goal', cue: 'Someone asks why you keep carrying that little phrasebook.', hi: 'मुझे हिंदी सीखनी है।', latin: 'Mujhe Hindi seekhni hai.', en: 'I want to learn Hindi.' },
      { title: 'Say you missed it', cue: 'You nodded along for a full minute and caught none of it.', hi: 'मुझे समझ नहीं आया।', latin: 'Mujhe samajh nahin aaya.', en: 'I did not understand.' },
      { title: 'Offer thanks', cue: 'A stranger just walked two blocks out of their way for you.', hi: 'बहुत धन्यवाद।', latin: 'Bahut dhanyavaad.', en: 'Thank you very much.' },
      { title: 'Say goodbye', cue: 'The evening is winding down and you are reaching for your bag.', hi: 'फिर मिलेंगे।', latin: 'Phir milenge.', en: 'See you again.' },
    ],
  },
  {
    id: 'connection', category: 'Social', title: 'Make a connection', subtitle: 'Keep a kind conversation moving naturally', level: 'Starter', emoji: '💬', color: '#7b5fa7', place: 'A neighborhood hello', words: ['यहाँ', 'मदद', 'बात'],
    lessons: [
      { title: 'Ask where someone lives', cue: 'You are chatting on the stoop and wondering if you are neighbors.', hi: 'आप कहाँ रहते हैं?', latin: 'Aap kahaan rahte hain?', en: 'Where do you live?' },
      { title: 'Say you are new', cue: 'The shopkeeper studies you, certain he has never seen your face.', hi: 'मैं यहाँ नया हूँ।', latin: 'Main yahaan naya hoon.', en: 'I am new here.' },
      { title: 'Ask for help', cue: 'Your suitcase wheel has jammed and the stairs go up three flights.', hi: 'मुझे मदद चाहिए।', latin: 'Mujhe madad chahiye.', en: 'I need help.' },
      { title: 'Ask about English', cue: 'You have hit the edge of your vocabulary and need a bridge.', hi: 'क्या आप अंग्रेज़ी बोलते हैं?', latin: 'Kya aap angrezi bolte hain?', en: 'Do you speak English?' },
      { title: 'Share your level', cue: 'Someone launches into rapid Hindi, assuming you will keep up.', hi: 'मुझे थोड़ा हिंदी आता है।', latin: 'Mujhe thoda Hindi aata hai.', en: 'I know a little Hindi.' },
      { title: 'Say you like it', cue: 'A neighbor holds up a hand-painted cup for your opinion.', hi: 'मुझे यह पसंद है।', latin: 'Mujhe yah pasand hai.', en: 'I like this.' },
      { title: 'Say no politely', cue: 'A vendor keeps pressing a second scarf into your hands.', hi: 'मुझे यह नहीं चाहिए।', latin: 'Mujhe yah nahin chahiye.', en: 'I do not want this.' },
      { title: 'Keep it easy', cue: 'Someone apologizes for bumping your shoulder in the crowd.', hi: 'कोई बात नहीं।', latin: 'Koi baat nahin.', en: 'No problem.' },
      { title: 'Say yes warmly', cue: 'A neighbor invites you along for an evening walk.', hi: 'ज़रूर, क्यों नहीं।', latin: 'Zaroor, kyon nahin.', en: 'Sure, why not.' },
      { title: 'Take a moment', cue: 'You are asked to decide on the spot, and you would rather not rush.', hi: 'मुझे सोचने दीजिए।', latin: 'Mujhe sochne dijiye.', en: 'Let me think.' },
    ],
  },
  {
    id: 'food', category: 'Food', title: 'Eat with ease', subtitle: 'Order, customize, and pay at cafés and restaurants', level: 'Beginner', emoji: '🍽️', color: '#c86d32', place: 'A local café', words: ['मेन्यू', 'पानी', 'बिल'],
    lessons: [
      { title: 'Ask for a menu', cue: 'The waiter stops at your table, ready to take your order.', hi: 'मुझे एक मेन्यू दीजिए।', latin: 'Mujhe ek menu dijiye.', en: 'Please give me a menu.' },
      { title: 'Ask for a recommendation', cue: 'Everything on the board looks good and you cannot choose.', hi: 'आज क्या अच्छा है?', latin: 'Aaj kya achchha hai?', en: 'What is good today?' },
      { title: 'Say vegetarian', cue: 'The server launches into a description of the mutton special.', hi: 'मैं शाकाहारी हूँ।', latin: 'Main shaakahari hoon.', en: 'I am vegetarian.' },
      { title: 'Skip onions', cue: 'You spot raw onion piled high on the dish at the next table.', hi: 'मुझे बिना प्याज़ चाहिए।', latin: 'Mujhe bina pyaaz chahiye.', en: 'I need it without onions.' },
      { title: 'Reduce spice', cue: 'You love the flavor, but the curry last night ran far too hot.', hi: 'मुझे कम मसाला चाहिए।', latin: 'Mujhe kam masaala chahiye.', en: 'I need less spice.' },
      { title: 'Order water', cue: 'Your glass has been empty since the starters arrived.', hi: 'पानी दीजिए, कृपया।', latin: 'Paani dijiye, kripya.', en: 'Water, please.' },
      { title: 'Give a compliment', cue: 'The cook glances over as you take your first bite.', hi: 'यह बहुत स्वादिष्ट है।', latin: 'Yah bahut swaadisht hai.', en: 'This is very delicious.' },
      { title: 'Pack it up', cue: 'Half the thali is left and you are already full.', hi: 'मुझे पैक कर दीजिए।', latin: 'Mujhe pack kar dijiye.', en: 'Please pack this for me.' },
      { title: 'Pay by card', cue: 'You reach for your wallet and find no cash in it.', hi: 'क्या मैं कार्ड से भुगतान कर सकता हूँ?', latin: 'Kya main card se bhugtaan kar sakta hoon?', en: 'Can I pay by card?' },
      { title: 'Split the bill', cue: 'Three of you ate together and the bill lands in the middle.', hi: 'बिल बाँट दीजिए।', latin: 'Bill baant dijiye.', en: 'Please split the bill.' },
    ],
  },
  {
    id: 'getting-around', category: 'Travel', title: 'Get around town', subtitle: 'Use buses, trains, and taxis with confidence', level: 'Beginner', emoji: '🚌', color: '#287d78', place: 'City transit', words: ['बस', 'किराया', 'स्टॉप'],
    lessons: [
      { title: 'Find the bus', cue: 'You are on a corner with no bus stop sign anywhere in sight.', hi: 'बस कहाँ से मिलेगी?', latin: 'Bus kahaan se milegi?', en: 'Where can I get the bus?' },
      { title: 'Name your destination', cue: 'The driver looks back at you, waiting to hear where to.', hi: 'मुझे पुराना शहर जाना है।', latin: 'Mujhe puraana shahar jaana hai.', en: 'I need to go to the old city.' },
      { title: 'Ask the distance', cue: 'The map on your phone has stopped loading entirely.', hi: 'यहाँ से कितना दूर है?', latin: 'Yahaan se kitna door hai?', en: 'How far is it from here?' },
      { title: 'Ask to walk', cue: 'The fare sounds steep for what looks like a short hop.', hi: 'क्या मैं पैदल जा सकता हूँ?', latin: 'Kya main paidal ja sakta hoon?', en: 'Can I walk there?' },
      { title: 'Ask the fare', cue: 'You are holding a fistful of notes and no idea what to hand over.', hi: 'किराया कितना है?', latin: 'Kiraaya kitna hai?', en: 'How much is the fare?' },
      { title: 'Find your stop', cue: 'The bus slows down and nobody announces where you are.', hi: 'अगला स्टॉप कौन-सा है?', latin: 'Agla stop kaun-sa hai?', en: 'Which is the next stop?' },
      { title: 'Get off here', cue: 'You spot your building through the window, earlier than planned.', hi: 'मुझे यहीं उतरना है।', latin: 'Mujhe yaheen utarna hai.', en: 'I need to get off here.' },
      { title: 'Check a delay', cue: 'The platform clock passed departure time ten minutes ago.', hi: 'ट्रेन देर से है क्या?', latin: 'Train der se hai kya?', en: 'Is the train delayed?' },
      { title: 'Ask for a seat', cue: 'There is one empty seat, and a bag is sitting on it.', hi: 'यह सीट खाली है क्या?', latin: 'Yah seat khaali hai kya?', en: 'Is this seat free?' },
      { title: 'Ask for a map', cue: 'The route diagram on the wall has faded to nothing.', hi: 'मुझे एक नक्शा चाहिए।', latin: 'Mujhe ek naksha chahiye.', en: 'I need a map.' },
    ],
  },
  {
    id: 'directions', category: 'Travel', title: 'Find your way', subtitle: 'Follow and ask for simple directions', level: 'Beginner', emoji: '🧭', color: '#4e7792', place: 'A busy crossing', words: ['सीधा', 'बाएँ', 'रास्ता'],
    lessons: [
      { title: 'Go straight', cue: 'A stranger asks you the way, and for once the answer is simple.', hi: 'सीधा जाइए।', latin: 'Seedha jaiye.', en: 'Go straight.' },
      { title: 'Turn left', cue: 'You are guiding a driver who is waiting for the next instruction.', hi: 'बाएँ मुड़िए।', latin: 'Baen muriye.', en: 'Turn left.' },
      { title: 'Turn right', cue: 'The turn is coming up fast and the driver needs to hear it now.', hi: 'दाएँ मुड़िए।', latin: 'Daen muriye.', en: 'Turn right.' },
      { title: 'Stop at the corner', cue: 'Your building sits just past the crossing, so this is close enough.', hi: 'कोने पर रुकिए।', latin: 'Kone par rukiye.', en: 'Stop at the corner.' },
      { title: 'Find the metro', cue: 'You can hear trains somewhere below but see no entrance.', hi: 'मेट्रो स्टेशन पास है क्या?', latin: 'Metro station paas hai kya?', en: 'Is the metro station nearby?' },
      { title: 'Find a hospital', cue: 'A friend needs care and you do not know which way to walk.', hi: 'मुझे अस्पताल ढूँढना है।', latin: 'Mujhe aspataal dhoondhna hai.', en: 'I need to find a hospital.' },
      { title: 'Check the route', cue: 'You have walked ten minutes and nothing looks familiar yet.', hi: 'क्या यह सही रास्ता है?', latin: 'Kya yah sahi raasta hai?', en: 'Is this the right way?' },
      { title: 'Ask to be shown', cue: 'Pointing and gesturing has failed; you need it laid out for you.', hi: 'कृपया मुझे दिखाइए।', latin: 'Kripya mujhe dikhaiye.', en: 'Please show me.' },
      { title: 'Say you are lost', cue: 'Every lane here looks the same and your map is no help.', hi: 'मैं रास्ता भूल गया हूँ।', latin: 'Main raasta bhool gaya hoon.', en: 'I am lost.' },
      { title: 'Find a taxi', cue: 'It is starting to rain and walking is no longer an option.', hi: 'यहाँ टैक्सी मिलती है क्या?', latin: 'Yahaan taxi milti hai kya?', en: 'Can I get a taxi here?' },
    ],
  },
  {
    id: 'shopping', category: 'Everyday', title: 'Shop and pay', subtitle: 'Compare, choose, and check out politely', level: 'Beginner', emoji: '🛍️', color: '#b27931', place: 'A neighborhood shop', words: ['दाम', 'साइज़', 'रसीद'],
    lessons: [
      { title: 'Ask the price', cue: 'You are turning a brass bowl over in your hands, hunting for a price tag.', hi: 'यह कितने का है?', latin: 'Yah kitne ka hai?', en: 'How much is this?' },
      { title: 'Ask for less', cue: 'The first number the seller says is clearly a starting number.', hi: 'थोड़ा कम कीजिए।', latin: 'Thoda kam kijiye.', en: 'Please lower it a little.' },
      { title: 'Say you have no cash', cue: 'The shopkeeper nods toward a hand-lettered cash-only sign.', hi: 'मेरे पास नकद नहीं है।', latin: 'Mere paas nakad nahin hai.', en: 'I do not have cash.' },
      { title: 'Find a smaller size', cue: 'The shirt hangs off your shoulders in the mirror.', hi: 'क्या आपके पास छोटा साइज़ है?', latin: 'Kya aapke paas chhota size hai?', en: 'Do you have a smaller size?' },
      { title: 'Try it on', cue: 'You like the kurta but cannot tell how it will actually sit.', hi: 'मैं इसे पहनकर देख सकता हूँ?', latin: 'Main ise pehenkar dekh sakta hoon?', en: 'Can I try this on?' },
      { title: 'Choose another color', cue: 'The fit is perfect; the mustard yellow is not.', hi: 'मुझे दूसरा रंग चाहिए।', latin: 'Mujhe doosra rang chahiye.', en: 'I need another color.' },
      { title: 'Ask for a receipt', cue: 'The cashier hands back your change and nothing else.', hi: 'रसीद दीजिए, कृपया।', latin: 'Raseed dijiye, kripya.', en: 'A receipt, please.' },
      { title: 'Just browsing', cue: 'A helpful assistant has followed you down two aisles now.', hi: 'मैं बस देख रहा हूँ।', latin: 'Main bas dekh raha hoon.', en: 'I am just looking.' },
      { title: 'Ask about returns', cue: 'It is a gift, and you are not sure it will fit.', hi: 'क्या यह वापस हो सकता है?', latin: 'Kya yah vaapas ho sakta hai?', en: 'Can this be returned?' },
      { title: 'Ask for a bag', cue: 'Your arms are full and you still have to walk home.', hi: 'मुझे एक बैग चाहिए।', latin: 'Mujhe ek bag chahiye.', en: 'I need a bag.' },
    ],
  },
  {
    id: 'daily-life', category: 'Everyday', title: 'Daily life', subtitle: 'Describe routines, weather, and plans at home', level: 'Beginner', emoji: '🏠', color: '#63754c', place: 'Home · every day', words: ['सुबह', 'घर', 'कल'],
    lessons: [
      { title: 'Start the morning', cue: 'A new friend asks what your days actually look like.', hi: 'मैं सुबह जल्दी उठता हूँ।', latin: 'Main subah jaldi uthta hoon.', en: 'I wake up early in the morning.' },
      { title: 'Make tea', cue: 'The kettle is empty and guests are already on their way over.', hi: 'मुझे चाय बनानी है।', latin: 'Mujhe chai banaani hai.', en: 'I need to make tea.' },
      { title: 'Talk about heat', cue: 'The fan is on high and it is barely helping.', hi: 'आज बहुत गर्मी है।', latin: 'Aaj bahut garmi hai.', en: 'It is very hot today.' },
      { title: 'Talk about rain', cue: 'Someone at the door asks whether they need an umbrella.', hi: 'बाहर बारिश हो रही है।', latin: 'Baahar baarish ho rahi hai.', en: 'It is raining outside.' },
      { title: 'Work from home', cue: 'A neighbor wonders why you never leave in the morning.', hi: 'मैं घर पर काम करता हूँ।', latin: 'Main ghar par kaam karta hoon.', en: 'I work from home.' },
      { title: 'Close the window', cue: 'Dust is blowing in and papers are lifting off the table.', hi: 'कृपया खिड़की बंद कर दीजिए।', latin: 'Kripya khidki band kar dijiye.', en: 'Please close the window.' },
      { title: 'Ask for a rest', cue: 'You have been on your feet since breakfast.', hi: 'मुझे थोड़ा आराम चाहिए।', latin: 'Mujhe thoda aaraam chahiye.', en: 'I need a little rest.' },
      { title: 'Talk later', cue: 'The call has to end but the conversation is not finished.', hi: 'हम बाद में बात करेंगे।', latin: 'Hum baad mein baat karenge.', en: 'We will talk later.' },
      { title: 'Say you are busy', cue: 'Someone knocks while you are in the middle of a deadline.', hi: 'मैं अभी व्यस्त हूँ।', latin: 'Main abhi vyast hoon.', en: 'I am busy right now.' },
      { title: 'Make tomorrow plans', cue: 'You are parting at the gate with plans already half made.', hi: 'कल मिलते हैं।', latin: 'Kal milte hain.', en: 'See you tomorrow.' },
    ],
  },
  {
    id: 'health', category: 'Health', title: 'Health and help', subtitle: 'Explain a simple need and get support', level: 'Beginner', emoji: '🩺', color: '#a04c55', place: 'Clinic · pharmacy', words: ['दर्द', 'डॉक्टर', 'दवा'],
    lessons: [
      { title: 'Describe a headache', cue: 'You have been squinting at screens all day and it has caught up with you.', hi: 'मुझे सिरदर्द है।', latin: 'Mujhe sirdard hai.', en: 'I have a headache.' },
      { title: 'Ask for a doctor', cue: 'The pharmacist listens and says this is beyond what she can hand over.', hi: 'मुझे डॉक्टर से मिलना है।', latin: 'Mujhe doctor se milna hai.', en: 'I need to see a doctor.' },
      { title: 'Ask about medicine', cue: 'You are holding a strip of tablets with instructions you cannot read.', hi: 'दवा कब लेनी है?', latin: 'Davaa kab leni hai?', en: 'When should I take the medicine?' },
      { title: 'Name an allergy', cue: 'The nurse is filling in your form and looks up expectantly.', hi: 'मुझे एलर्जी है।', latin: 'Mujhe allergy hai.', en: 'I have an allergy.' },
      { title: 'Ask for water', cue: 'Your throat is dry and there is a cooler across the waiting room.', hi: 'मुझे पानी चाहिए।', latin: 'Mujhe paani chahiye.', en: 'I need water.' },
      { title: 'Describe dizziness', cue: 'You stood up too quickly and the room tilted.', hi: 'मुझे चक्कर आ रहा है।', latin: 'Mujhe chakkar aa raha hai.', en: 'I feel dizzy.' },
      { title: 'Ask about urgency', cue: 'The doctor has gone quiet while reading your report.', hi: 'क्या यह गंभीर है?', latin: 'Kya yah gambhir hai?', en: 'Is this serious?' },
      { title: 'Find a pharmacy', cue: 'You have a prescription in hand and nowhere obvious to fill it.', hi: 'मुझे फार्मेसी चाहिए।', latin: 'Mujhe pharmacy chahiye.', en: 'I need a pharmacy.' },
      { title: 'Book an appointment', cue: 'The clinic desk asks when you would like to come in.', hi: 'मुझे अपॉइंटमेंट लेना है।', latin: 'Mujhe appointment lena hai.', en: 'I need to make an appointment.' },
      { title: 'Feel better', cue: 'Two days on, you want to reassure the person who worried.', hi: 'मुझे बेहतर महसूस हो रहा है।', latin: 'Mujhe behtar mehsoos ho raha hai.', en: 'I am feeling better.' },
    ],
  },
  {
    id: 'social-life', category: 'Social', title: 'Spend time together', subtitle: 'Make plans and build friendly conversations', level: 'Beginner', emoji: '🌿', color: '#6d5ca3', place: 'Friends · neighbors', words: ['मिलकर', 'साथ', 'परिवार'],
    lessons: [
      { title: 'Meet someone', cue: 'A friend introduces you to their cousin at the door.', hi: 'आपसे मिलकर खुशी हुई।', latin: 'Aapse milkar khushi hui.', en: 'Nice to meet you.' },
      { title: 'Ask about a day', cue: 'Your roommate drops onto the sofa looking completely wrung out.', hi: 'आपका दिन कैसा रहा?', latin: 'Aapka din kaisa raha?', en: 'How was your day?' },
      { title: 'Sit together', cue: 'There is space on the bench and you would rather not eat alone.', hi: 'क्या हम साथ बैठ सकते हैं?', latin: 'Kya hum saath baith sakte hain?', en: 'Can we sit together?' },
      { title: 'Invite someone along', cue: 'You are heading to the market and would enjoy the company.', hi: 'क्या आप मेरे साथ चलेंगे?', latin: 'Kya aap mere saath chalenge?', en: 'Will you come with me?' },
      { title: 'Share an interest', cue: 'The conversation turns to how everyone spends their weekends.', hi: 'मुझे संगीत पसंद है।', latin: 'Mujhe sangeet pasand hai.', en: 'I like music.' },
      { title: 'Say it is your first time', cue: 'Everyone else at the table seems to know this place well.', hi: 'मैं पहली बार यहाँ आया हूँ।', latin: 'Main pehli baar yahaan aaya hoon.', en: 'This is my first time here.' },
      { title: 'Ask about work', cue: 'You have covered the weather and want to go a layer deeper.', hi: 'आप क्या करते हैं?', latin: 'Aap kya karte hain?', en: 'What do you do?' },
      { title: 'Talk about family', cue: 'Someone waves at you and mouths: who is on the phone?', hi: 'मैं अपने परिवार से बात कर रहा हूँ।', latin: 'Main apne parivaar se baat kar raha hoon.', en: 'I am talking with my family.' },
      { title: 'Make a later plan', cue: 'The group is scattering but nobody wants the evening to end.', hi: 'चलो, बाद में मिलते हैं।', latin: 'Chalo, baad mein milte hain.', en: 'Let us meet later.' },
      { title: 'Offer kindness', cue: 'A neighbor has quietly done you a favor for the third time.', hi: 'आप बहुत दयालु हैं।', latin: 'Aap bahut dayaalu hain.', en: 'You are very kind.' },
    ],
  },
  {
    id: 'work', category: 'Work', title: 'Work with clarity', subtitle: 'Coordinate, ask questions, and make commitments', level: 'Intermediate', emoji: '💼', color: '#586b91', place: 'Workday · collaboration', words: ['बैठक', 'काम', 'कल'],
    lessons: [
      { title: 'Flag a delay', cue: 'Traffic is crawling and your meeting starts in ten minutes.', hi: 'मैं थोड़ी देर से आऊँगा।', latin: 'Main thodi der se aaoonga.', en: 'I will arrive a little late.' },
      { title: 'Start a meeting', cue: 'Everyone is seated and glancing at you to begin.', hi: 'क्या हम बैठक शुरू करें?', latin: 'Kya hum baithak shuru karen?', en: 'Shall we start the meeting?' },
      { title: 'Send it later', cue: 'A colleague asks for the file while you are away from your desk.', hi: 'मैं आपको बाद में भेज दूँगा।', latin: 'Main aapko baad mein bhej doonga.', en: 'I will send it to you later.' },
      { title: 'Own a task', cue: 'A task is going around the table and nobody has claimed it.', hi: 'मुझे इस पर काम करना है।', latin: 'Mujhe is par kaam karna hai.', en: 'I need to work on this.' },
      { title: 'Ask for an explanation', cue: 'The slide moved on before you had followed the point.', hi: 'क्या आप मुझे समझा सकते हैं?', latin: 'Kya aap mujhe samjha sakte hain?', en: 'Can you explain it to me?' },
      { title: 'Agree', cue: 'A proposal lands and it is exactly what you would have suggested.', hi: 'मैं सहमत हूँ।', latin: 'Main sahamat hoon.', en: 'I agree.' },
      { title: 'Ask a question', cue: 'There is a gap in the plan and you are the one who spotted it.', hi: 'मुझे एक सवाल है।', latin: 'Mujhe ek sawaal hai.', en: 'I have a question.' },
      { title: 'Check the deadline', cue: 'You have been handed work with no date attached to it.', hi: 'समय-सीमा क्या है?', latin: 'Samay-seema kya hai?', en: 'What is the deadline?' },
      { title: 'Commit to tomorrow', cue: 'The team is weighing what can realistically be finished by tomorrow.', hi: 'हम इसे कल पूरा करेंगे।', latin: 'Hum ise kal poora karenge.', en: 'We will finish it tomorrow.' },
      { title: 'Praise good work', cue: 'A teammate presents something they clearly stayed late to finish.', hi: 'बहुत अच्छा काम।', latin: 'Bahut achchha kaam.', en: 'Very good work.' },
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
    npc: 'यह वाक्य बोलिए।',
    translation: 'Say this useful phrase.',
    prompt: practice.prompt,
    tip: practice.tip,
    // Replies stay literal `reply:` property assignments so generate-offline-hindi-audio.mjs can find them.
    choices: [
      { ...phraseOf(practice.target), correct: true, reply: 'बहुत अच्छा।' },
      { ...phraseOf(practice.distractors[0]), correct: false, reply: 'करीब है—फिर से कोशिश कीजिए।' },
      { ...phraseOf(practice.distractors[1]), correct: false, reply: 'अर्थ फिर से पढ़िए, फिर कोशिश कीजिए।' },
    ],
  })),
})));
