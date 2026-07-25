import type { Scene, SceneCategory } from './scenes';

type LessonSeed = {
  title: string;
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

const practiceTurns = [
  {
    prompt: (meaning: string) => `Listen, then choose the phrase for “${meaning}”`,
    tip: 'Start by matching the meaning. You can replay Asha before you answer.',
  },
  {
    prompt: (meaning: string) => `Choose the natural Hindi for “${meaning}”`,
    tip: 'Look for the phrase that carries the complete idea, not just one familiar word.',
  },
  {
    prompt: (meaning: string) => `Keep the meaning in mind: “${meaning}”`,
    tip: 'Read the Romanized Hindi out loud once, then choose the same phrase in Devanagari.',
  },
  {
    prompt: (meaning: string) => `Use this phrase politely: “${meaning}”`,
    tip: 'Notice the polite rhythm. Small words such as कृपया make a practical phrase warmer.',
  },
  {
    prompt: (meaning: string) => `Quick recall: how would you say “${meaning}”?`,
    tip: 'Try answering before you compare the choices. This is how recall starts to feel automatic.',
  },
  {
    prompt: (meaning: string) => `Hear it again, then answer: “${meaning}”`,
    tip: 'Listen for the end of the phrase—the final word often holds the sentence together.',
  },
  {
    prompt: (meaning: string) => `In a real conversation, say: “${meaning}”`,
    tip: 'Imagine the place named at the top of the lesson. A small mental scene makes the phrase stick.',
  },
  {
    prompt: (meaning: string) => `Choose it with confidence: “${meaning}”`,
    tip: 'You have seen this phrase a few times now. Trust the pattern you recognize.',
  },
  {
    prompt: (meaning: string) => `One more check: “${meaning}”`,
    tip: 'Aim for a calm, useful answer—not perfect memorization on the first try.',
  },
  {
    prompt: (meaning: string) => `Finish the practice set: “${meaning}”`,
    tip: 'This final recall helps move the phrase from recognition into ready-to-use memory.',
  },
] as const;

const planSeeds: LessonPlanSeed[] = [
  {
    id: 'essentials', category: 'Social', title: 'Start speaking', subtitle: 'Ten first phrases for a warm, confident opening', level: 'Starter', emoji: '👋', color: '#a85a43', place: 'Everywhere · first week', words: ['नमस्ते', 'कृपया', 'धन्यवाद'],
    lessons: [
      { title: 'A warm hello', hi: 'नमस्ते।', latin: 'Namaste.', en: 'Hello.' },
      { title: 'Say your name', hi: 'मेरा नाम ... है।', latin: 'Mera naam ... hai.', en: 'My name is ...' },
      { title: 'Ask how someone is', hi: 'आप कैसे हैं?', latin: 'Aap kaise hain?', en: 'How are you?' },
      { title: 'Say you are well', hi: 'मैं ठीक हूँ।', latin: 'Main theek hoon.', en: 'I am well.' },
      { title: 'Slow it down', hi: 'कृपया धीरे बोलिए।', latin: 'Kripya dheere boliye.', en: 'Please speak slowly.' },
      { title: 'Ask to repeat', hi: 'कृपया दोहराइए।', latin: 'Kripya dohraiye.', en: 'Please repeat that.' },
      { title: 'Name your goal', hi: 'मुझे हिंदी सीखनी है।', latin: 'Mujhe Hindi seekhni hai.', en: 'I want to learn Hindi.' },
      { title: 'Say you missed it', hi: 'मुझे समझ नहीं आया।', latin: 'Mujhe samajh nahin aaya.', en: 'I did not understand.' },
      { title: 'Offer thanks', hi: 'बहुत धन्यवाद।', latin: 'Bahut dhanyavaad.', en: 'Thank you very much.' },
      { title: 'Say goodbye', hi: 'फिर मिलेंगे।', latin: 'Phir milenge.', en: 'See you again.' },
    ],
  },
  {
    id: 'connection', category: 'Social', title: 'Make a connection', subtitle: 'Keep a kind conversation moving naturally', level: 'Starter', emoji: '💬', color: '#7b5fa7', place: 'A neighborhood hello', words: ['यहाँ', 'मदद', 'बात'],
    lessons: [
      { title: 'Ask where someone lives', hi: 'आप कहाँ रहते हैं?', latin: 'Aap kahaan rahte hain?', en: 'Where do you live?' },
      { title: 'Say you are new', hi: 'मैं यहाँ नया हूँ।', latin: 'Main yahaan naya hoon.', en: 'I am new here.' },
      { title: 'Ask for help', hi: 'मुझे मदद चाहिए।', latin: 'Mujhe madad chahiye.', en: 'I need help.' },
      { title: 'Ask about English', hi: 'क्या आप अंग्रेज़ी बोलते हैं?', latin: 'Kya aap angrezi bolte hain?', en: 'Do you speak English?' },
      { title: 'Share your level', hi: 'मुझे थोड़ा हिंदी आता है।', latin: 'Mujhe thoda Hindi aata hai.', en: 'I know a little Hindi.' },
      { title: 'Say you like it', hi: 'मुझे यह पसंद है।', latin: 'Mujhe yah pasand hai.', en: 'I like this.' },
      { title: 'Say no politely', hi: 'मुझे यह नहीं चाहिए।', latin: 'Mujhe yah nahin chahiye.', en: 'I do not want this.' },
      { title: 'Keep it easy', hi: 'कोई बात नहीं।', latin: 'Koi baat nahin.', en: 'No problem.' },
      { title: 'Say yes warmly', hi: 'ज़रूर, क्यों नहीं।', latin: 'Zaroor, kyon nahin.', en: 'Sure, why not.' },
      { title: 'Take a moment', hi: 'मुझे सोचने दीजिए।', latin: 'Mujhe sochne dijiye.', en: 'Let me think.' },
    ],
  },
  {
    id: 'food', category: 'Food', title: 'Eat with ease', subtitle: 'Order, customize, and pay at cafés and restaurants', level: 'Beginner', emoji: '🍽️', color: '#c86d32', place: 'A local café', words: ['मेन्यू', 'पानी', 'बिल'],
    lessons: [
      { title: 'Ask for a menu', hi: 'मुझे एक मेन्यू दीजिए।', latin: 'Mujhe ek menu dijiye.', en: 'Please give me a menu.' },
      { title: 'Ask for a recommendation', hi: 'आज क्या अच्छा है?', latin: 'Aaj kya achchha hai?', en: 'What is good today?' },
      { title: 'Say vegetarian', hi: 'मैं शाकाहारी हूँ।', latin: 'Main shaakahari hoon.', en: 'I am vegetarian.' },
      { title: 'Skip onions', hi: 'मुझे बिना प्याज़ चाहिए।', latin: 'Mujhe bina pyaaz chahiye.', en: 'I need it without onions.' },
      { title: 'Reduce spice', hi: 'मुझे कम मसाला चाहिए।', latin: 'Mujhe kam masaala chahiye.', en: 'I need less spice.' },
      { title: 'Order water', hi: 'पानी दीजिए, कृपया।', latin: 'Paani dijiye, kripya.', en: 'Water, please.' },
      { title: 'Give a compliment', hi: 'यह बहुत स्वादिष्ट है।', latin: 'Yah bahut swaadisht hai.', en: 'This is very delicious.' },
      { title: 'Pack it up', hi: 'मुझे पैक कर दीजिए।', latin: 'Mujhe pack kar dijiye.', en: 'Please pack this for me.' },
      { title: 'Pay by card', hi: 'क्या मैं कार्ड से भुगतान कर सकता हूँ?', latin: 'Kya main card se bhugtaan kar sakta hoon?', en: 'Can I pay by card?' },
      { title: 'Split the bill', hi: 'बिल बाँट दीजिए।', latin: 'Bill baant dijiye.', en: 'Please split the bill.' },
    ],
  },
  {
    id: 'getting-around', category: 'Travel', title: 'Get around town', subtitle: 'Use buses, trains, and taxis with confidence', level: 'Beginner', emoji: '🚌', color: '#287d78', place: 'City transit', words: ['बस', 'किराया', 'स्टॉप'],
    lessons: [
      { title: 'Find the bus', hi: 'बस कहाँ से मिलेगी?', latin: 'Bus kahaan se milegi?', en: 'Where can I get the bus?' },
      { title: 'Name your destination', hi: 'मुझे पुराना शहर जाना है।', latin: 'Mujhe puraana shahar jaana hai.', en: 'I need to go to the old city.' },
      { title: 'Ask the distance', hi: 'यहाँ से कितना दूर है?', latin: 'Yahaan se kitna door hai?', en: 'How far is it from here?' },
      { title: 'Ask to walk', hi: 'क्या मैं पैदल जा सकता हूँ?', latin: 'Kya main paidal ja sakta hoon?', en: 'Can I walk there?' },
      { title: 'Ask the fare', hi: 'किराया कितना है?', latin: 'Kiraaya kitna hai?', en: 'How much is the fare?' },
      { title: 'Find your stop', hi: 'अगला स्टॉप कौन-सा है?', latin: 'Agla stop kaun-sa hai?', en: 'Which is the next stop?' },
      { title: 'Get off here', hi: 'मुझे यहीं उतरना है।', latin: 'Mujhe yaheen utarna hai.', en: 'I need to get off here.' },
      { title: 'Check a delay', hi: 'ट्रेन देर से है क्या?', latin: 'Train der se hai kya?', en: 'Is the train delayed?' },
      { title: 'Ask for a seat', hi: 'यह सीट खाली है क्या?', latin: 'Yah seat khaali hai kya?', en: 'Is this seat free?' },
      { title: 'Ask for a map', hi: 'मुझे एक नक्शा चाहिए।', latin: 'Mujhe ek naksha chahiye.', en: 'I need a map.' },
    ],
  },
  {
    id: 'directions', category: 'Travel', title: 'Find your way', subtitle: 'Follow and ask for simple directions', level: 'Beginner', emoji: '🧭', color: '#4e7792', place: 'A busy crossing', words: ['सीधा', 'बाएँ', 'रास्ता'],
    lessons: [
      { title: 'Go straight', hi: 'सीधा जाइए।', latin: 'Seedha jaiye.', en: 'Go straight.' },
      { title: 'Turn left', hi: 'बाएँ मुड़िए।', latin: 'Baen muriye.', en: 'Turn left.' },
      { title: 'Turn right', hi: 'दाएँ मुड़िए।', latin: 'Daen muriye.', en: 'Turn right.' },
      { title: 'Stop at the corner', hi: 'कोने पर रुकिए।', latin: 'Kone par rukiye.', en: 'Stop at the corner.' },
      { title: 'Find the metro', hi: 'मेट्रो स्टेशन पास है क्या?', latin: 'Metro station paas hai kya?', en: 'Is the metro station nearby?' },
      { title: 'Find a hospital', hi: 'मुझे अस्पताल ढूँढना है।', latin: 'Mujhe aspataal dhoondhna hai.', en: 'I need to find a hospital.' },
      { title: 'Check the route', hi: 'क्या यह सही रास्ता है?', latin: 'Kya yah sahi raasta hai?', en: 'Is this the right way?' },
      { title: 'Ask to be shown', hi: 'कृपया मुझे दिखाइए।', latin: 'Kripya mujhe dikhaiye.', en: 'Please show me.' },
      { title: 'Say you are lost', hi: 'मैं रास्ता भूल गया हूँ।', latin: 'Main raasta bhool gaya hoon.', en: 'I am lost.' },
      { title: 'Find a taxi', hi: 'यहाँ टैक्सी मिलती है क्या?', latin: 'Yahaan taxi milti hai kya?', en: 'Can I get a taxi here?' },
    ],
  },
  {
    id: 'shopping', category: 'Everyday', title: 'Shop and pay', subtitle: 'Compare, choose, and check out politely', level: 'Beginner', emoji: '🛍️', color: '#b27931', place: 'A neighborhood shop', words: ['दाम', 'साइज़', 'रसीद'],
    lessons: [
      { title: 'Ask the price', hi: 'यह कितने का है?', latin: 'Yah kitne ka hai?', en: 'How much is this?' },
      { title: 'Ask for less', hi: 'थोड़ा कम कीजिए।', latin: 'Thoda kam kijiye.', en: 'Please lower it a little.' },
      { title: 'Say you have no cash', hi: 'मेरे पास नकद नहीं है।', latin: 'Mere paas nakad nahin hai.', en: 'I do not have cash.' },
      { title: 'Find a smaller size', hi: 'क्या आपके पास छोटा साइज़ है?', latin: 'Kya aapke paas chhota size hai?', en: 'Do you have a smaller size?' },
      { title: 'Try it on', hi: 'मैं इसे पहनकर देख सकता हूँ?', latin: 'Main ise pehenkar dekh sakta hoon?', en: 'Can I try this on?' },
      { title: 'Choose another color', hi: 'मुझे दूसरा रंग चाहिए।', latin: 'Mujhe doosra rang chahiye.', en: 'I need another color.' },
      { title: 'Ask for a receipt', hi: 'रसीद दीजिए, कृपया।', latin: 'Raseed dijiye, kripya.', en: 'A receipt, please.' },
      { title: 'Just browsing', hi: 'मैं बस देख रहा हूँ।', latin: 'Main bas dekh raha hoon.', en: 'I am just looking.' },
      { title: 'Ask about returns', hi: 'क्या यह वापस हो सकता है?', latin: 'Kya yah vaapas ho sakta hai?', en: 'Can this be returned?' },
      { title: 'Ask for a bag', hi: 'मुझे एक बैग चाहिए।', latin: 'Mujhe ek bag chahiye.', en: 'I need a bag.' },
    ],
  },
  {
    id: 'daily-life', category: 'Everyday', title: 'Daily life', subtitle: 'Describe routines, weather, and plans at home', level: 'Beginner', emoji: '🏠', color: '#63754c', place: 'Home · every day', words: ['सुबह', 'घर', 'कल'],
    lessons: [
      { title: 'Start the morning', hi: 'मैं सुबह जल्दी उठता हूँ।', latin: 'Main subah jaldi uthta hoon.', en: 'I wake up early in the morning.' },
      { title: 'Make tea', hi: 'मुझे चाय बनानी है।', latin: 'Mujhe chai banaani hai.', en: 'I need to make tea.' },
      { title: 'Talk about heat', hi: 'आज बहुत गर्मी है।', latin: 'Aaj bahut garmi hai.', en: 'It is very hot today.' },
      { title: 'Talk about rain', hi: 'बाहर बारिश हो रही है।', latin: 'Baahar baarish ho rahi hai.', en: 'It is raining outside.' },
      { title: 'Work from home', hi: 'मैं घर पर काम करता हूँ।', latin: 'Main ghar par kaam karta hoon.', en: 'I work from home.' },
      { title: 'Close the window', hi: 'कृपया खिड़की बंद कर दीजिए।', latin: 'Kripya khidki band kar dijiye.', en: 'Please close the window.' },
      { title: 'Ask for a rest', hi: 'मुझे थोड़ा आराम चाहिए।', latin: 'Mujhe thoda aaraam chahiye.', en: 'I need a little rest.' },
      { title: 'Talk later', hi: 'हम बाद में बात करेंगे।', latin: 'Hum baad mein baat karenge.', en: 'We will talk later.' },
      { title: 'Say you are busy', hi: 'मैं अभी व्यस्त हूँ।', latin: 'Main abhi vyast hoon.', en: 'I am busy right now.' },
      { title: 'Make tomorrow plans', hi: 'कल मिलते हैं।', latin: 'Kal milte hain.', en: 'See you tomorrow.' },
    ],
  },
  {
    id: 'health', category: 'Health', title: 'Health and help', subtitle: 'Explain a simple need and get support', level: 'Beginner', emoji: '🩺', color: '#a04c55', place: 'Clinic · pharmacy', words: ['दर्द', 'डॉक्टर', 'दवा'],
    lessons: [
      { title: 'Describe a headache', hi: 'मुझे सिरदर्द है।', latin: 'Mujhe sirdard hai.', en: 'I have a headache.' },
      { title: 'Ask for a doctor', hi: 'मुझे डॉक्टर से मिलना है।', latin: 'Mujhe doctor se milna hai.', en: 'I need to see a doctor.' },
      { title: 'Ask about medicine', hi: 'दवा कब लेनी है?', latin: 'Davaa kab leni hai?', en: 'When should I take the medicine?' },
      { title: 'Name an allergy', hi: 'मुझे एलर्जी है।', latin: 'Mujhe allergy hai.', en: 'I have an allergy.' },
      { title: 'Ask for water', hi: 'मुझे पानी चाहिए।', latin: 'Mujhe paani chahiye.', en: 'I need water.' },
      { title: 'Describe dizziness', hi: 'मुझे चक्कर आ रहा है।', latin: 'Mujhe chakkar aa raha hai.', en: 'I feel dizzy.' },
      { title: 'Ask about urgency', hi: 'क्या यह गंभीर है?', latin: 'Kya yah gambhir hai?', en: 'Is this serious?' },
      { title: 'Find a pharmacy', hi: 'मुझे फार्मेसी चाहिए।', latin: 'Mujhe pharmacy chahiye.', en: 'I need a pharmacy.' },
      { title: 'Book an appointment', hi: 'मुझे अपॉइंटमेंट लेना है।', latin: 'Mujhe appointment lena hai.', en: 'I need to make an appointment.' },
      { title: 'Feel better', hi: 'मुझे बेहतर महसूस हो रहा है।', latin: 'Mujhe behtar mehsoos ho raha hai.', en: 'I am feeling better.' },
    ],
  },
  {
    id: 'social-life', category: 'Social', title: 'Spend time together', subtitle: 'Make plans and build friendly conversations', level: 'Beginner', emoji: '🌿', color: '#6d5ca3', place: 'Friends · neighbors', words: ['मिलकर', 'साथ', 'परिवार'],
    lessons: [
      { title: 'Meet someone', hi: 'आपसे मिलकर खुशी हुई।', latin: 'Aapse milkar khushi hui.', en: 'Nice to meet you.' },
      { title: 'Ask about a day', hi: 'आपका दिन कैसा रहा?', latin: 'Aapka din kaisa raha?', en: 'How was your day?' },
      { title: 'Sit together', hi: 'क्या हम साथ बैठ सकते हैं?', latin: 'Kya hum saath baith sakte hain?', en: 'Can we sit together?' },
      { title: 'Invite someone along', hi: 'क्या आप मेरे साथ चलेंगे?', latin: 'Kya aap mere saath chalenge?', en: 'Will you come with me?' },
      { title: 'Share an interest', hi: 'मुझे संगीत पसंद है।', latin: 'Mujhe sangeet pasand hai.', en: 'I like music.' },
      { title: 'Say it is your first time', hi: 'मैं पहली बार यहाँ आया हूँ।', latin: 'Main pehli baar yahaan aaya hoon.', en: 'This is my first time here.' },
      { title: 'Ask about work', hi: 'आप क्या करते हैं?', latin: 'Aap kya karte hain?', en: 'What do you do?' },
      { title: 'Talk about family', hi: 'मैं अपने परिवार से बात कर रहा हूँ।', latin: 'Main apne parivaar se baat kar raha hoon.', en: 'I am talking with my family.' },
      { title: 'Make a later plan', hi: 'चलो, बाद में मिलते हैं।', latin: 'Chalo, baad mein milte hain.', en: 'Let us meet later.' },
      { title: 'Offer kindness', hi: 'आप बहुत दयालु हैं।', latin: 'Aap bahut dayaalu hain.', en: 'You are very kind.' },
    ],
  },
  {
    id: 'work', category: 'Work', title: 'Work with clarity', subtitle: 'Coordinate, ask questions, and make commitments', level: 'Intermediate', emoji: '💼', color: '#586b91', place: 'Workday · collaboration', words: ['बैठक', 'काम', 'कल'],
    lessons: [
      { title: 'Flag a delay', hi: 'मैं थोड़ी देर से आऊँगा।', latin: 'Main thodi der se aaoonga.', en: 'I will arrive a little late.' },
      { title: 'Start a meeting', hi: 'क्या हम बैठक शुरू करें?', latin: 'Kya hum baithak shuru karen?', en: 'Shall we start the meeting?' },
      { title: 'Send it later', hi: 'मैं आपको बाद में भेज दूँगा।', latin: 'Main aapko baad mein bhej doonga.', en: 'I will send it to you later.' },
      { title: 'Own a task', hi: 'मुझे इस पर काम करना है।', latin: 'Mujhe is par kaam karna hai.', en: 'I need to work on this.' },
      { title: 'Ask for an explanation', hi: 'क्या आप मुझे समझा सकते हैं?', latin: 'Kya aap mujhe samjha sakte hain?', en: 'Can you explain it to me?' },
      { title: 'Agree', hi: 'मैं सहमत हूँ।', latin: 'Main sahamat hoon.', en: 'I agree.' },
      { title: 'Ask a question', hi: 'मुझे एक सवाल है।', latin: 'Mujhe ek sawaal hai.', en: 'I have a question.' },
      { title: 'Check the deadline', hi: 'समय-सीमा क्या है?', latin: 'Samay-seema kya hai?', en: 'What is the deadline?' },
      { title: 'Commit to tomorrow', hi: 'हम इसे कल पूरा करेंगे।', latin: 'Hum ise kal poora karenge.', en: 'We will finish it tomorrow.' },
      { title: 'Praise good work', hi: 'बहुत अच्छा काम।', latin: 'Bahut achchha kaam.', en: 'Very good work.' },
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

export const plannedLessons: Scene[] = planSeeds.flatMap((plan) => plan.lessons.map((lesson, lessonIndex) => {
  const incorrectChoices = lesson.hi === 'मुझे मदद चाहिए।'
    ? [
      { hi: 'मैं तैयार नहीं हूँ।', latin: 'Main taiyaar nahin hoon.', en: 'I am not ready.' },
      { hi: 'कृपया दरवाज़ा बंद कीजिए।', latin: 'Kripya darwaaza band kijiye.', en: 'Please close the door.' },
    ]
    : [
      { hi: 'मुझे मदद चाहिए।', latin: 'Mujhe madad chahiye.', en: 'I need help.' },
      { hi: 'कृपया दरवाज़ा बंद कीजिए।', latin: 'Kripya darwaaza band kijiye.', en: 'Please close the door.' },
    ];
  return {
    id: lessonId(plan.id, lessonIndex),
    category: plan.category,
    words: plan.words,
    place: `${plan.place} · Lesson ${lessonIndex + 1} of 10`,
    title: lesson.title,
    subtitle: lesson.en,
    level: plan.level,
    emoji: plan.emoji,
    color: plan.color,
    beats: practiceTurns.map((practice) => ({
      npc: 'यह वाक्य बोलिए।',
      translation: 'Say this useful phrase.',
      prompt: practice.prompt(lesson.en),
      tip: practice.tip,
      choices: [
        { hi: lesson.hi, latin: lesson.latin, en: lesson.en, correct: true, reply: 'बहुत अच्छा।' },
        { ...incorrectChoices[0], correct: false, reply: 'करीब है—फिर से कोशिश कीजिए।' },
        { ...incorrectChoices[1], correct: false, reply: 'अर्थ फिर से पढ़िए, फिर कोशिश कीजिए।' },
      ],
    })),
  };
}));
