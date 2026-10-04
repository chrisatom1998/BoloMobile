// Managed by Bolo Lesson Creator. Edit lessons in the creator.
import type { Scene } from './scenes';

export const creatorLessons: Scene[] = [
  {
    "id": "plan-creator-3cd7660a-7108-4dd2-81f1-5c9f566c9b37-01",
    "title": "At the café",
    "subtitle": "Order, customize, and pay at cafés and restaurants",
    "category": "Food",
    "level": "Beginner",
    "emoji": "🍽️",
    "color": "#c86d32",
    "place": "A local café",
    "words": [
      "मेन्यू",
      "पानी",
      "बिल"
    ],
    "beats": [
      {
        "npc": "बगल वाली मेज़ की प्लेट में आपको कच्चे प्याज़ का ढेर लगा दिखता है।",
        "translation": "You spot raw onion piled high on the dish at the next table.",
        "mode": "choice",
        "prompt": "Choose the Hindi for “I need it without onions.”",
        "tip": "Practice the whole phrase: Mujhe bina pyaaz chahiye.",
        "choices": [
          {
            "hi": "मुझे बिना प्याज़ चाहिए।",
            "latin": "Mujhe bina pyaaz chahiye.",
            "en": "I need it without onions.",
            "correct": true,
            "reply": "बहुत अच्छा।"
          },
          {
            "hi": "मैं शाकाहारी हूँ।",
            "latin": "Main shaakahari hoon.",
            "en": "I am vegetarian.",
            "correct": false,
            "reply": "अर्थ फिर से पढ़िए, फिर कोशिश कीजिए।",
            "feedback": "This means “I am vegetarian.” Try the phrase for “I need it without onions.”"
          },
          {
            "hi": "मुझे एक मेन्यू दीजिए।",
            "latin": "Mujhe ek menu dijiye.",
            "en": "Please give me a menu.",
            "correct": false,
            "reply": "अर्थ फिर से पढ़िए, फिर कोशिश कीजिए।",
            "feedback": "This means “Please give me a menu.” Try the phrase for “I need it without onions.”"
          }
        ]
      },
      {
        "npc": "आप तीनों ने साथ खाना खाया और बिल मेज़ के ठीक बीचोंबीच आ जाता है।",
        "translation": "Three of you ate together and the bill lands in the middle.",
        "mode": "choice",
        "prompt": "Choose the Hindi for “Please split the bill.”",
        "tip": "Practice the whole phrase: Bill baant dijiye.",
        "choices": [
          {
            "hi": "मुझे पैक कर दीजिए।",
            "latin": "Mujhe pack kar dijiye.",
            "en": "Please pack this for me.",
            "correct": false,
            "reply": "अर्थ फिर से पढ़िए, फिर कोशिश कीजिए।",
            "feedback": "This means “Please pack this for me.” Try the phrase for “Please split the bill.”"
          },
          {
            "hi": "क्या मैं कार्ड से भुगतान कर सकता हूँ?",
            "latin": "Kya main card se bhugtaan kar sakta hoon?",
            "en": "Can I pay by card?",
            "correct": false,
            "reply": "अर्थ फिर से पढ़िए, फिर कोशिश कीजिए।",
            "feedback": "This means “Can I pay by card?” Try the phrase for “Please split the bill.”"
          },
          {
            "hi": "बिल बाँट दीजिए।",
            "latin": "Bill baant dijiye.",
            "en": "Please split the bill.",
            "correct": true,
            "reply": "बहुत अच्छा।"
          }
        ]
      },
      {
        "npc": "बोर्ड पर सब कुछ अच्छा लग रहा है और आपसे कुछ चुना ही नहीं जा रहा।",
        "translation": "Everything on the board looks good and you cannot choose.",
        "mode": "wordOrder",
        "prompt": "Put the words in order to say “What is good today?”",
        "tip": "Practice the whole phrase: Aaj kya achchha hai?",
        "choices": [
          {
            "hi": "आज क्या अच्छा है?",
            "latin": "Aaj kya achchha hai?",
            "en": "What is good today?",
            "correct": true,
            "reply": "बहुत अच्छा।"
          },
          {
            "hi": "मैं शाकाहारी हूँ।",
            "latin": "Main shaakahari hoon.",
            "en": "I am vegetarian.",
            "correct": false,
            "reply": "अर्थ फिर से पढ़िए, फिर कोशिश कीजिए।",
            "feedback": "This means “I am vegetarian.” Try the phrase for “What is good today?”"
          },
          {
            "hi": "मुझे पैक कर दीजिए।",
            "latin": "Mujhe pack kar dijiye.",
            "en": "Please pack this for me.",
            "correct": false,
            "reply": "अर्थ फिर से पढ़िए, फिर कोशिश कीजिए।",
            "feedback": "This means “Please pack this for me.” Try the phrase for “What is good today?”"
          }
        ]
      },
      {
        "npc": "आधी थाली अभी बची है और आपका पेट पहले ही भर चुका है।",
        "translation": "Half the thali is left and you are already full.",
        "mode": "recallReveal",
        "prompt": "Say “Please pack this for me.” in Hindi before revealing the answer.",
        "tip": "Practice the whole phrase: Mujhe pack kar dijiye.",
        "choices": [
          {
            "hi": "मुझे पैक कर दीजिए।",
            "latin": "Mujhe pack kar dijiye.",
            "en": "Please pack this for me.",
            "correct": true,
            "reply": "बहुत अच्छा।"
          },
          {
            "hi": "बिल बाँट दीजिए।",
            "latin": "Bill baant dijiye.",
            "en": "Please split the bill.",
            "correct": false,
            "reply": "अर्थ फिर से पढ़िए, फिर कोशिश कीजिए।",
            "feedback": "This means “Please split the bill.” Try the phrase for “Please pack this for me.”"
          },
          {
            "hi": "मैं शाकाहारी हूँ।",
            "latin": "Main shaakahari hoon.",
            "en": "I am vegetarian.",
            "correct": false,
            "reply": "अर्थ फिर से पढ़िए, फिर कोशिश कीजिए।",
            "feedback": "This means “I am vegetarian.” Try the phrase for “Please pack this for me.”"
          }
        ]
      },
      {
        "npc": "जब से स्टार्टर आए हैं, आपका गिलास खाली ही पड़ा है।",
        "translation": "Your glass has been empty since the starters arrived.",
        "mode": "choice",
        "prompt": "Choose the Hindi for “Water, please.”",
        "tip": "Practice the whole phrase: Paani dijiye, kripya.",
        "choices": [
          {
            "hi": "क्या मैं कार्ड से भुगतान कर सकता हूँ?",
            "latin": "Kya main card se bhugtaan kar sakta hoon?",
            "en": "Can I pay by card?",
            "correct": false,
            "reply": "अर्थ फिर से पढ़िए, फिर कोशिश कीजिए।",
            "feedback": "This means “Can I pay by card?” Try the phrase for “Water, please.”"
          },
          {
            "hi": "मैं शाकाहारी हूँ।",
            "latin": "Main shaakahari hoon.",
            "en": "I am vegetarian.",
            "correct": false,
            "reply": "अर्थ फिर से पढ़िए, फिर कोशिश कीजिए।",
            "feedback": "This means “I am vegetarian.” Try the phrase for “Water, please.”"
          },
          {
            "hi": "पानी दीजिए, कृपया।",
            "latin": "Paani dijiye, kripya.",
            "en": "Water, please.",
            "correct": true,
            "reply": "बहुत अच्छा।"
          }
        ]
      }
    ]
  },
  {
    "id": "plan-creator-ec34bafb-6f2e-4506-b1d4-480aa7f040f0-01",
    "title": "Daily life · practice",
    "subtitle": "Describe routines, weather, and plans at home",
    "category": "Everyday",
    "level": "Beginner",
    "emoji": "🏠",
    "color": "#63754c",
    "place": "Home · every day",
    "words": [
      "सुबह",
      "घर",
      "कल"
    ],
    "beats": [
      {
        "npc": "डेडलाइन सिर पर है और ठीक उसी वक़्त कोई दरवाज़ा खटखटा देता है।",
        "translation": "Someone knocks while you are in the middle of a deadline.",
        "mode": "choice",
        "prompt": "Choose the Hindi for “I am busy right now.”",
        "tip": "Practice the whole phrase: Main abhi vyast hoon.",
        "choices": [
          {
            "hi": "मैं अभी व्यस्त हूँ।",
            "latin": "Main abhi vyast hoon.",
            "en": "I am busy right now.",
            "correct": true,
            "reply": "बहुत अच्छा।"
          },
          {
            "hi": "मुझे चाय बनानी है।",
            "latin": "Mujhe chai banaani hai.",
            "en": "I need to make tea.",
            "correct": false,
            "reply": "अर्थ फिर से पढ़िए, फिर कोशिश कीजिए।",
            "feedback": "This means “I need to make tea.” Try the phrase for “I am busy right now.”"
          },
          {
            "hi": "कृपया खिड़की बंद कर दीजिए।",
            "latin": "Kripya khidki band kar dijiye.",
            "en": "Please close the window.",
            "correct": false,
            "reply": "अर्थ फिर से पढ़िए, फिर कोशिश कीजिए।",
            "feedback": "This means “Please close the window.” Try the phrase for “I am busy right now.”"
          }
        ]
      },
      {
        "npc": "फ़ोन अब रखना ही पड़ेगा, पर बात अभी अधूरी है।",
        "translation": "The call has to end but the conversation is not finished.",
        "mode": "choice",
        "prompt": "Choose the Hindi for “We will talk later.”",
        "tip": "Practice the whole phrase: Hum baad mein baat karenge.",
        "choices": [
          {
            "hi": "बाहर बारिश हो रही है।",
            "latin": "Baahar baarish ho rahi hai.",
            "en": "It is raining outside.",
            "correct": false,
            "reply": "अर्थ फिर से पढ़िए, फिर कोशिश कीजिए।",
            "feedback": "This means “It is raining outside.” Try the phrase for “We will talk later.”"
          },
          {
            "hi": "हम बाद में बात करेंगे।",
            "latin": "Hum baad mein baat karenge.",
            "en": "We will talk later.",
            "correct": true,
            "reply": "बहुत अच्छा।"
          },
          {
            "hi": "मैं घर पर काम करता हूँ।",
            "latin": "Main ghar par kaam karta hoon.",
            "en": "I work from home.",
            "correct": false,
            "reply": "अर्थ फिर से पढ़िए, फिर कोशिश कीजिए।",
            "feedback": "This means “I work from home.” Try the phrase for “We will talk later.”"
          }
        ]
      },
      {
        "npc": "धूल अंदर आ रही है और मेज़ पर रखे काग़ज़ उड़ने लगे हैं।",
        "translation": "Dust is blowing in and papers are lifting off the table.",
        "mode": "choice",
        "prompt": "Choose the Hindi for “Please close the window.”",
        "tip": "Practice the whole phrase: Kripya khidki band kar dijiye.",
        "choices": [
          {
            "hi": "कृपया खिड़की बंद कर दीजिए।",
            "latin": "Kripya khidki band kar dijiye.",
            "en": "Please close the window.",
            "correct": true,
            "reply": "बहुत अच्छा।"
          },
          {
            "hi": "आज बहुत गर्मी है।",
            "latin": "Aaj bahut garmi hai.",
            "en": "It is very hot today.",
            "correct": false,
            "reply": "अर्थ फिर से पढ़िए, फिर कोशिश कीजिए।",
            "feedback": "This means “It is very hot today.” Try the phrase for “Please close the window.”"
          },
          {
            "hi": "मैं सुबह जल्दी उठता हूँ।",
            "latin": "Main subah jaldi uthta hoon.",
            "en": "I wake up early in the morning.",
            "correct": false,
            "reply": "अर्थ फिर से पढ़िए, फिर कोशिश कीजिए।",
            "feedback": "This means “I wake up early in the morning.” Try the phrase for “Please close the window.”"
          }
        ]
      },
      {
        "npc": "केतली बिल्कुल ख़ाली पड़ी है और मेहमान रास्ते में हैं।",
        "translation": "The kettle is empty and guests are already on their way over.",
        "mode": "choice",
        "prompt": "Choose the Hindi for “I need to make tea.”",
        "tip": "Practice the whole phrase: Mujhe chai banaani hai.",
        "choices": [
          {
            "hi": "हम बाद में बात करेंगे।",
            "latin": "Hum baad mein baat karenge.",
            "en": "We will talk later.",
            "correct": false,
            "reply": "अर्थ फिर से पढ़िए, फिर कोशिश कीजिए।",
            "feedback": "This means “We will talk later.” Try the phrase for “I need to make tea.”"
          },
          {
            "hi": "मुझे चाय बनानी है।",
            "latin": "Mujhe chai banaani hai.",
            "en": "I need to make tea.",
            "correct": true,
            "reply": "बहुत अच्छा।"
          },
          {
            "hi": "मैं अभी व्यस्त हूँ।",
            "latin": "Main abhi vyast hoon.",
            "en": "I am busy right now.",
            "correct": false,
            "reply": "अर्थ फिर से पढ़िए, फिर कोशिश कीजिए।",
            "feedback": "This means “I am busy right now.” Try the phrase for “I need to make tea.”"
          }
        ]
      },
      {
        "npc": "नाश्ते के बाद से आप एक पल के लिए भी नहीं बैठे हैं।",
        "translation": "You have been on your feet since breakfast.",
        "mode": "choice",
        "prompt": "Choose the Hindi for “I need a little rest.”",
        "tip": "Practice the whole phrase: Mujhe thoda aaraam chahiye.",
        "choices": [
          {
            "hi": "हम बाद में बात करेंगे।",
            "latin": "Hum baad mein baat karenge.",
            "en": "We will talk later.",
            "correct": false,
            "reply": "अर्थ फिर से पढ़िए, फिर कोशिश कीजिए।",
            "feedback": "This means “We will talk later.” Try the phrase for “I need a little rest.”"
          },
          {
            "hi": "बाहर बारिश हो रही है।",
            "latin": "Baahar baarish ho rahi hai.",
            "en": "It is raining outside.",
            "correct": false,
            "reply": "अर्थ फिर से पढ़िए, फिर कोशिश कीजिए।",
            "feedback": "This means “It is raining outside.” Try the phrase for “I need a little rest.”"
          },
          {
            "hi": "मुझे थोड़ा आराम चाहिए।",
            "latin": "Mujhe thoda aaraam chahiye.",
            "en": "I need a little rest.",
            "correct": true,
            "reply": "बहुत अच्छा।"
          }
        ]
      },
      {
        "npc": "पंखा पूरी स्पीड पर चल रहा है, फिर भी ज़रा भी राहत नहीं मिल रही।",
        "translation": "The fan is on high and it is barely helping.",
        "mode": "choice",
        "prompt": "Choose the Hindi for “It is very hot today.”",
        "tip": "Practice the whole phrase: Aaj bahut garmi hai.",
        "choices": [
          {
            "hi": "आज बहुत गर्मी है।",
            "latin": "Aaj bahut garmi hai.",
            "en": "It is very hot today.",
            "correct": true,
            "reply": "बहुत अच्छा।"
          },
          {
            "hi": "हम बाद में बात करेंगे।",
            "latin": "Hum baad mein baat karenge.",
            "en": "We will talk later.",
            "correct": false,
            "reply": "अर्थ फिर से पढ़िए, फिर कोशिश कीजिए।",
            "feedback": "This means “We will talk later.” Try the phrase for “It is very hot today.”"
          },
          {
            "hi": "मुझे थोड़ा आराम चाहिए।",
            "latin": "Mujhe thoda aaraam chahiye.",
            "en": "I need a little rest.",
            "correct": false,
            "reply": "अर्थ फिर से पढ़िए, फिर कोशिश कीजिए।",
            "feedback": "This means “I need a little rest.” Try the phrase for “It is very hot today.”"
          }
        ]
      },
      {
        "npc": "दरवाज़े पर कोई पूछ रहा है कि छाता साथ ले जाना पड़ेगा क्या।",
        "translation": "Someone at the door asks whether they need an umbrella.",
        "mode": "choice",
        "prompt": "Choose the Hindi for “It is raining outside.”",
        "tip": "Practice the whole phrase: Baahar baarish ho rahi hai.",
        "choices": [
          {
            "hi": "आज बहुत गर्मी है।",
            "latin": "Aaj bahut garmi hai.",
            "en": "It is very hot today.",
            "correct": false,
            "reply": "अर्थ फिर से पढ़िए, फिर कोशिश कीजिए।",
            "feedback": "This means “It is very hot today.” Try the phrase for “It is raining outside.”"
          },
          {
            "hi": "मैं अभी व्यस्त हूँ।",
            "latin": "Main abhi vyast hoon.",
            "en": "I am busy right now.",
            "correct": false,
            "reply": "अर्थ फिर से पढ़िए, फिर कोशिश कीजिए।",
            "feedback": "This means “I am busy right now.” Try the phrase for “It is raining outside.”"
          },
          {
            "hi": "बाहर बारिश हो रही है।",
            "latin": "Baahar baarish ho rahi hai.",
            "en": "It is raining outside.",
            "correct": true,
            "reply": "बहुत अच्छा।"
          }
        ]
      },
      {
        "npc": "पड़ोसी हैरान हैं कि आप सुबह कभी घर से निकलते ही नहीं।",
        "translation": "A neighbor wonders why you never leave in the morning.",
        "mode": "choice",
        "prompt": "Choose the Hindi for “I work from home.”",
        "tip": "Practice the whole phrase: Main ghar par kaam karta hoon.",
        "choices": [
          {
            "hi": "मैं सुबह जल्दी उठता हूँ।",
            "latin": "Main subah jaldi uthta hoon.",
            "en": "I wake up early in the morning.",
            "correct": false,
            "reply": "अर्थ फिर से पढ़िए, फिर कोशिश कीजिए।",
            "feedback": "This means “I wake up early in the morning.” Try the phrase for “I work from home.”"
          },
          {
            "hi": "मैं घर पर काम करता हूँ।",
            "latin": "Main ghar par kaam karta hoon.",
            "en": "I work from home.",
            "correct": true,
            "reply": "बहुत अच्छा।"
          },
          {
            "hi": "आज बहुत गर्मी है।",
            "latin": "Aaj bahut garmi hai.",
            "en": "It is very hot today.",
            "correct": false,
            "reply": "अर्थ फिर से पढ़िए, फिर कोशिश कीजिए।",
            "feedback": "This means “It is very hot today.” Try the phrase for “I work from home.”"
          }
        ]
      },
      {
        "npc": "एक नया दोस्त पूछता है कि आपका पूरा दिन आख़िर बीतता कैसे है।",
        "translation": "A new friend asks what your days actually look like.",
        "mode": "choice",
        "prompt": "Choose the Hindi for “I wake up early in the morning.”",
        "tip": "Practice the whole phrase: Main subah jaldi uthta hoon.",
        "choices": [
          {
            "hi": "कृपया खिड़की बंद कर दीजिए।",
            "latin": "Kripya khidki band kar dijiye.",
            "en": "Please close the window.",
            "correct": false,
            "reply": "अर्थ फिर से पढ़िए, फिर कोशिश कीजिए।",
            "feedback": "This means “Please close the window.” Try the phrase for “I wake up early in the morning.”"
          },
          {
            "hi": "मैं सुबह जल्दी उठता हूँ।",
            "latin": "Main subah jaldi uthta hoon.",
            "en": "I wake up early in the morning.",
            "correct": true,
            "reply": "बहुत अच्छा।"
          },
          {
            "hi": "हम बाद में बात करेंगे।",
            "latin": "Hum baad mein baat karenge.",
            "en": "We will talk later.",
            "correct": false,
            "reply": "अर्थ फिर से पढ़िए, फिर कोशिश कीजिए।",
            "feedback": "This means “We will talk later.” Try the phrase for “I wake up early in the morning.”"
          }
        ]
      },
      {
        "npc": "गेट पर विदा लेते-लेते कल का प्लान आधा बन चुका है।",
        "translation": "You are parting at the gate with plans already half made.",
        "mode": "choice",
        "prompt": "Choose the Hindi for “See you tomorrow.”",
        "tip": "Practice the whole phrase: Kal milte hain.",
        "choices": [
          {
            "hi": "मैं सुबह जल्दी उठता हूँ।",
            "latin": "Main subah jaldi uthta hoon.",
            "en": "I wake up early in the morning.",
            "correct": false,
            "reply": "अर्थ फिर से पढ़िए, फिर कोशिश कीजिए।",
            "feedback": "This means “I wake up early in the morning.” Try the phrase for “See you tomorrow.”"
          },
          {
            "hi": "कल मिलते हैं।",
            "latin": "Kal milte hain.",
            "en": "See you tomorrow.",
            "correct": true,
            "reply": "बहुत अच्छा।"
          },
          {
            "hi": "मैं अभी व्यस्त हूँ।",
            "latin": "Main abhi vyast hoon.",
            "en": "I am busy right now.",
            "correct": false,
            "reply": "अर्थ फिर से पढ़िए, फिर कोशिश कीजिए।",
            "feedback": "This means “I am busy right now.” Try the phrase for “See you tomorrow.”"
          }
        ]
      }
    ]
  }
];
